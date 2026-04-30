import type { Whiteboard, WhiteboardDelta, PendingUpdate, ChronicleEntry, ThreadEntry, HeartEntry, CalibrationBank } from './types'
import { getConfig } from './config'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

// ─── Storage ─────────────────────────────────────────────────────────────────

function whiteboardPath(chatId: string): string {
  return `whiteboards/${chatId}.json`
}

function pendingPath(chatId: string): string {
  return `pending/${chatId}.json`
}

export function createEmptyWhiteboard(chatId: string): Whiteboard {
  return {
    chatId,
    lastUpdated: new Date().toISOString(),
    chronicle: [],
    threads: [],
    hearts: [],
    palette: {
      formattingAssignments: {},
      voiceNotes: {},
      sensorySignatures: {},
      fragileDetails: [],
    },
    canon: {
      timelinePosition: '',
      completedEvents: [],
      upcomingEvents: [],
      butterflyLog: [],
    },
    authorNotes: [],
  }
}

export async function getWhiteboard(chatId: string): Promise<Whiteboard> {
  const path = whiteboardPath(chatId)
  const exists = await spindle.storage.exists(path)
  if (!exists) {
    const empty = createEmptyWhiteboard(chatId)
    await spindle.storage.setJson(path, empty, { indent: 2 })
    return empty
  }
  return spindle.storage.getJson<Whiteboard>(path, { fallback: createEmptyWhiteboard(chatId) })
}

export async function saveWhiteboard(whiteboard: Whiteboard): Promise<void> {
  whiteboard.lastUpdated = new Date().toISOString()
  await spindle.storage.setJson(whiteboardPath(whiteboard.chatId), whiteboard, { indent: 2 })
}

// ─── Calibration Bank ───────────────────────────────────────────────────────

function calibrationPath(chatId: string): string {
  return `calibration/${chatId}.json`
}

export async function getCalibrationBank(chatId: string): Promise<CalibrationBank> {
  const path = calibrationPath(chatId)
  const exists = await spindle.storage.exists(path)
  if (!exists) return { chatId }
  return spindle.storage.getJson<CalibrationBank>(path, { fallback: { chatId } })
}

export async function saveCalibrationBank(bank: CalibrationBank): Promise<void> {
  await spindle.storage.setJson(calibrationPath(bank.chatId), bank, { indent: 2 })
}

// ─── Delta Application ──────────────────────────────────────────────────────

export function applyDelta(whiteboard: Whiteboard, delta: WhiteboardDelta): Whiteboard {
  const updated = structuredClone(whiteboard)

  if (delta.chronicle) {
    if (delta.chronicle.add) {
      for (const entry of delta.chronicle.add) {
        entry.charactersPresent ??= []
        entry.emotionalStates ??= {}
        entry.sensoryContext ??= ''
      }
      updated.chronicle.push(...delta.chronicle.add)
    }
    if (delta.chronicle.update) {
      for (const partial of delta.chronicle.update) {
        const existing = updated.chronicle.find(c => c.id === partial.id)
        if (existing) Object.assign(existing, partial)
      }
    }
  }

  if (delta.threads) {
    if (delta.threads.add) {
      // Backfill optional array fields the model may omit — the tool schema
      // doesn't mark them required, but the serializer and type expect arrays.
      for (const thread of delta.threads.add) {
        thread.dependencies ??= []
        thread.triggerConditions ??= []
        thread.downstreamConsequences ??= []
      }
      updated.threads.push(...delta.threads.add)
    }
    if (delta.threads.update) {
      for (const partial of delta.threads.update) {
        const existing = updated.threads.find(t => t.id === partial.id)
        if (existing) Object.assign(existing, partial)
      }
    }
  }

  if (delta.hearts) {
    if (delta.hearts.add) {
      // Backfill optional fields — same reason as threads above.
      for (const heart of delta.hearts.add) {
        heart.keyKnowledge ??= []
        heart.processing ??= ''
        heart.sensoryMemories ??= []
        heart.unresolved ??= []
        heart.nextBeat ??= ''
      }
      updated.hearts.push(...delta.hearts.add)
    }
    if (delta.hearts.update) {
      for (const partial of delta.hearts.update) {
        const existing = updated.hearts.find(h => h.id === partial.id)
        if (existing) Object.assign(existing, partial)
      }
    }
  }

  if (delta.palette) {
    if (delta.palette.formattingAssignments)
      Object.assign(updated.palette.formattingAssignments, delta.palette.formattingAssignments)
    if (delta.palette.voiceNotes)
      Object.assign(updated.palette.voiceNotes, delta.palette.voiceNotes)
    if (delta.palette.sensorySignatures)
      Object.assign(updated.palette.sensorySignatures, delta.palette.sensorySignatures)
    if (delta.palette.fragileDetails)
      updated.palette.fragileDetails.push(...delta.palette.fragileDetails)
  }

  if (delta.canon) {
    if (delta.canon.timelinePosition) updated.canon.timelinePosition = delta.canon.timelinePosition
    if (delta.canon.completedEvents) updated.canon.completedEvents.push(...delta.canon.completedEvents)
    if (delta.canon.upcomingEvents) updated.canon.upcomingEvents = delta.canon.upcomingEvents
    if (delta.canon.butterflyLog) updated.canon.butterflyLog.push(...delta.canon.butterflyLog)
  }

  if (delta.authorNotes) {
    if (delta.authorNotes.remove) {
      const indices = new Set(delta.authorNotes.remove)
      updated.authorNotes = updated.authorNotes.filter((_, i) => !indices.has(i))
    }
    if (delta.authorNotes.add) updated.authorNotes.push(...delta.authorNotes.add)
  }

  return updated
}

