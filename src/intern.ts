import type { InternQuery, InternResult } from './types'
import { getArchive, getArchiveIndex, getArchivedMessagesByIds } from './archive'
import { getWhiteboard } from './whiteboard'
import { getConfig, resolveBackgroundConnectionId } from './config'
import { buildInternPrompt, buildInternAnnotationPrompt } from './prompts'
import { internSelectionSchema, internAnnotationSchema, jsonSchemaResponseFormat } from './schemas'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

// ─── Intern Retrieval ───────────────────────────────────────────────────────

export async function queryIntern(chatId: string, query: InternQuery, userId?: string): Promise<InternResult[]> {
  const config = await getConfig()
  const whiteboard = await getWhiteboard(chatId)
  const archiveIndex = await getArchiveIndex(chatId)

  if (archiveIndex.length === 0) {
    return [{
      source: 'No archived messages',
      emotionalRegister: 'n/a',
      keyContent: 'The archive is empty — no messages have been archived yet. All conversation history is still in the active context window.',
      relevanceNote: 'Nothing to retrieve.',
      fullScene: '',
      tokenCount: 0,
    }]
  }

  // Step 1: Have the intern identify relevant messages from the index
  const internSystemPrompt = buildInternPrompt(query.query, archiveIndex, whiteboard)
  const internConnId = await resolveBackgroundConnectionId(config.internConnectionId, userId)

  let selectionResult: {
    intent: string
    selectedMessages: Array<{ messageIndex: number, messageId: string, relevanceNote: string, priority: number }>
    searchNotes: string
  }

  try {
    const internGenRequest: Record<string, unknown> = {
      messages: [
        { role: 'system', content: internSystemPrompt },
        { role: 'user', content: `Find scenes relevant to: ${query.query}` },
      ],
      parameters: { temperature: 0.2, max_tokens: 2000, response_format: jsonSchemaResponseFormat(internSelectionSchema) },
    }
    if (internConnId) internGenRequest.connection_id = internConnId
    if (userId) internGenRequest.userId = userId
    const response = await spindle.generate.quiet(internGenRequest) as { content: string }
    let selectionContent = response.content.trim()
    if (selectionContent.startsWith('```')) {
      selectionContent = selectionContent.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    }
    selectionResult = JSON.parse(selectionContent)
    spindle.log.info(`[NovelistMemory] Intern selection response: intent="${selectionResult.intent}", selectedMessages=${selectionResult.selectedMessages.length}, notes="${selectionResult.searchNotes}"`)
  } catch (err) {
    spindle.log.error(`Intern selection failed: ${err}`)
    return [{
      source: 'Intern error',
      emotionalRegister: 'n/a',
      keyContent: 'The intern failed to process the query. Try rephrasing or check the connection settings.',
      relevanceNote: `Error: ${err}`,
      fullScene: '',
      tokenCount: 0,
    }]
  }

  // Step 2: Fetch full scenes for selected messages
  const maxResults = query.maxResults ?? 3
  const selected = selectionResult.selectedMessages
    .sort((a, b) => a.priority - b.priority)
    .slice(0, maxResults)

  spindle.log.info(`[NovelistMemory] Intern selected ${selected.length} messages after sort/slice (from ${selectionResult.selectedMessages.length} raw)`)
  const messageIds = selected.map(s => s.messageId)
  const fullMessages = await getArchivedMessagesByIds(chatId, messageIds)
  const messageMap = new Map(fullMessages.map(m => [m.messageId, m]))

  // Step 3: Annotate each retrieved scene
  const results: InternResult[] = []

  for (const selection of selected) {
    const message = messageMap.get(selection.messageId)
    if (!message) continue

    let annotation: string
    try {
      const annotationPrompt = buildInternAnnotationPrompt(
        query.query,
        message.content,
        {
          messageIndex: message.messageIndex,
          inStoryTimestamp: message.inStoryTimestamp,
          emotionalRegister: message.emotionalRegister,
          charactersPresent: message.charactersPresent,
        },
        selection.relevanceNote
      )

      const annotGenRequest: Record<string, unknown> = {
        messages: [
          { role: 'system', content: annotationPrompt },
          { role: 'user', content: 'Annotate this scene.' },
        ],
        parameters: { temperature: 0.2, max_tokens: 500, response_format: jsonSchemaResponseFormat(internAnnotationSchema) },
      }
      if (internConnId) annotGenRequest.connection_id = internConnId
      if (userId) annotGenRequest.userId = userId
      const annotationResponse = await spindle.generate.quiet(annotGenRequest) as { content: string }
      annotation = annotationResponse.content
    } catch {
      annotation = selection.relevanceNote
    }

    results.push({
      source: `Message #${message.messageIndex}, ${message.inStoryTimestamp ?? 'no timestamp'}, ${message.charactersPresent.join(', ')}`,
      emotionalRegister: message.emotionalRegister,
      keyContent: annotation,
      relevanceNote: selection.relevanceNote,
      fullScene: message.content,
      tokenCount: message.tokenEstimate,
    })
  }

  return results
}

// ─── Format Results for Tool Response ───────────────────────────────────────

export function formatInternResults(results: InternResult[]): string {
  if (results.length === 0) return 'No relevant scenes found in the archive.'

  const sections = results.map((result, i) => {
    const lines = [
      `[Result ${i + 1}]`,
      `[Source: ${result.source}]`,
      `[Emotional register: ${result.emotionalRegister}]`,
      `[Key content: ${result.keyContent}]`,
      `[Relevance: ${result.relevanceNote}]`,
    ]

    if (result.fullScene) {
      lines.push(`[Full scene — ~${result.tokenCount} tokens]`)
      lines.push(result.fullScene)
    }

    return lines.join('\n')
  })

  return sections.join('\n\n---\n\n')
}
