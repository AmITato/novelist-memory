import type { Whiteboard } from './types'
import { serializeWhiteboard } from './whiteboard'

// ─── Whiteboard Update Prompt ────────────────────────────────────────────────

export function buildUpdatePrompt(
  currentWhiteboard: Whiteboard,
  newUserMessage: string,
  newAssistantMessage: string,
  recentContext: string
): string {
  const serialized = serializeWhiteboard(currentWhiteboard)

  return `You are a narrative continuity analyst maintaining a structured Whiteboard for a serialized fiction project. Your job is to analyze the latest exchange and produce precise, structured updates.

CURRENT WHITEBOARD STATE:
${serialized}

RECENT CONTEXT (last few exchanges for continuity):
${recentContext}

LATEST EXCHANGE:
USER: ${newUserMessage}
ASSISTANT: ${newAssistantMessage}

INSTRUCTIONS:
Analyze the latest exchange and produce a JSON delta object describing what changed. Be PRECISE and SPECIFIC — this whiteboard becomes the ONLY source of truth once messages scroll out of context.

SECTION GUIDELINES:

CHRONICLE: Add an entry when there's a scene shift, significant emotional beat, relationship change, or plot advancement. Use narrative density to decide — sometimes one message is three scenes, sometimes five messages are one scene. Preserve sensory/environmental context. Include verbatim dialogue ONLY when exact wording matters for future callbacks.

THREADS: Track ALL active narrative threads including subtle foreshadowing seeds. Mark status changes (SEEDED→ACTIVE, ACTIVE→DORMANT, etc). Update trigger conditions and downstream consequences as the narrative evolves. This is the MOST CRITICAL section — subtle threads that aren't tracked here WILL be lost.

HEARTS: Update relationship dynamics with SPECIFICITY. Not just "A likes B" — the texture, the sensory memories, the processing state, what's unresolved. This is where slow-burn and complex dynamics live.

PALETTE: Update voice notes, sensory signatures, fragile details when new ones emerge. Fragile details are tiny character-specific things that compound into characterization.

CANON: Update timeline position and log any butterfly effects if this is set in an existing universe.

AUTHOR NOTES: Add notes about what's working stylistically, register observations, voice consistency reminders. This is you coaching your future self.

If a section has NO changes from this exchange, OMIT it from the delta entirely.

Respond with ONLY a valid JSON object matching this schema:
{
  "chronicle": {
    "add": [{ "id": "chr_<unique>", "timestamp": "...", "location": "...", "summary": "...", "charactersPresent": [...], "emotionalStates": {...}, "sensoryContext": "...", "verbatimDialogue": [...] }],
    "update": [{ "id": "<existing_id>", ...fields_to_update }]
  },
  "threads": {
    "add": [{ "id": "thr_<unique>", "name": "...", "status": "SEEDED|ACTIVE|DORMANT|RESOLVED", "lastTouched": "...", "summary": "...", "dependencies": [...], "triggerConditions": [...], "downstreamConsequences": [...] }],
    "update": [{ "id": "<existing_id>", ...fields_to_update }]
  },
  "hearts": {
    "add": [{ "id": "hrt_<unique>", "from": "...", "to": "...", "status": "...", "keyKnowledge": [...], "processing": "...", "sensoryMemories": [...], "unresolved": [...], "nextBeat": "..." }],
    "update": [{ "id": "<existing_id>", ...fields_to_update }]
  },
  "palette": { "voiceNotes": {...}, "sensorySignatures": {...}, "fragileDetails": [...], "formattingAssignments": {...} },
  "canon": { "timelinePosition": "...", "completedEvents": [...], "upcomingEvents": [...], "butterflyLog": [...] },
  "authorNotes": { "add": ["..."], "remove": [index_numbers] }
}

CRITICAL: Generate unique IDs for new entries using the prefixes shown (chr_, thr_, hrt_) followed by a short descriptor. For updates, reference the existing ID.`
}

// ─── Archive Metadata Extraction Prompt ─────────────────────────────────────