// ─── Pending Updates ────────────────────────────────────────────────────────

export async function getPendingUpdates(chatId: string): Promise<PendingUpdate[]> {
  const path = pendingPath(chatId)
  const exists = await spindle.storage.exists(path)
  if (!exists) return []
  return spindle.storage.getJson<PendingUpdate[]>(path, { fallback: [] })
}

export async function savePendingUpdate(update: PendingUpdate): Promise<void> {
  const pending = await getPendingUpdates(update.chatId)
  pending.push(update)
  await spindle.storage.setJson(pendingPath(update.chatId), pending, { indent: 2 })
}

export async function commitPendingUpdate(chatId: string, updateId: string): Promise<Whiteboard> {
  const pending = await getPendingUpdates(chatId)
  const update = pending.find(p => p.id === updateId)
  if (!update) throw new Error(`Pending update ${updateId} not found`)
  if (update.status === 'committed') return getWhiteboard(chatId)
  if (update.status === 'rejected') throw new Error(`Update ${updateId} was already rejected`)

  const whiteboard = await getWhiteboard(chatId)
  const updated = applyDelta(whiteboard, update.changes)
  await saveWhiteboard(updated)

  update.status = 'committed'
  await spindle.storage.setJson(pendingPath(chatId), pending, { indent: 2 })

  return updated
}

export async function rejectPendingUpdate(chatId: string, updateId: string): Promise<void> {
  const pending = await getPendingUpdates(chatId)
  const update = pending.find(p => p.id === updateId)
  if (!update) return
  update.status = 'rejected'
  await spindle.storage.setJson(pendingPath(chatId), pending, { indent: 2 })
}

export async function autoCommitDueUpdates(chatId: string): Promise<void> {
  const config = await getConfig()
  if (!config.autoCommitUpdates) return

  const pending = await getPendingUpdates(chatId)
  const now = Date.now()
  let changed = false

  for (const update of pending) {
    if (update.status !== 'pending') continue
    if (update.autoCommitAt && now >= update.autoCommitAt) {
      await commitPendingUpdate(chatId, update.id)
      changed = true
    }
  }
}

// ─── Serialization for Context Injection ────────────────────────────────────

