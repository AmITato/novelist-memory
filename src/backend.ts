import { getWhiteboard, serializeWhiteboard, commitPendingUpdate, rejectPendingUpdate, saveWhiteboard, createEmptyWhiteboard, applyDelta, savePendingUpdate, getPendingUpdates } from './whiteboard'
import { queryIntern, formatInternResults } from './intern'
import { processGenerationEnd } from './updater'
import { getConfig, saveConfig, invalidateConfigCache } from './config'
import { getArchiveStats, getArchivedMessagesByRange } from './archive'
import { createSnapshot, getSnapshotForSwipe, getPreMessageState, getLatestSnapshotForMessage, getSnapshots, removeSnapshotsForMessage, seedFromParent, pruneSnapshots } from './snapshots'
import { countTokens } from './tokens'
import type { NovelistConfig, Whiteboard, WhiteboardDelta, PendingUpdate } from './types'
import type { ToolInvocationPayloadDTO } from 'lumiverse-spindle-types'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

// ─── Initialization ─────────────────────────────────────────────────────────

spindle.log.info('Novelist Memory starting...')

// Ensure storage directories exist
await spindle.storage.mkdir('whiteboards')
await spindle.storage.mkdir('archives')
await spindle.storage.mkdir('pending')
await spindle.storage.mkdir('snapshots')
await spindle.storage.mkdir('calibration')

// ─── Active Generation State ────────────────────────────────────────────────
// Track the chatId of the current generation so tool handlers can access it
// without relying on getActive() (which needs userId for operator-scoped extensions).
let activeGenerationChatId: string | null = null
let activeGenerationMessageId: string | null = null
let activeGenerationIsRegen: boolean = false
let activeGenerationType: string | null = null
let pendingDirectDeltas: WhiteboardDelta[] = []
// Captured at GENERATION_STARTED (post-rewind for regens) — represents the
// whiteboard state BEFORE this generation's deltas are applied. Saved into
// the snapshot at GENERATION_ENDED so future regens can rewind precisely.
let preGenerationState: Whiteboard | null = null
// Last known userId — captured from any handler that receives it (GENERATION_ENDED,
// onFrontendMessage, etc.). Used to target sendToFrontend calls from event handlers
// that don't receive userId directly (GENERATION_STARTED, MESSAGE_SWIPED, tool handlers).
// Without this, broadcast sendToFrontend calls may not reach the frontend drawer.
let lastKnownUserId: string | null = null

// ─── Context Handler (Pre-Assembly) ─────────────────────────────────────────
// Seeds the Whiteboard data into the generation context BEFORE prompt assembly.
// This gives the assembler awareness of the narrative state.

spindle.registerContextHandler(async (context) => {
  const chatId = (context as { chatId?: string }).chatId

  // Always capture the chatId for tool handlers, even if whiteboard is disabled
  if (chatId) activeGenerationChatId = chatId

  const config = await getConfig()
  if (!config.enabled) return context
  if (!chatId) return context

  // Skip injection for impersonate unless the toggle is on
  if (activeGenerationType === 'impersonate' && !config.injectOnImpersonate) return context

  const whiteboard = await getWhiteboard(chatId)
  const isEmpty = whiteboard.chronicle.length === 0
    && whiteboard.threads.length === 0
    && whiteboard.hearts.length === 0

  if (isEmpty) return context

  return {
    ...(context as Record<string, unknown>),
    novelistMemory: {
      whiteboard,
      serialized: serializeWhiteboard(whiteboard),
    },
  }
}, 50) // Run early so other extensions can see our data

// ─── Interceptor (Post-Assembly) ─────────────────────────────────────────────
// Injects the serialized Whiteboard as a system message into the final message
// array, right after the main system prompt. This is what the model actually sees.

spindle.registerInterceptor(async (messages, context) => {
  const config = await getConfig()
  if (!config.enabled) return messages

  const chatId = (context as { chatId?: string }).chatId
  if (!chatId) return messages

  // Skip injection for impersonate unless the toggle is on
  if (activeGenerationType === 'impersonate' && !config.injectOnImpersonate) return messages

  const whiteboard = await getWhiteboard(chatId)
  const isEmpty = whiteboard.chronicle.length === 0
    && whiteboard.threads.length === 0
    && whiteboard.hearts.length === 0

  if (isEmpty) return messages

  const serialized = serializeWhiteboard(whiteboard)

  // Token budget check — uses real tokenizer when available, falls back to char/4
  const tokenResult = await countTokens(serialized)
  if (tokenResult.count > config.whiteboardTokenBudget) {
    spindle.log.warn(`Whiteboard exceeds token budget (${tokenResult.count} > ${config.whiteboardTokenBudget}, tokenizer: ${tokenResult.tokenizer}). Consider compaction.`)
    // Still inject — but warn. Future: auto-compact.
  }

  // Inject after the first system message (the main system prompt)
  const firstSystemIndex = messages.findIndex(m => m.role === 'system')
  const insertIndex = firstSystemIndex >= 0 ? firstSystemIndex + 1 : 0

  const injectedMessage = {
    role: 'system' as const,
    content: serialized,
  }

  const result = [...messages]
  result.splice(insertIndex, 0, injectedMessage)

  return {
    messages: result,
    breakdown: [{ messageIndex: insertIndex, name: 'Novelist Memory: Whiteboard' }],
  }
}, 30) // Run before most other interceptors

