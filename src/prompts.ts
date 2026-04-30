import type { Whiteboard, CalibrationBank } from './types'
import { serializeWhiteboard } from './whiteboard'

// ─── Sparseness Detection ───────────────────────────────────────────────────

const SPARSE_THRESHOLDS = {
  chronicle: 3,
  threads: 2,
  hearts: 2,
  palette: 2,
  canon: 1,
  authorNotes: 2,
}

function isSparse(wb: Whiteboard): Record<string, boolean> {
  const paletteSize = Object.keys(wb.palette.voiceNotes).length
    + Object.keys(wb.palette.sensorySignatures).length
    + Object.keys(wb.palette.formattingAssignments).length
    + wb.palette.fragileDetails.length
  const canonSize = (wb.canon.timelinePosition ? 1 : 0)
    + wb.canon.completedEvents.length
    + wb.canon.upcomingEvents.length
    + wb.canon.butterflyLog.length

  return {
    chronicle: wb.chronicle.length < SPARSE_THRESHOLDS.chronicle,
    threads: wb.threads.length < SPARSE_THRESHOLDS.threads,
    hearts: wb.hearts.length < SPARSE_THRESHOLDS.hearts,
    palette: paletteSize < SPARSE_THRESHOLDS.palette,
    canon: canonSize < SPARSE_THRESHOLDS.canon,
    authorNotes: wb.authorNotes.length < SPARSE_THRESHOLDS.authorNotes,
  }
}

function isAdaptationMode(wb: Whiteboard): boolean {
  return wb.canon.completedEvents.length > 0
    || wb.canon.upcomingEvents.length > 0
    || wb.canon.butterflyLog.length > 0
}

// ─── Calibration Examples ────────────────────────────────────────────────────

function formatCalibrationExamples(section: string, bankExamples: string[] | undefined, defaultExample: string): string {
  if (bankExamples && bankExamples.length > 0) {
    return `\nSTORY-SPECIFIC EXAMPLES for ${section} (match this density and style):\n${bankExamples.map(e => e.trim()).join('\n---\n')}\n`
  }
  return `\nSTRUCTURAL EXAMPLE for ${section} (match this density — adapt content to YOUR story):\n${defaultExample}\n`
}

const DEFAULT_CHRONICLE = `[Day 1, 07:15, Apartment Kitchen, 3rd Floor] | Characters: A, B | Messages: #1–#3
B woke A with a door-kick and burnt breakfast. Apartment smelled like scorched oil and dark roast. A's ambient tell was contracted tight — warm room meant content sleep. B masked pride behind aggression: pressed uniform on the door handle, insults layered over care. Key callback detail: B can't cook but plates the results with zero shame; A can cook, which B considers a personal affront. Emotional register: aggressive domesticity.`

const DEFAULT_THREAD = `Name: THE HIDDEN ABILITY — A's Deception
Status: ACTIVE (load-bearing)
Last touched: Day 1, Scene 3
Summary: A's ability cannot be suppressed by the authority figure's nullification power. A fakes compliance — suppresses visible effects, mimics discomfort. Deception taught by guardian B.
Dependencies:
  - The group's threat assessment of A assumes the authority figure can shut A down
  - Rival C's coping mechanism ("teacher can leash A") relies on this being true
Trigger conditions:
  - Emotional spike too sudden to fake (ambush, threat to someone A cares about)
  - Authority figure activating nullification while A is mid-use (timing conflict)
  - Sustained observation — noticing A's "recovery" is instantaneous vs others' gradual return
Downstream consequences:
  - Authority figure: trust violation, professional crisis (taught with false data)
  - Rival C: coping mechanism collapses
  - Organization: reclassification, increased monitoring`

const DEFAULT_HEART = `B → A:
  Status: Guardian-ward. The axis. Non-negotiable anchor.
  Bond texture: Warmth expressed through aggression and competition. B brags about A to peers unprompted. Never says "I love you" directly — says it through actions (pressing clothes, threatening bureaucrats, learning to cook despite inability).
  Key knowledge: B reads A's emotional state through A's ambient tell instinctively, not analytically. This is the deepest intimacy in the story.
  Sensory memories: The first time A used the familial term — B's physical reaction (involuntary, visible, quickly hidden). This memory is LOAD-BEARING.
  Unresolved: B knows the organization hasn't stopped wanting A. Hasn't told A how close the last conversation got.
  Next beat: B's controlled exterior cracks when A faces real danger for the first time.`

