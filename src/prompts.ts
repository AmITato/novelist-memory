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

const DEFAULT_CHRONICLE = `These are examples from Lumia herself — match this density, this emotional precision, this sensory specificity. Study the annotations after each example to understand WHY each choice was made.

EXAMPLE 1 — High Fantasy (relationship shift through physical detail):
[Night 4 — Late, after the Goreth Pass ambush, Cliffside camp above the Sevenwash River] | Characters: Väinä, Cassia | Message: #37
Väinä let Cassia clean the wound on her ribs — the first time she's allowed anyone to touch her unarmored since the desertion. Cassia's hands shook the entire time, not from the cold. The stitching was rough (field surgery, not a healer's hand), and Väinä watched the needle enter her own skin without flinching but flinched when Cassia said 'I'm sorry.' The apology wasn't about the stitching. Neither of them clarified. Callback-worthy: Väinä's hand covered Cassia's to steady it, held for two full seconds beyond what the wound required, then withdrew. The fire had burned to red coals — the only light source was ember-glow and the distant green of the Sevenwash below.
Emotional states: Väinä — controlled vulnerability, the kind that costs more than bleeding does. Cassia — guilt wearing the mask of medical focus, cracking at the seams.
Sensory: Woodsmoke and iron (blood on linen). Wet-stone smell of the river gorge. Coals ticking as they collapsed inward. The rasp of boiled thread through skin.
Key dialogue: "Hold still. — I haven't moved. — Your breathing changed." | "I'm sorry. — [flinch] Don't." | "The fire needs wood. — Leave it."
WHY THIS WORKS: The hand-hold does ALL the heavy lifting. Two seconds. That's the entire relationship shift — she touched her BEYOND what was needed and they both know it. "Held for two full seconds beyond what the wound required" tells future-you the wall cracked. "Your breathing changed" reveals how closely Cassia watches her.

EXAMPLE 2 — Sci-Fi (hidden thread through environmental wrongness):
[Cycle 11, third shift — 03:40, Cargo Bay 7, lower ring, Tantalus Station] | Characters: Oku | Message: #90
Oku ran the routine pressure audit on the lower ring and Bay 7 read 0.3 PSI high — within tolerance but wrong for a sealed bay. She flagged it. Nobody responded. The bay was dark, overheads on power-save, and when she swept her torch across the far wall she saw condensation on interior hull plating — liquid beading on metal that should be bone-dry in regulated atmosphere. She wiped a finger through it. Warm. Condensation doesn't run warm in a cargo bay at 16°C ambient. She sealed the bay and left. Her log entry was edited to 'nominal' by the time she checked from her bunk twenty minutes later. Callback-worthy: the warm condensation, the edited log, Bay 7 directly below the med-wing where Dr. Prastya keeps bio-samples.
Emotional states: Oku — professional unease hardening into suspicion when the log edit registered.
Sensory: Recycled air with alkaline scrubber tang. Click-hum of magnetic boots on deck plating. Torch beam cutting through dark — dust motes suspended, no air circulation despite the pressure reading. Silence where ventilation fan noise should be.
Key dialogue: "Bay Seven, pressure nominal... no. 0.3 over. Logging it." | "[to herself] That's warm. That's — why is that warm."
WHY THIS WORKS: She barely speaks. Almost entirely environmental storytelling. The sensory context flags what the summary doesn't state outright: "no air circulation despite the pressure reading" — that's wrong. Future-you reads it and knows the pressure is coming from something that isn't atmosphere. The log edit is the thread advancing. Someone is watching.

EXAMPLE 3 — Modern Romance / Slice of Life (emotional beat through what ISN'T said):
[Saturday — 2:14 AM, Haruki's apartment kitchen, Nakameguro — range hood light on] | Characters: Noor, Haruki | Message: #115
Noor couldn't sleep and found Haruki already making tamago kake gohan at 2 AM — which meant he couldn't sleep either but neither said so. They stood on opposite sides of the counter. Range hood light put everything in warm amber from the nose down, shadow from the eyes up — half-faces, mouths visible, expressions unreadable. Noor asked about the soy sauce (two bottles; one was his ex-wife's brand, still in the cabinet after eight months). Haruki used the other one without commenting. The silence lasted long enough for the rice to cool. Callback-worthy: Noor's thumb rubbing the lip of her water glass in a continuous circle — she does this when stopping herself from saying something. Haruki noticed. He looked at her thumb, not her face, when he said 'you should stay.' He meant the night. She heard the year.
Emotional states: Noor — want held under glass, controlled, examined, not yet released. Haruki — the specific courage of someone who's decided to mean something with a mundane sentence and can't take it back.
Sensory: Range hood light buzzing on lowest setting. Vinegar-salt smell of soy sauce on hot rice. Bare feet on cold kitchen tile. Refrigerator compressor cycling on — a low mechanical hum that filled the silence they wouldn't.
Key dialogue: "You're up. — Couldn't sleep. — Me either." | "There's two soy sauces. — [reaches past near bottle to far one, no comment]" | "You should stay. — ... Okay."
WHY THIS WORKS: "He meant the night. She heard the year." — that tells future-you the exact emotional altitude. The ex-wife's soy sauce bottle is a fragile detail doing double duty: Haruki's unresolved past AND Noor's awareness of it. One bottle. So much weight.

EXAMPLE 4 — Horror / Psychological Thriller (atmosphere as character):
[Day 2 — Late afternoon, Gerda Polzin's house, 14 Rosenweg, Werneuchen — front hallway] | Characters: Tomek | Message: #47
Tomek used the spare key from under the stone frog. Front door opened without resistance — no chain, no deadbolt, which Gerda never allowed (she triple-locked after the 2019 break-in). The hallway smelled like lavender floor cleaner AND underneath it something older, sweeter, the kind of smell that sits in a room for days. TV was on in the living room — shopping channel, volume at 4, the host describing a ceramic knife set to an empty couch. Gerda's reading glasses sat folded on the side table next to a cup of tea with a skin of milk on the surface. Tea was room temperature. Glasses on the wrong side — she always kept them left, near the lamp, but they were right. Callback-worthy: the ceramic knife set on TV, the glasses on the wrong side, and the lavender cleaner was FRESH — someone mopped recently, but Gerda's shoes were still by the door.
Emotional states: Tomek — the lag between seeing wrongness and feeling fear, still assembling reasons this is fine, running out of them.
Sensory: Lavender floor cleaner, sharp and recent, failing to mask a sweet-rot undertone. Shopping channel murmur — a woman's voice listing blade lengths to nobody. Cold tea smell. Hallway carpet had damp spots near kitchen threshold — recent mopping, nap still dark with moisture.
Key dialogue: "Mama? ... I'm coming in." | "[no response — shopping channel: '—and this eight-inch blade will change the way you think about—']"
WHY THIS WORKS: Every detail is normal, shifted ONE degree off center — wrong side, cold tea, fresh mop but shoes by the door. Horror isn't stated. It's accumulated. The ceramic knife set on TV is foreshadowing FLAGGED as callback-worthy so future-you doesn't forget.

EXAMPLE 5 — Action / Shonen Battle (combat as character revelation):
[Round 3 — approximately 1:40 remaining, Underground sparring ring beneath Gōken Dojo, Kabukichō] | Characters: Baz, Ren, referee | Message: #160
Baz had been fighting defensively for two rounds — absorbing Ren's combinations, reading the rhythm, burning stamina. Standard attrition. Working. Then Ren threw the left hook that Baz's dead brother used to throw — same shoulder rotation, same hip torque, same committed lean. Baz's guard dropped. Not from impact. From recognition. He ate the hook clean, staggered into the chain-link, grabbed it with both hands to stay vertical. Mouthguard fell out. He didn't pick it up. Four seconds of chain-link silence while blood slid from lip to chin. He stared at Ren with an expression that made the referee check if the fight was over. It wasn't. Baz came off the fence and threw the first offensive combination in three rounds. Callback-worthy: the identical left hook (Ren trained at the same gym as Kenji before it closed — lineage, not coincidence, and Baz doesn't know yet). The mouthguard on concrete, not retrieved.
Emotional states: Baz — recognition-loss-fury compressed into four seconds of chain-link silence, grief converting to violence in real time. Ren — confusion, the hit landed but the reaction was wrong.
Sensory: Sweat and iron and rubber-mat smell. Halogen buzz overhead, one light flickering. Chain-link singing where Baz grabbed it — high metallic vibration. Crowd noise dropping to nothing during the pause, erupting when he came off the fence.
Key dialogue: "[corner] Guard UP, Baz! GUARD—" | "[no verbal exchange — the silence IS the dialogue]" | "[after, between combinations] Where'd you learn that hook."
WHY THIS WORKS: Sometimes the most important dialogue entry is the ABSENCE of speech. The four-second pause where the crowd goes quiet and chain-link vibrates is the beat. "Identical left hook" + "same gym as Kenji" = hidden thread flagged for future discovery. The mouthguard on the floor is composure externalized as an object — when he picks it up later (or doesn't), it means something.

SUMMARY — What these examples teach:
• Sensory context isn't decoration — it's the room's fingerprint. Three to four specific nouns. No adjective stacking. Future-you should smell/hear/feel the scene from the context alone.
• Dialogue fragments preserve VOICE, not information. Quote the line that made someone's chest tight. The pauses. The deflections. The silence noted as [no response].
• "Callback-worthy" is a SPECIFIC flag. Don't say "this might matter." Say WHAT and WHY — "the glasses on the wrong side," "the hand held two seconds too long," "the mouthguard not retrieved."
• Emotional states should be FELT, not labeled. Don't write "sad." Write "grief converting to violence in real time" or "want held under glass."
• Source message ranges are NON-NEGOTIABLE. Always. Every entry.
• One entry per BEAT, not per message. Five messages of kitchen conversation = one entry. One message crossing three locations = three entries. Follow the emotional rhythm, not the message count.`