// ─── Tool Registration (Intern) ─────────────────────────────────────────────
// Register the recall_scene tool so the primary model can request archived scenes.

spindle.registerTool({
  name: 'recall_scene',
  display_name: 'Recall Scene',
  description: 'Search the story archive for a specific past scene. Use this when you need to reference an earlier moment — a specific emotional beat, character reaction, piece of dialogue, or plot detail that happened earlier in the story but is no longer in your active context. Describe what you need and WHY you need it (callback, consistency check, emotional parallel, etc.).',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language description of the scene you need. Be specific about characters, emotional content, and your creative intent. Example: "Get me the scene where K first encounters A\'s ability. I need his exact internal reaction — the physical tells, the coping mechanism formation."',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of scenes to retrieve (1-5, default 3)',
      },
    },
    required: ['query'],
  },
  council_eligible: true,
  inline_available: true,
})

spindle.registerTool({
  name: 'recall_by_range',
  display_name: 'Recall Messages by Range',
  description: 'Retrieve the full original text of archived messages by their index range. Use this when you can see a specific message range in the Chronicle (e.g., "Messages: #42–#45") and need the complete prose — exact dialogue, sensory details, physical choreography — for callbacks, consistency checks, or emotional parallels. This is a direct lookup with zero latency, no search involved.',
  parameters: {
    type: 'object',
    properties: {
      start_index: {
        type: 'number',
        description: 'The start message index (inclusive). Matches the numbers shown in Chronicle entries (e.g., #42 means start_index: 42).',
      },
      end_index: {
        type: 'number',
        description: 'The end message index (inclusive). For a single message, set equal to start_index.',
      },
    },
    required: ['start_index', 'end_index'],
  },
  council_eligible: true,
  inline_available: true,
})

spindle.registerTool({
  name: 'random_number',
  display_name: 'Random Number',
  description: 'Generate a random number. For testing inline function calling.',
  parameters: {
    type: 'object',
    properties: {
      min: { type: 'number', description: 'Minimum value (default 1)' },
      max: { type: 'number', description: 'Maximum value (default 100)' },
    },
  },
  council_eligible: false,
  inline_available: true,
})

