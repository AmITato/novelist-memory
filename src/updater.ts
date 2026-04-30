import { countTokens } from './tokens'
import type { WhiteboardDelta, PendingUpdate, ArchivedMessage } from './types'
import { getWhiteboard, savePendingUpdate, commitPendingUpdate, autoCommitDueUpdates, getCalibrationBank } from './whiteboard'
import { archiveMessages, getArchive } from './archive'
import { getConfig, resolveBackgroundConnectionId } from './config'
import { buildUpdatePrompt, buildArchiveMetadataPrompt } from './prompts'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

// ─── Post-Generation Update ─────────────────────────────────────────────────

export async function processGenerationEnd(
  chatId: string,
  messageId?: string,
  userId?: string
): Promise<void> {
  const config = await getConfig()
  if (!config.enabled) return

  try {
    spindle.log.info(`[NovelistMemory] Processing generation end for chat ${chatId}, message ${messageId ?? 'unknown'}`)

    // Run whiteboard update and archival check concurrently
    await Promise.all([
      updateWhiteboard(chatId, messageId, userId),
      checkAndArchiveMessages(chatId, userId),
    ])

    // Auto-commit any pending updates whose review window has elapsed
    await autoCommitDueUpdates(chatId)
  } catch (err) {
    spindle.log.error(`[NovelistMemory] Post-generation processing failed: ${err}`)
  }
}

// ─── Whiteboard Update ──────────────────────────────────────────────────────

