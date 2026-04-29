import type { WhiteboardDelta, PendingUpdate, ArchivedMessage } from './types'
import { getWhiteboard, savePendingUpdate, commitPendingUpdate, autoCommitDueUpdates } from './whiteboard'
import { archiveMessages, getArchive } from './archive'
import { getConfig } from './config'
import { buildUpdatePrompt, buildArchiveMetadataPrompt } from './prompts'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

// ─── Post-Generation Update ─────────────────────────────────────────────────

export async function processGenerationEnd(
  chatId: string,
  messageId?: string
): Promise<void> {
  const config = await getConfig()
  if (!config.enabled) return

  try {
    // Run whiteboard update and archival check concurrently
    await Promise.all([
      updateWhiteboard(chatId, messageId),
      checkAndArchiveMessages(chatId),
    ])

    // Auto-commit any pending updates whose review window has elapsed
    await autoCommitDueUpdates(chatId)
  } catch (err) {
    spindle.log.error(`Post-generation processing failed: ${err}`)
  }
}

// ─── Whiteboard Update ──────────────────────────────────────────────────────

async function updateWhiteboard(chatId: string, messageId?: string): Promise<void> {
  const config = await getConfig()
  const whiteboard = await getWhiteboard(chatId)

  // Fetch recent messages for context
  const allMessages = await spindle.chat.getMessages(chatId)
  if (allMessages.length < 2) return

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

  const updatePrompt = buildUpdatePrompt(
    whiteboard,
    lastUser.content,
    lastAssistant.content,
    recentContext
  )

  const cfg = await getConfig()

  let delta: WhiteboardDelta

  try {
    const response = await spindle.generate.quiet({
      type: 'quiet',
      messages: [
        { role: 'system', content: updatePrompt },
        { role: 'user', content: 'Analyze the latest exchange and produce the whiteboard delta.' },
      ],
      parameters: { temperature: 0.3, max_tokens: 4000 },
      connection_id: cfg.updaterConnectionId,
    }) as { content: string }
    // Strip markdown code fences if the model wraps its response
    let content = response.content.trim()
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    }
    delta = JSON.parse(content)
  } catch (err) {
    spindle.log.error(`Whiteboard update generation failed: ${err}`)
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
    })

    // Auto-commit after the review window
    setTimeout(async () => {
      try {
        await commitPendingUpdate(chatId, pendingUpdate.id)
        spindle.sendToFrontend({
          type: 'update_committed',
          data: { updateId: pendingUpdate.id, chatId },
        })
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
    })
  }
}

// ─── Archive Check ──────────────────────────────────────────────────────────

async function checkAndArchiveMessages(chatId: string): Promise<void> {
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
      const response = await spindle.generate.quiet({
        type: 'quiet',
        messages: [
          { role: 'system', content: metadataPrompt },
          { role: 'user', content: 'Extract metadata.' },
        ],
        parameters: { temperature: 0.1, max_tokens: 500 },
        connection_id: metadataCfg.updaterConnectionId,
      }) as { content: string }
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
      tokenEstimate: Math.ceil(msg.content.length / 4), // rough estimate, refined later
    })
  }

  await archiveMessages(chatId, archivedMessages)
}