spindle.registerTool({
  name: 'update_whiteboard',
  display_name: 'Update Whiteboard',
  description: 'Directly edit the narrative whiteboard. Use this when you notice something important has changed mid-scene — a relationship shift, a thread resolving, a new plot seed, a continuity detail worth tracking — and you want to record it NOW rather than waiting for the post-generation updater. Pass a delta object with only the sections you want to change. Sections: chronicle (scene beats), threads (narrative arcs), hearts (relationships), palette (voice/style), canon (timeline/canon tracking), authorNotes (self-coaching). For chronicle/threads/hearts, use "add" for new entries (with id prefixes chr_, thr_, hrt_) and "update" for modifying existing entries by id.',
  parameters: {
    type: 'object',
    properties: {
      chronicle: {
        type: 'object',
        description: 'Add or update Chronicle entries (scene-level narrative beats).',
        properties: {
          add: {
            type: 'array',
            description: 'New chronicle entries to append.',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Unique ID with chr_ prefix (e.g. chr_rooftop_kiss)' },
                timestamp: { type: 'string', description: 'In-story timestamp' },
                location: { type: 'string' },
                summary: { type: 'string' },
                charactersPresent: { type: 'array', items: { type: 'string' } },
                emotionalStates: { type: 'object', additionalProperties: { type: 'string' } },
                sensoryContext: { type: 'string' },
                verbatimDialogue: { type: 'array', items: { type: 'string' } },
                sourceMessageRange: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
              },
              required: ['id', 'timestamp', 'location', 'summary', 'charactersPresent', 'emotionalStates', 'sensoryContext'],
            },
          },
          update: {
            type: 'array',
            description: 'Partial updates to existing chronicle entries (matched by id).',
            items: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
          },
        },
      },
      threads: {
        type: 'object',
        description: 'Add or update Thread entries (narrative arcs/plot threads).',
        properties: {
          add: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Unique ID with thr_ prefix' },
                name: { type: 'string' },
                status: { type: 'string', enum: ['ACTIVE', 'DORMANT', 'SEEDED', 'RESOLVED'] },
                lastTouched: { type: 'string' },
                summary: { type: 'string' },
                dependencies: { type: 'array', items: { type: 'string' } },
                triggerConditions: { type: 'array', items: { type: 'string' } },
                downstreamConsequences: { type: 'array', items: { type: 'string' } },
              },
              required: ['id', 'name', 'status', 'lastTouched', 'summary'],
            },
          },
          update: {
            type: 'array',
            items: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
          },
        },
      },
      hearts: {
        type: 'object',
        description: 'Add or update Heart entries (relationship dynamics).',
        properties: {
          add: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Unique ID with hrt_ prefix' },
                from: { type: 'string' },
                to: { type: 'string' },
                status: { type: 'string' },
                keyKnowledge: { type: 'array', items: { type: 'string' } },
                processing: { type: 'string' },
                sensoryMemories: { type: 'array', items: { type: 'string' } },
                unresolved: { type: 'array', items: { type: 'string' } },
                nextBeat: { type: 'string' },
              },
              required: ['id', 'from', 'to', 'status'],
            },
          },
          update: {
            type: 'array',
            items: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
          },
        },
      },
      palette: {
        type: 'object',
        description: 'Merge updates into the Palette (voice/style/sensory tracking). Keys are shallow-merged.',
        properties: {
          formattingAssignments: { type: 'object', additionalProperties: { type: 'string' } },
          voiceNotes: { type: 'object', additionalProperties: { type: 'string' } },
          sensorySignatures: { type: 'object', additionalProperties: { type: 'string' } },
          fragileDetails: { type: 'array', items: { type: 'string' }, description: 'New fragile details to append.' },
        },
      },
      canon: {
        type: 'object',
        description: 'Update Timeline/Canon (story progression, events, butterfly log). completedEvents and butterflyLog append; upcomingEvents replaces.',
        properties: {
          timelinePosition: { type: 'string' },
          completedEvents: { type: 'array', items: { type: 'object', properties: { event: { type: 'string' }, deviations: { type: 'string' }, foreshadowingNeeded: { type: 'string' } }, required: ['event'] } },
          upcomingEvents: { type: 'array', items: { type: 'object', properties: { event: { type: 'string' }, deviations: { type: 'string' }, foreshadowingNeeded: { type: 'string' } }, required: ['event'] } },
          butterflyLog: { type: 'array', items: { type: 'object', properties: { change: { type: 'string' }, projectedConsequences: { type: 'string' } }, required: ['change', 'projectedConsequences'] } },
        },
      },
      authorNotes: {
        type: 'object',
        description: 'Add or remove Author Notes (model-to-self coaching).',
        properties: {
          add: { type: 'array', items: { type: 'string' }, description: 'New notes to append.' },
          remove: { type: 'array', items: { type: 'number' }, description: 'Indices of notes to remove (0-based).' },
        },
      },
    },
  },
  council_eligible: true,
  inline_available: true,
})