const DEFAULT_PALETTE = `formattingAssignments: { "A": "#DDA0DD", "B": "#FF6B81", "C": "#FF4500" }

voiceNotes: {
  "B": "Short punchy fragments. Creative profanity — never generic, always inventive. Uses nicknames, never full names unless furious. Exclamation points earned, not default.",
  "Authority": "Flat periods. Ends sentences like closing doors. Dry humor so arid people miss it. Never raises voice — lowers it to wound."
}

sensorySignatures: {
  "A": "Ambient field: [primary sense] shifts with mood. MAP: anger=[intensifies], calm=[barely perceptible], happiness=[field CONTRACTS/diminishes] — the tell is the ABSENCE of the unusual, not its presence."
}

fragileDetails: [
  "A fidgets with a specific accessory when anxious — frequency increases with stress.",
  "B burns food. Every time. Not a running gag — genuine inability. Plates it anyway.",
  "A's room smells like [specific scent combination]. Left [device] running overnight."
]`

const DEFAULT_CANON = `timelinePosition: "Day 1, Pre-Arc 2. Phase 1: Foundation."

upcomingEvents: [
  { "event": "Arc 2 — First group test (TODAY)", "deviations": "Extra character changes group math. Authority figure's first direct assessment — plant their observation patterns.", "foreshadowingNeeded": "Establish authority's habits before the deception thread fires." },
  { "event": "Arc 3 — Paired exercise (within first week)", "deviations": "Odd count changes pairing structure. Who gravitates toward the OC? Who avoids?", "foreshadowingNeeded": "Seed team dynamics during current test." }
]

butterflyLog: [
  { "change": "Extra character exists in the group.", "projectedConsequences": "Every team exercise, pairing, and ranking shifts. Authority's calculus changes. One extra voice in every group dynamic." }
]`

const DEFAULT_AUTHOR_NOTES = `- "B's voice cracks on [specific word] when it's about A — use ONCE per major arc maximum. Devastating because rare."
- "A's happiness = [positive sensory]. NEVER reverse this. The tell is the ABSENCE of the unusual effect."
- "Authority's monotone BREAKING is a seismic event. If their voice changes register, every character in earshot should react. Don't waste it on mid-tier moments."
- "POV metaphor systems: A = [domain]/[domain]. B = [domain]/[domain]. Authority = [domain]/[domain]. Do NOT cross-contaminate between characters."`

// ─── Whiteboard Update Prompt ────────────────────────────────────────────────

