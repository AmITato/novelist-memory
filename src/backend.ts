import { getWhiteboard, serializeWhiteboard, commitPendingUpdate, rejectPendingUpdate, saveWhiteboard, createEmptyWhiteboard } from './whiteboard'
import { queryIntern, formatInternResults } from './intern'
import { processGenerationEnd } from './updater'
import { getConfig, saveConfig, invalidateConfigCache } from './config'
import { getArchiveStats, getArchivedMessagesByRange } from './archive'
import type { NovelistConfig, Whiteboard } from './types'
import type { ToolInvocationPayloadDTO } from 'lumiverse-spindle-types'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

// ─── Initialization ─────────────────────────────────────────────────────────

spindle.log.info('Novelist Memory starting...')

// Ensure storage directories exist
await spindle.storage.mkdir('whiteboards')
await spindle.storage.mkdir('archives')
await spindle.storage.mkdir('pending')

// ─── Context Handler (Pre-Assembly) ─────────────────────────────────────────
// Seeds the Whiteboard data into the generation context BEFORE prompt assembly.
// This gives the assembler awareness of the narrative state.

spindle.registerContextHandler(async (context) => {
  const config = await getConfig()
  if (!config.enabled) return context

  const chatId = (context as { chatId?: string }).chatId
  if (!chatId) return context

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

  const whiteboard = await getWhiteboard(chatId)
  const isEmpty = whiteboard.chronicle.length === 0
    && whiteboard.threads.length === 0
    && whiteboard.hearts.length === 0

  if (isEmpty) return messages

  const serialized = serializeWhiteboard(whiteboard)

  // Token budget check — rough estimate at 4 chars/token
  const estimatedTokens = Math.ceil(serialized.length / 4)
  if (estimatedTokens > config.whiteboardTokenBudget) {
    spindle.log.warn(`Whiteboard exceeds token budget (${estimatedTokens} > ${config.whiteboardTokenBudget}). Consider compaction.`)
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

// Handle tool invocations
const toolHandler = async (payload: ToolInvocationPayloadDTO, userId?: string): Promise<string | void> => {
  if (payload.toolName !== 'recall_scene' && payload.toolName !== 'recall_by_range') return

  // Determine chat ID from context or active chat
  let chatId: string | undefined
  try {
    const active = await spindle.chats.getActive()
    chatId = active?.id
  } catch { /* ignore */ }

  if (!chatId) {
    return 'Unable to determine the active chat. Make sure a chat is open.'
  }

  // Direct archive lookup by message index range — no LLM overhead
  if (payload.toolName === 'recall_by_range') {
    const startIndex = payload.args.start_index as number
    const endIndex = payload.args.end_index as number

    if (typeof startIndex !== 'number' || typeof endIndex !== 'number') {
      return 'Invalid arguments: start_index and end_index must be numbers.'
    }

    const messages = await getArchivedMessagesByRange(chatId, startIndex, endIndex)
    if (messages.length === 0) {
      return `No archived messages found in range #${startIndex}–#${endIndex}. These messages may still be in the active context window or haven't been archived yet.`
    }

    return messages.map(m => {
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

  // Semantic search via the Intern (LLM-powered retrieval)
  const query = payload.args.query as string
  const maxResults = (payload.args.max_results as number) ?? 3
  const results = await queryIntern(chatId, { query, maxResults }, userId)
  return formatInternResults(results)
}
;(spindle.on as Function)('TOOL_INVOCATION', toolHandler)

// ─── Generation Lifecycle Events ────────────────────────────────────────────

;(spindle.on as Function)('GENERATION_ENDED', async (payload: unknown, userId?: string) => {
  const p = payload as { messageId?: string, chatId?: string, content?: string }
  // Determine chat ID
  let chatId = p.chatId
  if (!chatId) {
    try {
      const active = await spindle.chats.getActive()
      chatId = active?.id
    } catch { /* ignore */ }
  }

  if (!chatId) return

  spindle.log.info(`[NovelistMemory] GENERATION_ENDED fired — chat: ${chatId}, userId: ${userId ?? 'none'}`)

  // Process in the background — don't block the generation lifecycle
  processGenerationEnd(chatId, p.messageId, userId).catch(err => {
    spindle.log.error(`[NovelistMemory] Background processing failed: ${err}`)
  })
})

// ─── Frontend Message Handling ──────────────────────────────────────────────

spindle.onFrontendMessage(async (raw, userId) => {
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
      spindle.sendToFrontend({ type: 'open_whiteboard', data: { chatId: context.chatId } })
      break
    case 'recall_scene':
      spindle.sendToFrontend({ type: 'open_recall', data: { chatId: context.chatId } })
      break
    case 'archive_stats':
      if (context.chatId) {
        const stats = await getArchiveStats(context.chatId)
        spindle.sendToFrontend({ type: 'archive_stats', data: { chatId: context.chatId, stats } })
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