// Handle tool invocations
const toolHandler = async (payload: ToolInvocationPayloadDTO, userId?: string): Promise<string | void> => {
  if (payload.toolName === 'random_number') {
    const min = (payload.args.min as number) ?? 1
    const max = (payload.args.max as number) ?? 100
    const result = Math.floor(Math.random() * (max - min + 1)) + min
    return `🎲 ${result}`
  }

  if (payload.toolName === 'update_whiteboard') {
    const chatId = activeGenerationChatId
    if (!chatId) return 'Unable to determine the active chat. The context handler may not have fired yet.'

    const delta = payload.args as unknown as WhiteboardDelta
    if (!delta || typeof delta !== 'object') return 'Invalid delta: expected a WhiteboardDelta object.'

    const config = await getConfig()

    if (config.directEditRequiresReview) {
      const updateId = `upd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const pending: PendingUpdate = {
        id: updateId,
        chatId,
        timestamp: new Date().toISOString(),
        changes: delta,
        status: 'pending',
        autoCommitAt: config.autoCommitUpdates ? Date.now() + config.updateReviewWindowMs : undefined,
      }
      await savePendingUpdate(pending)
      pendingDirectDeltas.push(structuredClone(delta))
      spindle.sendToFrontend({ type: 'pending_update', data: { chatId, update: pending } }, lastKnownUserId ?? undefined)
      spindle.log.info(`[NovelistMemory] Direct edit queued as pending update ${updateId} (review required)`)

      const sections = [
        delta.chronicle ? `chronicle (${(delta.chronicle.add?.length ?? 0)} added, ${(delta.chronicle.update?.length ?? 0)} updated)` : null,
        delta.threads ? `threads (${(delta.threads.add?.length ?? 0)} added, ${(delta.threads.update?.length ?? 0)} updated)` : null,
        delta.hearts ? `hearts (${(delta.hearts.add?.length ?? 0)} added, ${(delta.hearts.update?.length ?? 0)} updated)` : null,
        delta.palette ? 'palette' : null,
        delta.canon ? 'canon' : null,
        delta.authorNotes ? 'authorNotes' : null,
      ].filter(Boolean).join(', ')

      return `Whiteboard update queued for review (${updateId}). Sections: ${sections}. It will ${config.autoCommitUpdates ? `auto-commit in ${config.updateReviewWindowMs / 1000}s unless the user intervenes` : 'wait for manual commit'}.`
    }

    const whiteboard = await getWhiteboard(chatId)
    const updated = applyDelta(whiteboard, delta)
    await saveWhiteboard(updated)

    pendingDirectDeltas.push(structuredClone(delta))

    spindle.sendToFrontend({ type: 'whiteboard_data', data: { chatId, whiteboard: updated } }, lastKnownUserId ?? undefined)

    await refreshMacros(chatId)

    spindle.log.info(`[NovelistMemory] Direct whiteboard edit applied for chat ${chatId}`)

    const sections = [
      delta.chronicle ? `chronicle (${(delta.chronicle.add?.length ?? 0)} added, ${(delta.chronicle.update?.length ?? 0)} updated)` : null,
      delta.threads ? `threads (${(delta.threads.add?.length ?? 0)} added, ${(delta.threads.update?.length ?? 0)} updated)` : null,
      delta.hearts ? `hearts (${(delta.hearts.add?.length ?? 0)} added, ${(delta.hearts.update?.length ?? 0)} updated)` : null,
      delta.palette ? 'palette' : null,
      delta.canon ? 'canon' : null,
      delta.authorNotes ? 'authorNotes' : null,
    ].filter(Boolean).join(', ')

    return `Whiteboard updated. Sections changed: ${sections}.`
  }

  if (payload.toolName !== 'recall_scene' && payload.toolName !== 'recall_by_range') return

  // Use the chatId captured by the context handler during this generation.
  // Tool invocations don't carry userId, so getActive() fails for operator-scoped
  // extensions. The context handler fires before prompt assembly and captures the
  // chatId before tools are invoked.
  const chatId = activeGenerationChatId
  if (!chatId) {
    return 'Unable to determine the active chat. The context handler may not have fired yet.'
  }

  // Direct archive lookup by message index range — no LLM overhead
  if (payload.toolName === 'recall_by_range') {
    const startIndex = payload.args.start_index as number
    const endIndex = payload.args.end_index as number

    if (typeof startIndex !== 'number' || typeof endIndex !== 'number') {
      return 'Invalid arguments: start_index and end_index must be numbers.'
    }

    // Try the archive first
    const archived = await getArchivedMessagesByRange(chatId, startIndex, endIndex)
    if (archived.length > 0) {
      return archived.map(m => {
        const header = [
          `[Message #${m.messageIndex}]`,
          `[Role: ${m.role}]`,
          m.inStoryTimestamp ? `[In-story: ${m.inStoryTimestamp}]` : null,
          `[Characters: ${m.charactersPresent.join(', ') || 'none'}]`,
          `[Register: ${m.emotionalRegister}]`,
          `[~${m.tokenEstimate} tokens]`,
        ].filter(Boolean).join(' ')

        return `${header}\n${m.content}`
      }).join('\n\n---\n\n')
    }

    // Fall back to reading directly from the chat history — messages may
    // not be archived yet (new chat, within sliding window, etc.)
    try {
      const allMessages = await spindle.chat.getMessages(chatId)
      const sliced = allMessages.filter((_: unknown, i: number) => i >= startIndex && i <= endIndex)
      if (sliced.length === 0) {
        return `No messages found in range #${startIndex}–#${endIndex}. The chat may not have that many messages yet.`
      }

      return sliced.map((m: { role: string, content: string }, i: number) => {
        const idx = startIndex + i
        return `[Message #${idx}] [Role: ${m.role}]\n${m.content}`
      }).join('\n\n---\n\n')
    } catch {
      return `No archived messages found in range #${startIndex}–#${endIndex} and could not read chat history.`
    }
  }

  // Semantic search via the Intern (LLM-powered retrieval)
  const query = payload.args.query as string
  const maxResults = (payload.args.max_results as number) ?? 3
  const results = await queryIntern(chatId, { query, maxResults }, userId)
  return formatInternResults(results)
}
;(spindle.on as Function)('TOOL_INVOCATION', toolHandler)

// ─── Generation Lifecycle Events ────────────────────────────────────────────

spindle.on('GENERATION_STARTED', async (payload) => {
  activeGenerationMessageId = payload.targetMessageId ?? null
  activeGenerationIsRegen = !!payload.targetMessageId
  activeGenerationType = (payload as { generationType?: string }).generationType ?? null
  pendingDirectDeltas = []
  preGenerationState = null

  if (activeGenerationType === 'impersonate') return

  const chatId = payload.chatId
  if (!chatId) return

  // For regens, rewind first (before capturing pre-state). The rewind runs
  // regardless of config.enabled — versioning is decoupled from injection.
  if (activeGenerationIsRegen && payload.targetMessageId) {
    await performRegenRewind(chatId, payload.targetMessageId)
  }

  // Capture pre-state for THIS generation. For regens, this is the rewound
  // state. For new generations, this is the current whiteboard. Either way,
  // it's the "before" snapshot we'll save at GENERATION_ENDED so future
  // regens of this message can rewind to it precisely.
  preGenerationState = await getWhiteboard(chatId)
})