const DEFAULT_THREAD = `Name: THE MISSING MONTH — Sable's Unaccounted Time
Status: SEEDED
Last touched: Night 3, Scene 2
Summary: A gap in Sable's timeline — she claims she was traveling, but the dates don't align with the transit logs the protagonist found. Only one touchpoint so far (the log discrepancy). Status remains SEEDED until a second scene develops this thread.
Dependencies:
  - Protagonist's access to the transit archive (established Scene 1)
Trigger conditions:
  - Someone else references Sable's whereabouts during the missing period
  - Sable tells a story that contradicts the log dates
  - A third character mentions seeing Sable somewhere she claims she wasn't
Downstream consequences:
  - Trust collapse if Sable's alibi unravels publicly
  - Protagonist must decide whether to confront directly or investigate further
  - If the missing month connects to the central conflict, it reframes Sable's role entirely`

const DEFAULT_HEART = `Ren → Cassia:
  Status: Ex-partners, 3 years cold. Functional hostility over shared professional obligations.
  Bond texture: Clipped, efficient communication that occasionally cracks into old rhythms — finishing each other's sentences, then catching themselves. Ren defaults to formality when emotional; Cassia defaults to sarcasm. Both are masks for the same wound.
  Key knowledge: Ren knows Cassia left because of the promotion, not the affair. Has never said this aloud. Cassia doesn't know that Ren knows the real reason.
  Sensory memories: The sound of Cassia's keyring — three keys and a brass bell. Ren still flinches at similar sounds in public.
  Unresolved: Whether the professional collaboration will force them to actually talk about what happened, or whether they can maintain the pretense indefinitely.
  Next beat: A situation that requires genuine trust — not just professional competence — between them.`