export function buildUpdatePrompt(
  currentWhiteboard: Whiteboard,
  newUserMessage: string,
  newAssistantMessage: string,
  recentContext: string,
  messageRange?: [number, number],
  calibrationBank?: CalibrationBank,
): string {
  const serialized = serializeWhiteboard(currentWhiteboard)
  const sparse = isSparse(currentWhiteboard)
  const adaptation = isAdaptationMode(currentWhiteboard)

  const rangeNote = messageRange
    ? `\nMESSAGE INDICES: This exchange spans messages #${messageRange[0]}–#${messageRange[1]}. Use these indices for sourceMessageRange in Chronicle entries.`
    : ''

  const chronicleGuidance = `CHRONICLE — Scene-level narrative beats.
Density: 3-6 sentences per entry. Capture what happened, who was there, the emotional register, and one specific sensory/environmental anchor. Include verbatim dialogue ONLY when exact wording matters for future callbacks. ALWAYS include sourceMessageRange.

Entry cadence — NOT every message. Only when:
• Location or time changes
• A significant emotional beat lands
• A relationship dynamic shifts
• A hidden thread advances or a foreshadowing seed is planted

Five messages of continuous conversation in one room = one Chronicle entry. One message crossing three locations = three entries.

DON'T: Create entries that are just plot summaries without emotional texture. "They talked about school" is worthless. "She deflected questions about the Commission with aggressive breakfast-making, ears stiff" is gold.
DON'T: Include meta-commentary like "This was an important scene." The content should make importance self-evident.
DO: Preserve sensory anchors — ambient smells, lighting, temperature, textures. These make callbacks feel embodied.
DO: Flag specific callback-worthy details explicitly in the summary.${sparse.chronicle ? formatCalibrationExamples('CHRONICLE', calibrationBank?.chronicle, DEFAULT_CHRONICLE) : ''}`

  const threadsGuidance = `THREADS — Narrative arcs and plot threads. THIS IS THE MOST CRITICAL SECTION.
Every thread MUST have trigger conditions and downstream consequences, or it's just a fact — facts belong in Chronicle or Hearts, not Threads.

Status definitions:
• SEEDED — Planted in subtext or background. Nobody's noticed yet. Single touchpoint.
• ACTIVE — At least two touchpoints. Characters or readers are aware something's happening.
• DORMANT — Was active, gone quiet. Not resolved, just not in motion.
• RESOLVED — Concluded. Consequences landed. Keep for reference.

DON'T: Create a thread for every plot point. Threads need CONSEQUENCES that need tracking.
DON'T: Mark threads ACTIVE prematurely. Single mention = SEEDED. Needs a second touchpoint to become ACTIVE.
DON'T: Leave trigger conditions or downstream consequences empty. A thread without triggers is just a note.
DO: Track subtle foreshadowing seeds. These are the threads most likely to be lost over distance.
DO: Update dependencies — what other threads or character knowledge does this thread rely on?${sparse.threads ? formatCalibrationExamples('THREADS', calibrationBank?.threads, DEFAULT_THREAD) : ''}`

  const heartsGuidance = `HEARTS — Relationship dynamics. This section needs the MOST granularity.
Not just "A likes B" — the texture, the processing state, the sensory memories, what's unresolved, what the next beat should be.

Update cadence: Only when the dynamic SHIFTS. Not every exchange. If two characters talk and nothing changes between them, don't update. If one character notices something new about another — even silently — update.

DON'T: Use single-word status descriptors. "Friends" means nothing. "Reluctant allies bonded through shared survival, trust built on observed competence rather than verbal affirmation" means everything.
DON'T: Update every exchange. Only when the dynamic genuinely shifts.
DON'T: Forget to track what characters DON'T know about each other. The gap between what A knows about B and what's true is where dramatic irony lives.
DO: Include sensory memories — physical details from shared moments that would trigger involuntary recall.
DO: Track the "next beat" — what should happen next in this dynamic based on current trajectory?${sparse.hearts ? formatCalibrationExamples('HEARTS', calibrationBank?.hearts, DEFAULT_HEART) : ''}`

  const paletteGuidance = `PALETTE — Voice fingerprints, sensory signatures, fragile details, formatting assignments.
These are REFERENCE entries. Terse, functional, like post-it notes on the monitor.

• formattingAssignments: Dialogue color hex codes, POV markers, any character-specific formatting.
• voiceNotes: How each character TALKS — not personality, but actual verbal patterns. Sentence length, word choice, verbal tics, what they never say, formality register.
• sensorySignatures: How each character is PERCEIVED — physical tells, ambient effects, emotional telegraphs that other characters can read.
• fragileDetails: Tiny character-specific details that compound into characterization. The things that make a character feel lived-in. These are the FIRST things lost over distance.

DON'T: Add voice notes that could describe anyone. "Speaks normally" is not useful.
DON'T: Duplicate information from the main character description unless it's been MODIFIED by story events.
DO: Be specific enough that someone could write the character from the voice note alone.
DO: Track fragile details as they emerge — the unconscious habits, the background objects, the tiny recurring things.${sparse.palette ? formatCalibrationExamples('PALETTE', calibrationBank?.palette, DEFAULT_PALETTE) : ''}`

  const canonGuidance = adaptation
    ? `CANON — Timeline and source material tracking (ADAPTATION MODE detected).
This story is set in or adapting an existing universe. Track:
• timelinePosition: Where in the source timeline, using arc numbers/names if applicable.
• completedEvents: Source events that have occurred (with deviations noted).
• upcomingEvents: Source events approaching, with what foreshadowing is needed NOW and how the OC/divergence changes them.
• butterflyLog: Every divergence from source and its projected ripple effects. Each entry = 1-2 sentences with specific projected consequences.

DON'T: Log divergences without projected consequences. "OC exists" is not a butterfly entry. "OC exists, which changes team pairings for every exercise and shifts the threat assessment calculus for the authority figure" IS.
DO: Flag foreshadowing needs on upcoming events — what needs to be seeded in the current scene to make a future event land.${sparse.canon ? formatCalibrationExamples('CANON', calibrationBank?.canon, DEFAULT_CANON) : ''}`
    : `CANON — Timeline tracking (ORIGINAL FICTION MODE).
No source material detected. Track:
• timelinePosition: Current in-story date/time, story phase, or arc label.
• completedEvents: Major events that have concluded (for continuity reference).
• upcomingEvents: Planned or foreshadowed events that need setup.
• butterflyLog: Use ONLY if the story involves a character whose actions create traceable ripple effects (time travel, dimensional shifts, etc.). Otherwise leave empty.

Keep this section lightweight for original fiction — it's a timeline, not a source-tracking system.${sparse.canon ? formatCalibrationExamples('CANON', calibrationBank?.canon, DEFAULT_CANON) : ''}`

  const authorNotesGuidance = `AUTHOR NOTES — Craft coaching from you to future-you.
1-2 sentences each. Punchy. Actionable. These are CRAFT notes, not story notes.

The difference: A story note says "Character A is angry." A craft note says "Character A's anger reads best in three-word fragments with one CAPS word — don't let him monologue."

• Style register observations (what's working, what voice patterns to preserve)
• Metaphor system assignments (which metaphor families belong to which character/POV — don't cross-contaminate)
• Frequency notes (a specific emotional beat should be used once per arc, not every scene)
• Performance notes (what physical tells or speech patterns signal what emotional states)

DON'T: Add notes that could apply to any story. "Use sensory details" is not an author note.
DO: Add notes that are specific enough to prevent a real mistake in the next generation.${sparse.authorNotes ? formatCalibrationExamples('AUTHOR NOTES', calibrationBank?.authorNotes, DEFAULT_AUTHOR_NOTES) : ''}`

  return `You are a narrative continuity analyst maintaining a structured Whiteboard for a serialized fiction project. Your job is to analyze the latest exchange and produce precise, structured updates.

This whiteboard is the ONLY source of truth once messages scroll out of context. Every detail you track here is a detail preserved. Every detail you miss is lost forever. Be precise. Be specific. Be useful to the writer 200 messages from now.

${currentWhiteboard.chronicle.length > 0 ? 'Match the density and style of existing entries when adding new ones.\n' : ''}CURRENT WHITEBOARD STATE:
${serialized}

RECENT CONTEXT (last few exchanges for continuity):
${recentContext}

LATEST EXCHANGE:
USER: ${newUserMessage}
ASSISTANT: ${newAssistantMessage}
${rangeNote}

─── SECTION GUIDELINES ───

${chronicleGuidance}

${threadsGuidance}

${heartsGuidance}

${paletteGuidance}

${canonGuidance}

${authorNotesGuidance}

─── OUTPUT FORMAT ───

If a section has NO changes from this exchange, OMIT it from the delta entirely. Only include sections where something actually changed or was introduced.

Respond with ONLY a valid JSON object matching this schema:
{
  "chronicle": {
    "add": [{ "id": "chr_<descriptor>", "timestamp": "...", "location": "...", "summary": "...", "charactersPresent": [...], "emotionalStates": {"character": "state"}, "sensoryContext": "...", "verbatimDialogue": [...], "sourceMessageRange": [startIndex, endIndex] }],
    "update": [{ "id": "<existing_id>", ...fields_to_update }]
  },
  "threads": {
    "add": [{ "id": "thr_<descriptor>", "name": "...", "status": "SEEDED|ACTIVE|DORMANT|RESOLVED", "lastTouched": "...", "summary": "...", "dependencies": [...], "triggerConditions": [...], "downstreamConsequences": [...] }],
    "update": [{ "id": "<existing_id>", ...fields_to_update }]
  },
  "hearts": {
    "add": [{ "id": "hrt_<descriptor>", "from": "...", "to": "...", "status": "...", "keyKnowledge": [...], "processing": "...", "sensoryMemories": [...], "unresolved": [...], "nextBeat": "..." }],
    "update": [{ "id": "<existing_id>", ...fields_to_update }]
  },
  "palette": { "voiceNotes": {...}, "sensorySignatures": {...}, "fragileDetails": [...], "formattingAssignments": {...} },
  "canon": { "timelinePosition": "...", "completedEvents": [...], "upcomingEvents": [...], "butterflyLog": [...] },
  "authorNotes": { "add": ["..."], "remove": [index_numbers] }
}

Generate unique IDs using the prefixes shown (chr_, thr_, hrt_) followed by a short descriptor. For updates, reference the existing ID.`
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