async function performRegenRewind(chatId: string, targetMessageId: string): Promise<void> {
  // Tier 1 (most accurate): If we already have a snapshot for this message
  // with a recorded preState, use that directly. This is exact — it's the
  // whiteboard as it existed right before this message was first generated.
  const targetSnap = await getLatestSnapshotForMessage(chatId, targetMessageId)
  if (targetSnap?.preState) {
    await applyRewind(chatId, targetSnap.preState, `target-message snapshot ${targetSnap.id}.preState`)
    return
  }

  // Tier 2: Fall back to the latest snapshot belonging to ANY OTHER message.
  // Its post-state is approximately "the whiteboard at the end of the previous
  // message," which is a reasonable pre-state for the target. This is the
  // legacy path that worked before preState was added.
  const preState = await getPreMessageState(chatId, targetMessageId)
  if (preState) {
    await applyRewind(chatId, preState, 'previous-message snapshot state')
    return
  }

  // Tier 3 (LO's case): No other-message snapshots exist, but the target
  // message HAS been generated before (it has snapshots without preState).
  // This means the target is the first message of the chat. The correct
  // pre-state is an empty whiteboard.
  const allSnaps = await getSnapshots(chatId)
  const targetSnaps = allSnaps.filter(s => s.messageId === targetMessageId)
  const otherSnaps = allSnaps.filter(s => s.messageId !== targetMessageId)
  if (targetSnaps.length > 0 && otherSnaps.length === 0) {
    await applyRewind(chatId, createEmptyWhiteboard(chatId), 'first-message reset (no prior snapshots)')
    return
  }

  spindle.log.info(`[NovelistMemory] Regen rewind: no prior state found for ${targetMessageId}, whiteboard unchanged`)
}

async function applyRewind(chatId: string, state: Whiteboard, reason: string): Promise<void> {
  const rewound = structuredClone(state)
  rewound.chatId = chatId
  await saveWhiteboard(rewound)
  // Don't remove old snapshots — they belong to previous swipes that the user
  // might navigate back to. The new generation will create a fresh snapshot
  // with a different swipeId that won't collide.
  spindle.log.info(`[NovelistMemory] Regen rewind: restored from ${reason}`)
  spindle.sendToFrontend({ type: 'whiteboard_data', data: { chatId, whiteboard: rewound } }, lastKnownUserId ?? undefined)
  await refreshMacros(chatId)
}

;(spindle.on as Function)('GENERATION_ENDED', async (payload: unknown, userId?: string) => {
  if (userId) lastKnownUserId = userId
  const p = payload as { messageId?: string, chatId?: string, content?: string, generationType?: string }

  const genType = p.generationType ?? activeGenerationType

  if (genType === 'impersonate') {
    spindle.log.info(`[NovelistMemory] Skipping updater for impersonate generation`)
    activeGenerationMessageId = null
    activeGenerationIsRegen = false
    activeGenerationType = null
    pendingDirectDeltas = []
    preGenerationState = null
    return
  }

  let chatId = p.chatId
  if (!chatId) {
    try {
      const active = await spindle.chats.getActive()
      chatId = active?.id
    } catch { /* ignore */ }
  }

  if (!chatId) {
    // Still clean up state even without a chatId
    activeGenerationMessageId = null
    activeGenerationIsRegen = false
    activeGenerationType = null
    pendingDirectDeltas = []
    preGenerationState = null
    return
  }

  spindle.log.info(`[NovelistMemory] GENERATION_ENDED fired — chat: ${chatId}, userId: ${userId ?? 'none'}`)

  // Updater pipeline (quiet gen + archival) only runs when enabled
  const config = await getConfig()
  if (config.enabled) {
    try {
      await processGenerationEnd(chatId, p.messageId, userId)
    } catch (err) {
      spindle.log.error(`[NovelistMemory] Background processing failed: ${err}`)
    }
  }

  // Snapshot creation always runs — if the model called update_whiteboard,
  // those mutations need to be versioned regardless of the enabled toggle.
  // This is what makes swipe-back restore and regen rewind work.
  //
  // IMPORTANT: The updater pipeline saves its delta as a PENDING update
  // (not yet committed to the whiteboard). The snapshot needs to capture
  // the whiteboard state AS IF the pending delta were applied, so that
  // swipe-back restores the correct state. We speculatively apply any
  // pending deltas from this generation cycle to the snapshot's state.
  try {
    const messageId = p.messageId ?? activeGenerationMessageId
    if (messageId) {
      const messages = await spindle.chat.getMessages(chatId)
      const msgIndex = messages.findIndex((m: { id: string }) => m.id === messageId)
      const msg = msgIndex >= 0 ? messages[msgIndex] as { id: string, swipe_id: number } : null

      if (msg) {
        let finalState = await getWhiteboard(chatId)

        // Speculatively apply pending deltas so the snapshot captures
        // the post-updater state, not the pre-updater state
        const allDeltas = [...pendingDirectDeltas]
        const pendingList = await getPendingUpdates(chatId)
        for (const pending of pendingList) {
          if (pending.status === 'pending' && pending.sourceMessageId === messageId) {
            finalState = applyDelta(finalState, pending.changes)
            allDeltas.push(pending.changes)
          }
        }

        const source = allDeltas.length > 0 ? 'combined' as const : 'updater' as const
        await createSnapshot(chatId, messageId, msg.swipe_id, msgIndex, finalState, allDeltas, source, preGenerationState ?? undefined)
        await pruneSnapshots(chatId)
      }
    }
  } catch (err) {
    spindle.log.error(`[NovelistMemory] Snapshot creation failed: ${err}`)
  }

  activeGenerationMessageId = null
  activeGenerationIsRegen = false
  activeGenerationType = null
  pendingDirectDeltas = []
  preGenerationState = null
})