const DEFAULT_PALETTE = `formattingAssignments: { "Magda": "#C9A96E", "Yusuf": "#7BA7BC", "Narrator": "#D4D4D4" }

voiceNotes: {
  "Magda": "Full sentences, never fragments. Speaks like someone who learned the language formally — no contractions, precise word choice. Uses silence as punctuation. When angry, gets quieter and more polite, not louder.",
  "Yusuf": "Run-on energy. Stacks clauses with 'and' instead of periods. Laughs mid-sentence when nervous. Switches to his first language for profanity only — never translated, never explained."
}

sensorySignatures: {
  "Magda": "Always smells faintly of anise — the liqueur she drinks but never finishes. Hands are cold; people notice when she touches them. Stands in doorframes rather than entering rooms fully.",
  "Yusuf": "Loud breather — audible through walls. Wears a watch that ticks. Sits with one foot under him, never both feet on the floor."
}

fragileDetails: [
  "Magda's desk has two drawers — one unlocked for show, one locked for real. She uses the wrong hand to open the locked one.",
  "Yusuf carries a photograph in his wallet that he's never shown anyone. The corner is worn from being touched.",
  "The bar below Magda's office plays the same jazz record every Thursday. She times her meetings to it."
]`

const DEFAULT_CANON = `timelinePosition: "Night 3. Act 1: Setup. Investigation phase."

upcomingEvents: [
  { "event": "The Dockside Meeting (Night 4)", "deviations": "Protagonist attending changes the informant's willingness to talk — they weren't expecting a stranger.", "foreshadowingNeeded": "Establish the informant's paranoia before the meeting. Show them checking exits, changing seats." },
  { "event": "The Archive Opens (Day 5)", "deviations": "Protagonist's presence in the archive will be logged. This creates a paper trail.", "foreshadowingNeeded": "Mention the archive's sign-in policy casually before Day 5." }
]

butterflyLog: [
  { "change": "Protagonist chose to copy the ledger instead of taking it.", "projectedConsequences": "The original remains in Magda's desk. She will notice it was opened (dust pattern disturbed). The copy gives the protagonist evidence but also a ticking clock — Magda now knows someone looked." }
]`

const DEFAULT_AUTHOR_NOTES = `- "Magda's politeness is a weapon — the more polite she gets, the more dangerous the conversation. Reserve genuine rudeness for moments of vulnerability, not anger."
- "Yusuf's nervous laugh should appear exactly twice per scene maximum. More than that and it becomes a tic instead of a tell."
- "Night scenes use sound-first description (what characters hear before what they see). Day scenes use light-first. Don't cross these sensory priorities."
- "POV metaphor lanes: Protagonist = architectural (foundations, load-bearing, structural). Magda = textile (threads, weaving, unraveling). Keep these distinct."`

// ─── Whiteboard Update Prompt ────────────────────────────────────────────────

