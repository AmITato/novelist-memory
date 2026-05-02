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

  // Resolve real messageIds from the archive index using messageIndex —
  // the model often hallucinates UUIDs instead of copying from the index
  const indexMap = new Map(archiveIndex.map(e => [e.messageIndex, e.messageId]))
  const resolvedIds = selected
    .map(s => indexMap.get(s.messageIndex))
    .filter((id): id is string => !!id)

  spindle.log.info(`[NovelistMemory] Intern selected ${selected.length} messages, resolved ${resolvedIds.length} real IDs`)
  const fullMessages = await getArchivedMessagesByIds(chatId, resolvedIds)
  const messageMap = new Map(fullMessages.map(m => [m.messageId, m]))
  // Also map by messageIndex for lookup
  const messageByIndex = new Map(fullMessages.map(m => [m.messageIndex, m]))

  // Step 3: Annotate each retrieved scene
  const results: InternResult[] = []

  for (const selection of selected) {
    // Look up by real messageId from index, fall back to messageIndex
    const realId = indexMap.get(selection.messageIndex)
    const message = (realId ? messageMap.get(realId) : undefined) ?? messageByIndex.get(selection.messageIndex)
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
      // Parse the structured annotation — extract readable text from JSON
      let rawAnnotation = annotationResponse.content.trim()
      if (rawAnnotation.startsWith('```')) {
        rawAnnotation = rawAnnotation.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
      }
      try {
        const parsed = JSON.parse(rawAnnotation) as { annotation?: string, keyDetails?: string[], emotionalContext?: string }
        const parts: string[] = []
        if (parsed.annotation) parts.push(parsed.annotation)
        if (parsed.keyDetails?.length) parts.push('Key details: ' + parsed.keyDetails.join('; '))
        if (parsed.emotionalContext) parts.push('Emotional context: ' + parsed.emotionalContext)
        annotation = parts.join('\n')
      } catch {
        annotation = rawAnnotation
      }
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