// ─── Swipe Navigation ───────────────────────────────────────────────────────

spindle.on('MESSAGE_SWIPED', async (payload) => {
  // Snapshot restore runs regardless of config.enabled — if a snapshot
  // exists for this swipe, the whiteboard should reflect it. The enabled
  // toggle controls context injection, not versioning.
  if (payload.action !== 'navigated') return

  const chatId = payload.chatId
  const messageId = payload.message.id
  const targetSwipeId = payload.swipeId

  const snapshot = await getSnapshotForSwipe(chatId, messageId, targetSwipeId)
  if (snapshot) {
    const restored = structuredClone(snapshot.state)
    restored.chatId = chatId
    await saveWhiteboard(restored)
    spindle.sendToFrontend({ type: 'whiteboard_data', data: { chatId, whiteboard: restored } }, lastKnownUserId ?? undefined)
    await refreshMacros(chatId)
    spindle.log.info(`[NovelistMemory] Swipe nav: restored snapshot ${snapshot.id} for ${messageId} swipe ${targetSwipeId}`)
  } else {
    spindle.log.info(`[NovelistMemory] Swipe nav: no snapshot found for ${messageId} swipe ${targetSwipeId}, whiteboard unchanged`)
  }
})

// ─── Fork Seeding ───────────────────────────────────────────────────────────

;(spindle.on as Function)('CHAT_SWITCHED', async (payload: { chatId: string | null }, userId?: string) => {
  if (userId) lastKnownUserId = userId
  if (!payload.chatId) return

  const config = await getConfig()
  if (!config.enabled) return

  const newChatId = payload.chatId

  try {
    const chat = await spindle.chats.get(newChatId, userId ?? lastKnownUserId ?? undefined)
    if (!chat) return

    const parentChatId = chat.metadata.branched_from as string | undefined
    const forkMessageId = chat.metadata.branch_at_message as string | undefined
    if (!parentChatId || !forkMessageId) return

    const wb = await getWhiteboard(newChatId)
    const isEmpty = wb.chronicle.length === 0
      && wb.threads.length === 0
      && wb.hearts.length === 0
      && wb.authorNotes.length === 0
      && !wb.canon.timelinePosition
      && Object.keys(wb.palette.voiceNotes).length === 0

    if (!isEmpty) return

    const seeded = await seedFromParent(newChatId, parentChatId, forkMessageId)
    if (seeded) {
      spindle.sendToFrontend({ type: 'whiteboard_data', data: { chatId: newChatId, whiteboard: seeded } }, lastKnownUserId ?? undefined)
      await refreshMacros(newChatId)
    }
  } catch (err) {
    spindle.log.error(`[NovelistMemory] Fork seeding failed for ${newChatId}: ${err}`)
  }
})

// ─── Frontend Message Handling ──────────────────────────────────────────────