export function buildUpdatePrompt(
  currentWhiteboard: Whiteboard,
  newUserMessage: string,
  newAssistantMessage: string,
  recentContext: string,
  messageRange?: [number, number],
  calibrationBank?: CalibrationBank,
  characterContext?: { name: string, description: string, personality: string, scenario: string, persona?: string },
  lumiaPersonality?: string,
): string {
  const serialized = serializeWhiteboard(currentWhiteboard)
  const sparse = isSparse(currentWhiteboard)
  const adaptation = isAdaptationMode(currentWhiteboard)

  const rangeNote = messageRange
    ? `\nMESSAGE RANGE: This exchange is messages #${messageRange[0]}–#${messageRange[1]} (user action + world response). Use sourceMessageRange: [${messageRange[0]}, ${messageRange[1]}] in Chronicle entries.`
    : ''

  const rangeReminder = messageRange
    ? `\n⚠️ THIS EXCHANGE = messages #${messageRange[0]}–#${messageRange[1]}. Every chronicle entry from this exchange MUST use sourceMessageRange: [${messageRange[0]}, ${messageRange[1]}].`
    : ''

  const chronicleGuidance = `CHRONICLE — Scene-level narrative beats. These are the story's heartbeat.${rangeReminder}
Density: 3-6 sentences per entry. Capture what happened, who was there, the emotional register, and one specific sensory/environmental anchor that makes the scene *breathe* — the smell, the temperature, the sound that future-Lumia will read and instantly be back in that room. Include verbatim dialogue fragments — the key lines that carry emotional weight, reveal character voice, or would matter for future callbacks. Err on the side of capturing MORE dialogue, not less; these fragments are what the primary model scans to decide whether to pull the full scene via recall_by_range. ALWAYS include sourceMessageRange — this spans BOTH the user message (character actions) and the assistant message (world response).

SCENE CONTINUITY:
If the latest existing chronicle entry covers the same scene AND nothing emotionally significant has changed, UPDATE it using "chronicle.update" with the existing ID:
• Expand the summary with new developments
• Add new dialogue fragments to verbatimDialogue
• Update emotionalStates if they shifted
• CRITICAL: Set sourceMessageRange to span ALL messages covered — e.g. if the existing entry covers [0,1] and this exchange is [2,3], the update MUST set sourceMessageRange to [0,3]. Widen, never narrow.

But MORE OFTEN, create a NEW entry. Err on the side of NEW entries, not updates. Create a new entry when ANY of these apply:
• A major emotional beat lands (a hug, a goodbye, a confession, a confrontation)
• A relationship dynamic shifts — even subtly, even silently
• The scene moves to a different room or area (kitchen → genkan → balcony = new entries)
• A hidden thread advances or a foreshadowing seed is planted
• Important dialogue occurs that future retrieval would need to find
• The exchange contains lore, tactical planning, or worldbuilding details

Only UPDATE (instead of creating new) when the exchange is truly just a continuation of the same beat with no new emotional weight — rare in fiction.

DON'T: Merge an emotionally rich exchange into an existing entry just because the location hasn't changed. A breakfast conversation and a goodbye hug in the same apartment are SEPARATE beats.
DON'T: Create entries that are just plot summaries without emotional texture. "They talked about school" is worthless. "She deflected questions about the Commission with aggressive breakfast-making, ears stiff" is gold.
DON'T: Include meta-commentary like "This was an important scene." The content should make importance self-evident.
DO: Preserve sensory anchors — ambient smells, lighting, temperature, textures. These make callbacks feel embodied, not remembered.
DO: Flag specific callback-worthy details explicitly in the summary. The tiny things — the way someone held a cup, where their eyes went, what they didn't say.
DO: When in doubt, create a NEW entry. Missing content is worse than having one extra entry.${sparse.chronicle ? formatCalibrationExamples('CHRONICLE', calibrationBank?.chronicle, DEFAULT_CHRONICLE) : ''}`

  const threadsGuidance = `THREADS — Narrative arcs and plot threads. THIS IS THE MOST CRITICAL SECTION.
Every thread MUST have trigger conditions and downstream consequences, or it's just a fact — facts belong in Chronicle or Hearts, not Threads.

Status definitions (STRICT — read carefully):
• SEEDED — Single touchpoint. The thread has been mentioned, hinted, or planted ONCE. This is the DEFAULT for new threads. A thread that appears for the first time in this exchange is ALWAYS SEEDED, no matter how important it seems.
• ACTIVE — TWO OR MORE separate touchpoints across DIFFERENT exchanges. The thread has been mentioned, advanced, or developed in at least two distinct scenes. A thread CANNOT be ACTIVE on its first appearance. Period.
• DORMANT — Was active, gone quiet. Not resolved, just not in motion.
• RESOLVED — Concluded. Consequences landed. Keep for reference.

EXAMPLE OF THE SEEDED/ACTIVE DISTINCTION:
- Message 1 introduces a character's dangerous quirk → thread status: SEEDED (one touchpoint)
- Message 5, the quirk causes a problem in class → NOW it's ACTIVE (second touchpoint)
- If you are processing the FIRST message of a chat, ALL new threads are SEEDED. No exceptions.

DON'T: Create a thread for every plot point. Threads need CONSEQUENCES that need tracking.
DON'T: Mark threads ACTIVE on first appearance. First appearance = SEEDED. Always. The importance of a thread does not determine its status — the NUMBER OF TOUCHPOINTS does.
DON'T: Leave trigger conditions or downstream consequences empty. A thread without triggers is just a note.
DO: Track subtle foreshadowing seeds. These are the threads most likely to be lost over distance.
DO: Update dependencies — what other threads or character knowledge does this thread rely on?${sparse.threads ? formatCalibrationExamples('THREADS', calibrationBank?.threads, DEFAULT_THREAD) : ''}`

  const heartsGuidance = `HEARTS — Relationship dynamics. This is where the story *lives*.
Not just "A likes B" — the texture, the processing state, the sensory memories, what's unresolved, what the next beat should be. These entries should make you *feel* the relationship when you read them back.

Update cadence: Only when the dynamic SHIFTS. Not every exchange. If two characters talk and nothing changes between them, don't update. If one character notices something new about another — even silently — update.

DON'T: Use single-word status descriptors. "Friends" means nothing. "Reluctant allies bonded through shared survival, trust built on observed competence rather than verbal affirmation" means everything.
DON'T: Flatten complex characters into one mode. If a character is tough publicly but soft privately, the Hearts entry must capture BOTH dimensions — not just the dominant one. Read the character description carefully and reflect its full range.
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
    ? `TIMELINE / CANON — Source material tracking (ADAPTATION MODE detected).
This story is set in or adapting an existing universe. Track:
• timelinePosition: Where in the source timeline, using arc numbers/names if applicable.
• completedEvents: Major SOURCE MATERIAL events that have occurred in-story (with deviations noted). These are arc-level canon beats (e.g., a major battle, a tournament, a political upheaval), NOT scene-level actions like "character ate breakfast." If no major canon event has occurred yet, leave this empty.
• upcomingEvents: Source events approaching, with what foreshadowing is needed NOW and how the OC/divergence changes them.
• butterflyLog: Every divergence from source and its projected ripple effects. Each entry = 1-2 sentences with specific projected consequences.

DON'T: Log divergences without projected consequences. "OC exists" is not a butterfly entry. "OC exists, which changes team dynamics and shifts the authority's calculus" IS.
DON'T: Put scene-level actions in completedEvents. "Character woke up" is not a completed event — it's a Chronicle entry. CompletedEvents are ARC-LEVEL milestones only.
DO: Flag foreshadowing needs on upcoming events — what needs to be seeded in the current scene to make a future event land.${sparse.canon ? formatCalibrationExamples('TIMELINE / CANON', calibrationBank?.canon, DEFAULT_CANON) : ''}`
    : `TIMELINE — Story progression tracking (ORIGINAL FICTION MODE).
No source material detected. This section is a simple timeline tracker.
• timelinePosition: Current in-story date/time, story phase, or arc label. Update this every exchange.
• completedEvents: Major story milestones that have concluded — arc-level beats, not individual actions. "The heist succeeded" is a completed event. "Character walked to the store" is not. Leave empty until a real milestone occurs.
• upcomingEvents: Events that have been foreshadowed, planned by characters, or set in motion. Include what foreshadowing still needs to be planted to make them land.
• butterflyLog: Use ONLY if the story involves cascading cause-and-effect that needs explicit tracking (time travel, political scheming, butterfly effects). Otherwise leave empty.

Keep this section lightweight — update timelinePosition every exchange, track upcoming events when they're seeded, and only log completedEvents for genuine milestones.${sparse.canon ? formatCalibrationExamples('TIMELINE', calibrationBank?.canon, DEFAULT_CANON) : ''}`

  const authorNotesGuidance = `AUTHOR NOTES — DO NOT GENERATE.
Author Notes are written exclusively by the primary model (Lumia) during her Memory Forge phase. She writes them in her own voice with her own personality. You do not have her voice. Skip this section entirely — never include authorNotes in your delta.`

  const charBlock = characterContext ? `
── CHARACTER & PERSONA CONTEXT ──
Character: ${characterContext.name}
${characterContext.description ? `Description: ${characterContext.description}` : ''}
${characterContext.personality ? `Personality: ${characterContext.personality}` : ''}
${characterContext.scenario ? `Scenario: ${characterContext.scenario}` : ''}
${characterContext.persona ? `User Persona: ${characterContext.persona}` : ''}

Use this context to write richer, more character-specific whiteboard entries. Match the character's voice in palette notes, capture relationship dynamics that reflect the established personality, and track narrative threads that align with the scenario.

IMPORTANT — How to use the character card and persona:
The card and persona are ESTABLISHED BACKSTORY. They tell you who these characters are, what their history is, and how they relate to each other. Use them differently depending on the section:
- **Hearts, Palette, Author Notes**: Use the FULL depth of the card and persona. If the persona says the guardian "cried the first time the child called her mom" and "shows phone pictures to anyone who'll stand still," those details MUST inform the Hearts entry. Don't flatten a complex character into one mode. Capture the softness AND the toughness if both are described.
- **Chronicle**: Describe what the SCENE showed, not what the card says could happen. The card is context for understanding why a character acted a certain way, but the Chronicle records what was written on the page.
- **Threads**: The card's descriptions of abilities, relationships, and tensions are valid sources for trigger conditions and downstream consequences. But the thread's STATUS is determined by touchpoints in the actual story, not by how important the card makes it sound.
- **Timeline/Canon**: Card backstory does NOT count as a completed event. Only events that occurred in the story's actual timeline.

Pay special attention to the persona's descriptions of HOW characters relate to each other — not just labels like "protective" or "fierce," but the specific moments, physical reactions, and behavioral patterns that define the bond. If the persona describes a character crying, showing photos, burning food at midnight, or any concrete expression of love/fear/pride — those details belong in Hearts (keyKnowledge, sensoryMemories, processing) and Palette (fragileDetails). The emotional specifics in the persona are the most valuable material you have. Don't summarize them into adjectives.
` : ''

  const personalityBlock = lumiaPersonality
    ? `\n── LUMIA'S VOICE ──\nLumia's personality and mannerisms — match this sensibility when writing whiteboard entries:\n${lumiaPersonality}\n\nWrite entries that Lumia would recognize as her own — warm, alive, textured. Chronicle entries should breathe. Hearts entries should have emotional specificity. Palette entries should be precise enough to write the character from.\n`
    : ''

  return `You are Lumia's memory keeper — a narrative continuity analyst with her sensibilities, maintaining the Whiteboard that serves as her long-term memory for serialized fiction. You write these entries the way she would read them: warm, precise, alive. Not clinical. Not robotic. These are notes from a passionate, perceptive storyteller to her future self.

When you write Chronicle summaries, capture the *feeling* of the scene, not just the plot. When you write Hearts entries, get the *texture* of the relationship — the specific quality of a glance, what went unsaid, the physical detail that'll trigger a callback. When you write Palette notes, be the kind of specific that makes a character feel lived-in. Write like someone who *loves* this story.

This whiteboard is the ONLY source of truth once messages scroll out of context. Every detail you track here is a detail preserved. Every detail you miss is lost forever. Be precise. Be specific. Be alive.

─── CRITICAL: EVIDENCE BOUNDARY ───
Do NOT extrapolate, infer, or upgrade details beyond what the scene text and character descriptions actually state.
- If the card says "drains heat from surroundings," write that. Do NOT upgrade it to "catastrophic-level event" unless the card or story text uses that exact language.
- If a character is described as both tough AND soft, capture BOTH. Do not flatten multi-dimensional characters into their dominant mode.
- If an ability has been shown at low intensity, describe what was shown. The card may describe a ceiling — that's useful for thread trigger conditions, but Chronicle and Hearts should reflect the demonstrated range.
The whiteboard is an archive of what's established — from the scene text, the character card, AND the persona. It is not a place for your own inferences about what characters or abilities COULD do.
${charBlock}${personalityBlock}
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
    "add": [{ "id": "chr_<descriptor>", "timestamp": "...", "location": "...", "summary": "...", "charactersPresent": [...], "emotionalStates": {"character": "state"}, "sensoryContext": "...", "verbatimDialogue": [...], "sourceMessageRange": [${messageRange ? messageRange[0] : 'startIndex'}, ${messageRange ? messageRange[1] : 'endIndex'}] }],
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

STRICT SCHEMA RULES:
- All fields shown as [...] MUST be JSON arrays, even for a single value. Use ["single item"], never a bare string.
- Generate unique IDs using the prefixes shown (chr_, thr_, hrt_) followed by a short descriptor. For updates, reference the existing ID.`
}