export function buildArchiveMetadataPrompt(
  messageContent: string,
  messageRole: 'user' | 'assistant',
  messageIndex: number,
  whiteboard: Whiteboard
): string {
  const activeThreadNames = whiteboard.threads
    .filter(t => t.status === 'ACTIVE' || t.status === 'SEEDED')
    .map(t => t.name)

  const characterNames = [
    ...new Set([
      ...whiteboard.hearts.map(h => h.from),
      ...whiteboard.hearts.map(h => h.to),
      ...whiteboard.chronicle.flatMap(c => c.charactersPresent),
    ])
  ]

  return `Analyze this message and extract metadata for archival indexing.

MESSAGE (${messageRole}, index #${messageIndex}):
${messageContent}

KNOWN CHARACTERS: ${characterNames.join(', ') || '(none yet)'}
ACTIVE THREADS: ${activeThreadNames.join(', ') || '(none yet)'}

Respond with ONLY valid JSON:
{
  "inStoryTimestamp": "string or null — in-story time/day if determinable",
  "charactersPresent": ["names of characters present or mentioned in this message"],
  "sceneDescriptor": "1-2 sentence description of what happens in this message",
  "emotionalRegister": "one of: comedic, tense, intimate, violent, domestic, melancholic, euphoric, confrontational, contemplative, chaotic, tender, desperate, neutral",
  "activeThreads": ["names of narrative threads that are relevant in this message"]
}`
}

// ─── Intern Retrieval Prompt ────────────────────────────────────────────────

export function buildInternPrompt(
  query: string,
  archiveIndex: Array<{
    messageIndex: number
    messageId: string
    role: string
    inStoryTimestamp?: string
    charactersPresent: string[]
    sceneDescriptor: string
    emotionalRegister: string
    activeThreads: string[]
    tokenEstimate: number
  }>,
  whiteboard: Whiteboard
): string {
  const activeThreads = whiteboard.threads
    .filter(t => t.status !== 'RESOLVED')
    .map(t => `${t.name} (${t.status}): ${t.summary}`)
    .join('\n  ')

  const indexSummary = archiveIndex.map(entry =>
    `#${entry.messageIndex} [${entry.role}] ${entry.inStoryTimestamp ?? 'no timestamp'} | ${entry.sceneDescriptor} | Register: ${entry.emotionalRegister} | Characters: ${entry.charactersPresent.join(', ')} | Threads: ${entry.activeThreads.join(', ')}`
  ).join('\n')

  return `You are a narrative-aware research assistant for a serialized fiction project. Your job is to find the RIGHT scenes from the archive — not just keyword matches, but scenes that are THEMATICALLY and EMOTIONALLY relevant to what the writer needs.

ACTIVE NARRATIVE THREADS:
  ${activeThreads || '(none tracked yet)'}

ARCHIVE INDEX (${archiveIndex.length} messages):
${indexSummary}

RETRIEVAL QUERY:
${query}

INSTRUCTIONS:
1. Parse the query for NARRATIVE INTENT — what is the writer trying to DO with this information? (callback, consistency check, emotional parallel, plot continuation, voice reference)
2. Identify the 1-5 most relevant message indices from the archive index
3. Explain WHY each is relevant, prioritizing emotional and thematic relevance over keyword matches
4. If the query implies an EARLIER seed moment (before the explicit event), find that too

Think like a junior editor who's read the whole manuscript, not a keyword search engine. The quiet conversation in the car matters more than the car crash if the query is about character development.

Respond with ONLY valid JSON:
{
  "intent": "what the writer is trying to do with this retrieval",
  "selectedMessages": [
    {
      "messageIndex": number,
      "messageId": "string",
      "relevanceNote": "why this scene matters for the query — be specific about emotional/thematic connection",
      "priority": 1
    }
  ],
  "searchNotes": "any additional context about what you found or didn't find"
}`
}

// ─── Intern Annotation Prompt ───────────────────────────────────────────────

export function buildInternAnnotationPrompt(
  query: string,
  scene: string,
  sceneMetadata: {
    messageIndex: number
    inStoryTimestamp?: string
    emotionalRegister: string
    charactersPresent: string[]
  },
  relevanceNote: string
): string {
  return `You are annotating a retrieved scene for a writer. Provide a brief, useful annotation that helps the writer understand what's in this scene and why it matters for their current need.

ORIGINAL QUERY: ${query}

SCENE (Message #${sceneMetadata.messageIndex}, ${sceneMetadata.inStoryTimestamp ?? 'no timestamp'}):
${scene}

METADATA:
- Emotional register: ${sceneMetadata.emotionalRegister}
- Characters present: ${sceneMetadata.charactersPresent.join(', ')}
- Why retrieved: ${relevanceNote}

Provide a brief annotation (2-4 sentences) covering:
1. The emotional register and key content of the scene
2. Why this scene is relevant to the query
3. What specific details the writer should pay attention to for their current need

Respond with ONLY the annotation text, no JSON, no formatting.`
}