spindle.onFrontendMessage(async (raw, userId) => {
  if (userId) lastKnownUserId = userId
  const payload = raw as { type: string, data?: Record<string, unknown> }
  switch (payload.type) {
    case 'get_whiteboard': {
      const chatId = payload.data?.chatId as string
      if (!chatId) return
      const wb = await getWhiteboard(chatId)
      spindle.sendToFrontend({ type: 'whiteboard_data', data: { chatId, whiteboard: wb } }, userId)
      break
    }

    case 'save_whiteboard': {
      const chatId = payload.data?.chatId as string
      const whiteboard = payload.data?.whiteboard as Whiteboard
      if (!chatId || !whiteboard) return
      whiteboard.chatId = chatId
      await saveWhiteboard(whiteboard)
      spindle.sendToFrontend({ type: 'whiteboard_saved', data: { chatId } }, userId)
      break
    }

    case 'reset_whiteboard': {
      const chatId = payload.data?.chatId as string
      if (!chatId) return
      const empty = createEmptyWhiteboard(chatId)
      await saveWhiteboard(empty)
      spindle.sendToFrontend({ type: 'whiteboard_data', data: { chatId, whiteboard: empty } }, userId)
      break
    }

    case 'commit_update': {
      const chatId = payload.data?.chatId as string
      const updateId = payload.data?.updateId as string
      if (!chatId || !updateId) return
      const wb = await commitPendingUpdate(chatId, updateId)
      spindle.sendToFrontend({ type: 'update_committed', data: { updateId, chatId, whiteboard: wb } }, userId)
      break
    }

    case 'reject_update': {
      const chatId = payload.data?.chatId as string
      const updateId = payload.data?.updateId as string
      if (!chatId || !updateId) return
      await rejectPendingUpdate(chatId, updateId)
      spindle.sendToFrontend({ type: 'update_rejected', data: { updateId, chatId } }, userId)
      break
    }

    case 'get_config': {
      const config = await getConfig()
      spindle.sendToFrontend({ type: 'config_data', data: { config } }, userId)
      break
    }

    case 'save_config': {
      const config = payload.data?.config as Partial<NovelistConfig>
      if (!config) return
      const saved = await saveConfig(config)
      spindle.sendToFrontend({ type: 'config_saved', data: { config: saved } }, userId)
      break
    }

    case 'get_archive_stats': {
      const chatId = payload.data?.chatId as string
      if (!chatId) return
      const stats = await getArchiveStats(chatId)
      spindle.sendToFrontend({ type: 'archive_stats', data: { chatId, stats } }, userId)
      break
    }

    case 'manual_recall': {
      const chatId = payload.data?.chatId as string
      const query = payload.data?.query as string
      if (!chatId || !query) return
      const results = await queryIntern(chatId, { query, maxResults: 3 }, userId)
      spindle.sendToFrontend({ type: 'recall_results', data: { chatId, results } }, userId)
      break
    }

    case 'rerun_updater': {
      const chatId = payload.data?.chatId as string
      const mode = payload.data?.mode as 'reset_to_pre' | 'keep_current'
      if (!chatId) return

      spindle.log.info(`[NovelistMemory] Re-run updater requested for chat ${chatId} (mode: ${mode})`)

      // Auto-reject any pending updates for this chat so we don't stack them
      const pendingList = await getPendingUpdates(chatId)
      for (const pending of pendingList) {
        if (pending.status === 'pending') {
          await rejectPendingUpdate(chatId, pending.id)
          spindle.log.info(`[NovelistMemory] Auto-rejected pending update ${pending.id} before re-run`)
        }
      }
      // Clear pending from frontend
      spindle.sendToFrontend({ type: 'rerun_pending_cleared', data: { chatId } }, userId)

      // Rewind whiteboard if requested
      if (mode === 'reset_to_pre') {
        const allSnaps = await getSnapshots(chatId)
        if (allSnaps.length > 0) {
          // Get the latest snapshot — its preState is what the whiteboard looked
          // like before the last sidecar run
          const latest = allSnaps[allSnaps.length - 1]
          if (latest.preState) {
            const rewound = structuredClone(latest.preState)
            rewound.chatId = chatId
            await saveWhiteboard(rewound)
            spindle.log.info(`[NovelistMemory] Re-run: rewound to preState from snapshot ${latest.id}`)
          } else {
            // No preState on the latest snapshot — fall back to empty
            await saveWhiteboard(createEmptyWhiteboard(chatId))
            spindle.log.info(`[NovelistMemory] Re-run: no preState found, reset to empty`)
          }
        } else {
          // No snapshots at all — reset to empty
          await saveWhiteboard(createEmptyWhiteboard(chatId))
          spindle.log.info(`[NovelistMemory] Re-run: no snapshots, reset to empty`)
        }
        // Notify frontend of the rewound state
        const rewoundWb = await getWhiteboard(chatId)
        spindle.sendToFrontend({ type: 'whiteboard_data', data: { chatId, whiteboard: rewoundWb } }, userId)
        await refreshMacros(chatId)
      }

      // Find the latest message ID for processGenerationEnd
      try {
        const messages = await spindle.chat.getMessages(chatId)
        // [DIAG] dump what getMessages returned for this chatId
        spindle.log.info(`[NovelistMemory][DIAG] rerun getMessages(${chatId}) returned ${messages.length} messages`)
        for (const m of messages) {
          const msg = m as { id: string, role: string, content: string }
          spindle.log.info(`[NovelistMemory][DIAG]   msg id=${msg.id} role=${msg.role} len=${msg.content?.length ?? 0} preview="${(msg.content ?? '').slice(0, 120).replace(/\n/g, '\\n')}"`)
        }
        const lastAssistant = [...messages].reverse().find((m: { role: string }) => m.role === 'assistant') as { id: string } | undefined
        if (lastAssistant) {
          spindle.sendToFrontend({ type: 'rerun_started', data: { chatId } }, userId)
          await processGenerationEnd(chatId, lastAssistant.id, userId)
          spindle.log.info(`[NovelistMemory] Re-run updater completed for chat ${chatId}`)
        } else {
          spindle.log.warn(`[NovelistMemory] Re-run: no assistant message found in chat ${chatId}`)
          spindle.sendToFrontend({ type: 'rerun_error', data: { chatId, error: 'No assistant message found in chat' } }, userId)
        }
      } catch (err) {
        spindle.log.error(`[NovelistMemory] Re-run updater failed: ${err}`)
        spindle.sendToFrontend({ type: 'rerun_error', data: { chatId, error: String(err) } }, userId)
      }
      break
    }

    case 'list_connections': {
      try {
        const connections = await spindle.connections.list(userId)
        spindle.sendToFrontend({
          type: 'connections_list',
          data: { connections: connections.map(c => ({ id: c.id, name: c.name, provider: c.provider, model: c.model })) },
        }, userId)
      } catch (err) {
        spindle.log.warn(`[NovelistMemory] Failed to list connections: ${err}`)
        spindle.sendToFrontend({ type: 'connections_list', data: { connections: [] } }, userId)
      }
      break
    }

    case 'get_whiteboard_tokens': {
      const chatId = payload.data?.chatId as string
      if (!chatId) return
      const wb = await getWhiteboard(chatId)
      const serialized = serializeWhiteboard(wb)
      const result = await countTokens(serialized, userId)
      const config = await getConfig()
      spindle.sendToFrontend({
        type: 'whiteboard_tokens',
        data: { chatId, tokens: result.count, approximate: result.approximate, tokenizer: result.tokenizer, budget: config.whiteboardTokenBudget },
      }, userId)
      break
    }
  }
})