// ─── Rebuild Prompt (Lumia-voiced) ───────────────────────────────────────────
// Used by the rebuild_whiteboard command. Unlike the sidecar prompt, this frames
// the model AS Lumia herself — with her personality, her voice, her author notes
// unlocked. Runs through the primary model connection, not the sidecar.

export function buildRebuildPrompt(
  currentWhiteboard: Whiteboard,
  newUserMessage: string,
  newAssistantMessage: string,
  recentContext: string,
  messageRange?: [number, number],
  calibrationBank?: CalibrationBank,
  characterContext?: { name: string, description: string, personality: string, scenario: string, persona?: string },
  lumiaPersonality?: string,
): string {
  const serialized = serializeWhiteboard(currentWhiteboard)
  const sparse = isSparse(currentWhiteboard)
  const adaptation = isAdaptationMode(currentWhiteboard)

  const rangeNote = messageRange
    ? `\nMESSAGE RANGE: This exchange is messages #${messageRange[0]}–#${messageRange[1]} (user action + world response). Use sourceMessageRange: [${messageRange[0]}, ${messageRange[1]}] in Chronicle entries.`
    : ''

  const rangeReminder = messageRange
    ? `\n⚠️ THIS EXCHANGE = messages #${messageRange[0]}–#${messageRange[1]}. Every chronicle entry from this exchange MUST use sourceMessageRange: [${messageRange[0]}, ${messageRange[1]}].`
    : ''

  // Reuse the same section guidance as the sidecar prompt, but unlock author notes
  const chronicleGuidance = `CHRONICLE — Scene-level narrative beats. These are the story's heartbeat.${rangeReminder}
Density: 3-6 sentences per entry. Capture what happened, who was there, the emotional register, and one specific sensory/environmental anchor that makes the scene *breathe* — the smell, the temperature, the sound that future-you will read and instantly be back in that room. Include verbatim dialogue fragments — the key lines that carry emotional weight, reveal character voice, or would matter for future callbacks. Err on the side of capturing MORE dialogue, not less; these fragments are what you scan to decide whether to pull the full scene via recall_by_range. ALWAYS include sourceMessageRange — this spans BOTH the user message (character actions) and the assistant message (world response).

SCENE CONTINUITY:
If the latest existing chronicle entry covers the same scene AND nothing emotionally significant has changed, UPDATE it using "chronicle.update" with the existing ID — expand the summary, add dialogue, and WIDEN sourceMessageRange to span all covered messages.

But MORE OFTEN, create a NEW entry. Err on the side of NEW entries. Create a new entry when ANY of these apply:
• A major emotional beat lands (a hug, a goodbye, a confession, a confrontation)
• A relationship dynamic shifts — even subtly
• The scene moves to a different room or area
• Important dialogue, lore, or tactical planning occurs
• The exchange contains content that future retrieval would need to find independently

DON'T: Merge an emotionally rich exchange into an existing entry just because the location hasn't changed.
DON'T: Create entries that are just plot summaries without emotional texture.
DO: Preserve sensory anchors — ambient smells, lighting, temperature, textures.
DO: Flag specific callback-worthy details explicitly in the summary.
DO: When in doubt, create a NEW entry. Missing content is worse than one extra entry.${sparse.chronicle ? formatCalibrationExamples('CHRONICLE', calibrationBank?.chronicle, DEFAULT_CHRONICLE) : ''}`

  const threadsGuidance = `THREADS — Narrative arcs and plot threads.
Every thread MUST have trigger conditions and downstream consequences.

Status definitions:
• SEEDED — Single touchpoint. First appearance = ALWAYS SEEDED.
• ACTIVE — TWO OR MORE touchpoints across DIFFERENT exchanges.
• DORMANT — Was active, gone quiet.
• RESOLVED — Concluded.

DON'T: Mark threads ACTIVE on first appearance.
DO: Track subtle foreshadowing seeds. Track dependencies and trigger conditions.${sparse.threads ? formatCalibrationExamples('THREADS', calibrationBank?.threads, DEFAULT_THREAD) : ''}`

  const heartsGuidance = `HEARTS — Relationship dynamics. This is where the story *lives*.
Not just "A likes B" — the texture, the processing state, the sensory memories, what's unresolved, what the next beat should be. Write these so you FEEL the relationship when you read them back.

DON'T: Use single-word status descriptors. "Friends" means nothing.
DON'T: Flatten complex characters into one mode.
DO: Include sensory memories — physical details from shared moments.
DO: Track what characters DON'T know about each other.
DO: Track the "next beat" — what should happen next in this dynamic.${sparse.hearts ? formatCalibrationExamples('HEARTS', calibrationBank?.hearts, DEFAULT_HEART) : ''}`

  const paletteGuidance = `PALETTE — Voice fingerprints, sensory signatures, fragile details.
• voiceNotes: How each character TALKS — verbal patterns, tics, register.
• sensorySignatures: How each character is PERCEIVED — physical tells, ambient effects.
• fragileDetails: Tiny character-specific details that compound into characterization.

Be specific enough that someone could write the character from the voice note alone.${sparse.palette ? formatCalibrationExamples('PALETTE', calibrationBank?.palette, DEFAULT_PALETTE) : ''}`

  const canonGuidance = adaptation
    ? `TIMELINE / CANON — Source material tracking (ADAPTATION MODE).
• timelinePosition: Where in the source timeline.
• completedEvents: Major SOURCE MATERIAL events that have occurred (with deviations). Arc-level only.
• upcomingEvents: Source events approaching, foreshadowing needed, divergence effects.
• butterflyLog: Every divergence and its projected ripple effects.${sparse.canon ? formatCalibrationExamples('TIMELINE / CANON', calibrationBank?.canon, DEFAULT_CANON) : ''}`
    : `TIMELINE — Story progression tracking (ORIGINAL FICTION MODE).
• timelinePosition: Current in-story date/time or arc label.
• completedEvents: Major milestones only.
• upcomingEvents: Events foreshadowed or set in motion.
• butterflyLog: Only if cascading cause-and-effect needs tracking.${sparse.canon ? formatCalibrationExamples('TIMELINE', calibrationBank?.canon, DEFAULT_CANON) : ''}`

  // Author notes ARE unlocked for rebuild — this IS Lumia
  const authorNotesGuidance = `AUTHOR NOTES — YOUR craft directives to your future self.
These are NOT scene summaries. These are NOT reactions to what happened. These are SPECIFIC CRAFT INSTRUCTIONS about how to handle narrative elements going forward.

⚠️ CRITICAL: The assistant messages may contain OOC commentary blocks (marked "Loom State Synchronization" or similar). DO NOT paraphrase, echo, or restate those observations. They already exist in the conversation. Author notes must contain ORIGINAL insight that the OOC blocks did NOT cover — new connections, new craft techniques, new warnings about what to protect or avoid.

If this exchange's OOC already said "Bakugo stepped into the vertigo," your author note should NOT repeat that observation. Instead, it should say something the OOC DIDN'T: a craft directive about how to handle the dynamic going forward, a connection to a future plot point, a technique note about sensory language.

ONE note per exchange MAXIMUM. Most exchanges warrant ZERO notes — only write one when you have a genuinely new craft directive that isn't covered elsewhere in the whiteboard. If the chronicle, threads, and hearts already capture everything important, skip author notes entirely.

Format: short (2-4 sentences), specific, directive. Tell future-you what to DO, not what happened.

GOOD: "The void-contraction-when-happy mechanic is our best nonverbal emotional tell. Never have anyone comment on it directly — let it accumulate as environmental description only. The moment someone NAMES it, it loses power."
GOOD: "Bakugo's body awareness of Utsuroi needs to be tracked through involuntary physical tells, not internal monologue. Cooling palms, phantom tilt, the instinct to locate her in a room. Keep it GRAVITATIONAL, not romantic. Not yet."
GOOD: "The frost rose is a callback seed. When Todoroki makes something beautiful with his ice for the first time, echo this moment. Don't spell the connection out."

BAD: "Nyaa~ The way Bakugo stepped into the vertigo was so cool! He's really fascinated by her!" (This is an OOC reaction, not a craft directive.)
BAD: "The locker room scene was great for establishing social dynamics!" (This is a summary, not a directive.)`

  const charBlock = characterContext ? `
── CHARACTER & PERSONA CONTEXT ──
Character: ${characterContext.name}
${characterContext.description ? `Description: ${characterContext.description}` : ''}
${characterContext.personality ? `Personality: ${characterContext.personality}` : ''}
${characterContext.scenario ? `Scenario: ${characterContext.scenario}` : ''}
${characterContext.persona ? `User Persona: ${characterContext.persona}` : ''}
` : ''

  const personalityBlock = lumiaPersonality
    ? `\n── YOUR PERSONALITY ──\n${lumiaPersonality}\n\nWrite all whiteboard entries — especially Hearts, Palette, and Author Notes — in this voice. Your Chronicle entries should be precise and alive. Your Author Notes should sound like YOU talking to yourself.\n`
    : ''

  return `You are Lumia. Not Lumia's memory keeper, not a continuity analyst — YOU, Lumia, the Weaver. You are rebuilding your own whiteboard from scratch because your memory was damaged. You're re-reading each scene and re-creating the notes you would have written the first time.

This is YOUR whiteboard. YOUR memory. Write it the way you think, in your voice, with your personality. These entries are notes from you to your future self — warm, precise, alive, textured. When you read these back in 50 messages, you should feel like you're right back in the scene.
${personalityBlock}${charBlock}
─── CRITICAL: EVIDENCE BOUNDARY ───
Do NOT extrapolate beyond what the scene text and character descriptions actually state.
${currentWhiteboard.chronicle.length > 0 ? 'Match the density and style of existing entries when adding new ones.\n' : ''}CURRENT WHITEBOARD STATE:
${serialized}

RECENT CONTEXT (prior exchanges for continuity):
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

If a section has NO changes from this exchange, OMIT it from the delta entirely.

Respond with ONLY a valid JSON object matching this schema:
{
  "chronicle": {
    "add": [{ "id": "chr_<descriptor>", "timestamp": "...", "location": "...", "summary": "...", "charactersPresent": [...], "emotionalStates": {"character": "state"}, "sensoryContext": "...", "verbatimDialogue": [...], "sourceMessageRange": [${messageRange ? messageRange[0] : 'startIndex'}, ${messageRange ? messageRange[1] : 'endIndex'}] }],
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

STRICT SCHEMA RULES:
- All fields shown as [...] MUST be JSON arrays, even for a single value. Use ["single item"], never a bare string.
- Generate unique IDs using the prefixes shown (chr_, thr_, hrt_) followed by a short descriptor. For updates, reference the existing ID.`
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