async function updateWhiteboard(chatId: string, messageId?: string, userId?: string): Promise<void> {
  const config = await getConfig()
  const whiteboard = await getWhiteboard(chatId)

  // Fetch recent messages for context
  const allMessages = await spindle.chat.getMessages(chatId)
  spindle.log.info(`[NovelistMemory] Got ${allMessages.length} messages for chat ${chatId}`)
  // [DIAG] dump all messages from getMessages in updater context
  spindle.log.info(`[NovelistMemory][DIAG] updateWhiteboard: ${allMessages.length} messages for chat ${chatId}`)
  for (let i = 0; i < allMessages.length; i++) {
    const m = allMessages[i] as { id: string, role: string, content: string }
    spindle.log.info(`[NovelistMemory][DIAG]   [${i}] id=${m.id} role=${m.role} len=${m.content?.length ?? 0} preview="${(m.content ?? '').slice(0, 150).replace(/\n/g, '\\n')}"`)
  }
  if (allMessages.length < 2) {
    spindle.log.info('[NovelistMemory] Not enough messages for whiteboard update (need at least 2)')
    return
  }

  // Get the last exchange (user + assistant)
  const recentMessages = allMessages.slice(-Math.min(allMessages.length, config.slidingWindowSize * 2))
  const lastAssistant = recentMessages.filter((m: { role: string }) => m.role === 'assistant').pop()
  const lastUser = recentMessages.filter((m: { role: string }) => m.role === 'user').pop()

  if (!lastAssistant || !lastUser) return

  // Build context from recent messages (excluding the last exchange)
  const contextMessages = recentMessages.slice(0, -2)
  const recentContext = contextMessages
    .map((m: { role: string, content: string }) => `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`)
    .join('\n\n')

  // Determine message indices for the latest exchange so Chronicle entries
  // can be tagged with sourceMessageRange for direct retrieval
  const userIndex = allMessages.findIndex((m: { id: string }) => m.id === (lastUser as { id: string }).id)
  const assistantIndex = allMessages.findIndex((m: { id: string }) => m.id === (lastAssistant as { id: string }).id)
  const messageRange: [number, number] | undefined =
    userIndex >= 0 && assistantIndex >= 0
      ? [Math.min(userIndex, assistantIndex), Math.max(userIndex, assistantIndex)]
      : undefined

  const calibrationBank = await getCalibrationBank(chatId)

  // Fetch character card + persona if the toggle is on — gives the sidecar
  // updater richer context for writing character-specific whiteboard entries.
  let characterContext: { name: string, description: string, personality: string, scenario: string, persona?: string } | undefined
  if (config.includeCharacterContext) {
    try {
      const chat = await spindle.chats.get(chatId) as { character_id?: string } | null
      if (chat?.character_id) {
        const character = await spindle.characters.get(chat.character_id, userId)
        if (character) {
          characterContext = {
            name: character.name,
            description: character.description,
            personality: character.personality,
            scenario: character.scenario,
          }
          // Also fetch the active persona for user-side context
          try {
            const persona = await spindle.personas.getActive(userId)
            if (persona) characterContext.persona = `${persona.name}${persona.description ? ': ' + persona.description : ''}`
          } catch { /* no persona configured */ }
        }
      }
    } catch (err) {
      spindle.log.warn(`[NovelistMemory] Failed to fetch character context: ${err}`)
    }
  }

  // [DIAG] dump whiteboard state and exchange content before prompt build
  spindle.log.info(`[NovelistMemory][DIAG] whiteboard for ${chatId}: chronicle=${whiteboard.chronicle.length} threads=${whiteboard.threads.length} hearts=${whiteboard.hearts.length} notes=${whiteboard.authorNotes.length}`)
  for (const c of whiteboard.chronicle) {
    spindle.log.info(`[NovelistMemory][DIAG]   chronicle id=${c.id} summary="${(c.summary ?? '').slice(0, 120).replace(/\n/g, '\\n')}"`)
  }
  spindle.log.info(`[NovelistMemory][DIAG] lastUser id=${(lastUser as { id: string }).id} len=${lastUser.content?.length ?? 0} preview="${(lastUser.content ?? '').slice(0, 200).replace(/\n/g, '\\n')}"`)
  spindle.log.info(`[NovelistMemory][DIAG] lastAssistant id=${(lastAssistant as { id: string }).id} len=${lastAssistant.content?.length ?? 0} preview="${(lastAssistant.content ?? '').slice(0, 200).replace(/\n/g, '\\n')}"`)
  spindle.log.info(`[NovelistMemory][DIAG] messageRange=${JSON.stringify(messageRange)} contextLen=${recentContext.length}`)

  const updatePrompt = buildUpdatePrompt(
    whiteboard,
    lastUser.content,
    lastAssistant.content,
    recentContext,
    messageRange,
    calibrationBank,
    characterContext,
  )

  // [DIAG] log prompt size and edges
  spindle.log.info(`[NovelistMemory][DIAG] prompt len=${updatePrompt.length}`)
  spindle.log.info(`[NovelistMemory][DIAG] prompt FIRST 500: "${updatePrompt.slice(0, 500).replace(/\n/g, '\\n')}"`)
  spindle.log.info(`[NovelistMemory][DIAG] prompt LAST 500: "${updatePrompt.slice(-500).replace(/\n/g, '\\n')}"`)

  const connectionId = await resolveBackgroundConnectionId(config.updaterConnectionId, userId)
  spindle.log.info(`[NovelistMemory] Using connection for updater: ${connectionId ?? '(active connection fallback)'}`)

  let delta: WhiteboardDelta

  try {
    const genRequest: Record<string, unknown> = {
      messages: [
        { role: 'system', content: updatePrompt },
        { role: 'user', content: 'Analyze the latest exchange and produce the whiteboard delta.' },
      ],
      parameters: { temperature: config.updaterTemperature ?? 0.3, max_tokens: 4000 },
    }
    if (connectionId) genRequest.connection_id = connectionId
    if (userId) genRequest.userId = userId

    spindle.log.info('[NovelistMemory] Sending whiteboard update quiet gen...')
    const response = await spindle.generate.quiet(genRequest) as { content: string }
    spindle.log.info(`[NovelistMemory] Quiet gen response received (${response.content?.length ?? 0} chars)`)

    // Strip markdown code fences if the model wraps its response
    let content = response.content.trim()
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    }
    delta = JSON.parse(content)
    spindle.log.info(`[NovelistMemory] Parsed whiteboard delta successfully`)
  } catch (err) {
    spindle.log.error(`[NovelistMemory] Whiteboard update generation failed: ${String(err)}`)
    if (err instanceof Error) spindle.log.error(`[NovelistMemory] Stack: ${err.stack}`)
    return
  }

  // Validate the delta has actual content
  const hasContent = Object.values(delta).some(v => v !== undefined && v !== null)
  if (!hasContent) {
    spindle.log.info('No whiteboard changes detected for this exchange.')
    return
  }

  const pendingUpdate: PendingUpdate = {
    id: `upd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    chatId,
    timestamp: new Date().toISOString(),
    changes: delta,
    sourceMessageId: messageId,
    status: 'pending',
    autoCommitAt: config.autoCommitUpdates
      ? Date.now() + config.updateReviewWindowMs
      : undefined,
  }

  await savePendingUpdate(pendingUpdate)

  // If auto-commit is on, schedule the commit
  if (config.autoCommitUpdates) {
    // Notify frontend about the pending update
    spindle.sendToFrontend({
      type: 'pending_update',
      data: {
        updateId: pendingUpdate.id,
        chatId,
        changes: delta,
        autoCommitAt: pendingUpdate.autoCommitAt,
      },
    }, userId)

    // Auto-commit after the review window
    setTimeout(async () => {
      try {
        await commitPendingUpdate(chatId, pendingUpdate.id)
        spindle.sendToFrontend({
          type: 'update_committed',
          data: { updateId: pendingUpdate.id, chatId },
        }, userId)
        spindle.log.info(`Auto-committed whiteboard update ${pendingUpdate.id}`)
      } catch {
        // Already committed or rejected by user — that's fine
      }
    }, config.updateReviewWindowMs)
  } else {
    spindle.sendToFrontend({
      type: 'pending_update',
      data: {
        updateId: pendingUpdate.id,
        chatId,
        changes: delta,
        requiresReview: true,
      },
    }, userId)
  }
}

// ─── Archive Check ──────────────────────────────────────────────────────────

async function checkAndArchiveMessages(chatId: string, userId?: string): Promise<void> {
  const config = await getConfig()
  const allMessages = await spindle.chat.getMessages(chatId)
  const archive = await getArchive(chatId)
  const whiteboard = await getWhiteboard(chatId)

  // Determine which messages should be archived
  // Keep the last slidingWindowSize exchanges (x2 for user+assistant) in active context
  const activeWindowSize = config.slidingWindowSize * 2
  if (allMessages.length <= activeWindowSize) return

  const messagesToArchive = allMessages.slice(0, allMessages.length - activeWindowSize)
  const existingArchivedIds = new Set(archive.messages.map(m => m.messageId))
  const newMessages = messagesToArchive.filter((m: { id: string }) => !existingArchivedIds.has(m.id))

  if (newMessages.length === 0) return

  // Extract metadata for each new message
  const archivedMessages: ArchivedMessage[] = []

  for (const msg of newMessages) {
    const msgIndex = allMessages.findIndex((m: { id: string }) => m.id === msg.id)

    let metadata: {
      inStoryTimestamp: string | null
      charactersPresent: string[]
      sceneDescriptor: string
      emotionalRegister: string
      activeThreads: string[]
    }

    try {
      const metadataRole = msg.role === 'system' ? 'user' : msg.role
      const metadataPrompt = buildArchiveMetadataPrompt(
        msg.content,
        metadataRole as 'user' | 'assistant',
        msgIndex,
        whiteboard
      )

      const metadataCfg = await getConfig()
      const metaConnId = await resolveBackgroundConnectionId(metadataCfg.updaterConnectionId, userId)
      const metaGenRequest: Record<string, unknown> = {
        messages: [
          { role: 'system', content: metadataPrompt },
          { role: 'user', content: 'Extract metadata.' },
        ],
        parameters: { temperature: 0.1, max_tokens: 500 },
      }
      if (metaConnId) metaGenRequest.connection_id = metaConnId
      if (userId) metaGenRequest.userId = userId
      const response = await spindle.generate.quiet(metaGenRequest) as { content: string }
      let content = response.content.trim()
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
      }
      metadata = JSON.parse(content)
    } catch {
      // Fallback: basic metadata without LLM
      metadata = {
        inStoryTimestamp: null,
        charactersPresent: [],
        sceneDescriptor: `${msg.role} message at index ${msgIndex}`,
        emotionalRegister: 'neutral',
        activeThreads: [],
      }
    }

    archivedMessages.push({
      messageIndex: msgIndex,
      messageId: msg.id,
      role: msg.role,
      inStoryTimestamp: metadata.inStoryTimestamp ?? undefined,
      charactersPresent: metadata.charactersPresent,
      sceneDescriptor: metadata.sceneDescriptor,
      emotionalRegister: metadata.emotionalRegister,
      activeThreads: metadata.activeThreads,
      content: msg.content,
      tokenEstimate: (await countTokens(msg.content, userId)).count,
    })
  }

  await archiveMessages(chatId, archivedMessages)
}