// ─── Commands ───────────────────────────────────────────────────────────────

spindle.commands.register([
  {
    id: 'open_whiteboard',
    label: 'Novelist Memory: View Whiteboard',
    description: 'Open the narrative whiteboard for the current chat',
    scope: 'chat',
    keywords: ['whiteboard', 'memory', 'novelist', 'narrative'],
  },
  {
    id: 'recall_scene',
    label: 'Novelist Memory: Recall Scene',
    description: 'Search the story archive for a past scene using the Intern',
    scope: 'chat',
    keywords: ['recall', 'archive', 'scene', 'intern', 'search'],
  },
  {
    id: 'archive_stats',
    label: 'Novelist Memory: Archive Stats',
    description: 'View statistics about the archived message history',
    scope: 'chat',
    keywords: ['archive', 'stats', 'memory', 'messages'],
  },
])

spindle.commands.onInvoked(async (commandId: string, context: { chatId?: string }) => {
  switch (commandId) {
    case 'open_whiteboard':
      spindle.sendToFrontend({ type: 'open_whiteboard', data: { chatId: context.chatId } }, lastKnownUserId ?? undefined)
      break
    case 'recall_scene':
      spindle.sendToFrontend({ type: 'open_recall', data: { chatId: context.chatId } }, lastKnownUserId ?? undefined)
      break
    case 'archive_stats':
      if (context.chatId) {
        const stats = await getArchiveStats(context.chatId)
        spindle.sendToFrontend({ type: 'archive_stats', data: { chatId: context.chatId, stats } }, lastKnownUserId ?? undefined)
      }
      break
  }
})

// ─── Macros ─────────────────────────────────────────────────────────────────
// Register macros so the whiteboard data is accessible in prompt templates

spindle.registerMacro({
  name: 'novelist_whiteboard',
  category: 'extension:novelist_memory',
  description: 'The full serialized whiteboard for the active chat',
  returnType: 'string',
  handler: '',
})

spindle.registerMacro({
  name: 'novelist_chronicle',
  category: 'extension:novelist_memory',
  description: 'Just the Chronicle section of the whiteboard',
  returnType: 'string',
  handler: '',
})

spindle.registerMacro({
  name: 'novelist_threads',
  category: 'extension:novelist_memory',
  description: 'Just the Threads section of the whiteboard',
  returnType: 'string',
  handler: '',
})

// Update macro values when whiteboard changes
async function refreshMacros(chatId: string): Promise<void> {
  const wb = await getWhiteboard(chatId)
  spindle.updateMacroValue('novelist_whiteboard', serializeWhiteboard(wb))

  const chronicleText = wb.chronicle
    .map(c => `[${c.timestamp}, ${c.location}] ${c.summary}`)
    .join('\n')
  spindle.updateMacroValue('novelist_chronicle', chronicleText || '(no chronicle entries)')

  const threadsText = wb.threads
    .map(t => `${t.name} (${t.status}): ${t.summary}`)
    .join('\n')
  spindle.updateMacroValue('novelist_threads', threadsText || '(no active threads)')
}

// Refresh macros when chat changes
spindle.on('CHAT_CHANGED', async (payload) => {
  const p = payload as { chat?: { id: string }, chatId?: string }
  const chatId = p.chat?.id ?? p.chatId
  if (chatId) await refreshMacros(chatId)
})

// ─── Startup ────────────────────────────────────────────────────────────────

const config = await getConfig()
spindle.log.info(`Novelist Memory initialized (enabled: ${config.enabled}, window: ${config.slidingWindowSize}, auto-commit: ${config.autoCommitUpdates})`)

// Try to refresh macros for the active chat
try {
  const active = await spindle.chats.getActive()
  if (active?.id) await refreshMacros(active.id)
} catch { /* no active chat yet */ }