export function serializeWhiteboard(wb: Whiteboard): string {
  const sections: string[] = []

  sections.push('=== NOVELIST MEMORY: WHITEBOARD ===\n')

  // Chronicle
  if (wb.chronicle.length > 0) {
    sections.push('── CHRONICLE ──')
    for (const entry of wb.chronicle) {
      const chars = entry.charactersPresent.length > 0 ? ` | Characters: ${entry.charactersPresent.join(', ')}` : ''
      const msgs = entry.sourceMessageRange ? ` | Messages: #${entry.sourceMessageRange[0]}–#${entry.sourceMessageRange[1]}` : ''
      sections.push(`[${entry.timestamp}, ${entry.location}]${chars}${msgs}`)
      sections.push(entry.summary)
      if (entry.emotionalStates && Object.keys(entry.emotionalStates).length > 0) {
        const emotions = Object.entries(entry.emotionalStates).map(([k, v]) => `${k}: ${v}`).join('; ')
        sections.push(`Emotional states: ${emotions}`)
      }
      if (entry.sensoryContext) sections.push(`Atmosphere: ${entry.sensoryContext}`)
      if (entry.verbatimDialogue && entry.verbatimDialogue.length > 0) {
        sections.push(`Key dialogue: ${entry.verbatimDialogue.join(' | ')}`)
      }
      sections.push('')
    }
  }

  // Threads
  if (wb.threads.length > 0) {
    sections.push('── THREADS ──')
    for (const thread of wb.threads) {
      sections.push(`${thread.name} — STATUS: ${thread.status}`)
      sections.push(`Last touched: ${thread.lastTouched}`)
      sections.push(`What: ${thread.summary}`)
      if (thread.dependencies?.length > 0)
        sections.push(`Dependencies: ${thread.dependencies.join('; ')}`)
      if (thread.triggerConditions?.length > 0)
        sections.push(`Triggers: ${thread.triggerConditions.join('; ')}`)
      if (thread.downstreamConsequences?.length > 0)
        sections.push(`Downstream: ${thread.downstreamConsequences.join('; ')}`)
      sections.push('')
    }
  }

  // Hearts
  if (wb.hearts.length > 0) {
    sections.push('── HEARTS ──')
    for (const heart of wb.hearts) {
      sections.push(`${heart.from} → ${heart.to}:`)
      sections.push(`  Status: ${heart.status}`)
      if (heart.keyKnowledge?.length > 0)
        sections.push(`  Key knowledge: ${heart.keyKnowledge.join('; ')}`)
      if (heart.processing) sections.push(`  Processing: ${heart.processing}`)
      if (heart.sensoryMemories?.length > 0)
        sections.push(`  Sensory memories: ${heart.sensoryMemories.join('; ')}`)
      if (heart.unresolved?.length > 0)
        sections.push(`  Unresolved: ${heart.unresolved.join('; ')}`)
      if (heart.nextBeat) sections.push(`  Next beat: ${heart.nextBeat}`)
      sections.push('')
    }
  }

  // Palette
  const hasPalette = Object.keys(wb.palette.voiceNotes).length > 0
    || Object.keys(wb.palette.sensorySignatures).length > 0
    || wb.palette.fragileDetails.length > 0
    || Object.keys(wb.palette.formattingAssignments).length > 0

  if (hasPalette) {
    sections.push('── PALETTE ──')
    if (Object.keys(wb.palette.formattingAssignments).length > 0) {
      sections.push('Formatting:')
      for (const [k, v] of Object.entries(wb.palette.formattingAssignments))
        sections.push(`  ${k}: ${v}`)
    }
    if (Object.keys(wb.palette.voiceNotes).length > 0) {
      sections.push('Voice notes:')
      for (const [k, v] of Object.entries(wb.palette.voiceNotes))
        sections.push(`  ${k}: ${v}`)
    }
    if (Object.keys(wb.palette.sensorySignatures).length > 0) {
      sections.push('Sensory signatures:')
      for (const [k, v] of Object.entries(wb.palette.sensorySignatures))
        sections.push(`  ${k}: ${v}`)
    }
    if (wb.palette.fragileDetails.length > 0) {
      sections.push('Fragile details:')
      for (const detail of wb.palette.fragileDetails)
        sections.push(`  • ${detail}`)
    }
    sections.push('')
  }

  // Canon
  const hasCanon = wb.canon.timelinePosition
    || wb.canon.completedEvents.length > 0
    || wb.canon.upcomingEvents.length > 0
    || wb.canon.butterflyLog.length > 0

  if (hasCanon) {
    sections.push('── CANON ──')
    if (wb.canon.timelinePosition)
      sections.push(`Timeline position: ${wb.canon.timelinePosition}`)
    if (wb.canon.completedEvents.length > 0) {
      sections.push('Completed events:')
      for (const event of wb.canon.completedEvents) {
        const dev = event.deviations ? ` (Deviation: ${event.deviations})` : ''
        sections.push(`  • ${event.event}${dev}`)
      }
    }
    if (wb.canon.upcomingEvents.length > 0) {
      sections.push('Upcoming events:')
      for (const event of wb.canon.upcomingEvents) {
        const foreshadow = event.foreshadowingNeeded ? ` [Foreshadow: ${event.foreshadowingNeeded}]` : ''
        sections.push(`  • ${event.event}${foreshadow}`)
      }
    }
    if (wb.canon.butterflyLog.length > 0) {
      sections.push('Butterfly log:')
      for (const entry of wb.canon.butterflyLog)
        sections.push(`  • ${entry.change} → ${entry.projectedConsequences}`)
    }
    sections.push('')
  }

  // Author Notes
  if (wb.authorNotes.length > 0) {
    sections.push('── AUTHOR NOTES ──')
    for (const note of wb.authorNotes)
      sections.push(`• ${note}`)
    sections.push('')
  }

  sections.push('=== END WHITEBOARD ===')

  return sections.join('\n')
}
