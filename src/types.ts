// ─── Whiteboard Types ────────────────────────────────────────────────────────

export interface Whiteboard {
  chatId: string
  lastUpdated: string
  chronicle: ChronicleEntry[]
  threads: ThreadEntry[]
  hearts: HeartEntry[]
  palette: PaletteSection
  canon: CanonSection
  authorNotes: string[]
}

export interface ChronicleEntry {
  id: string
  timestamp: string
  location: string
  summary: string
  charactersPresent: string[]
  emotionalStates: Record<string, string>
  sensoryContext: string
  verbatimDialogue?: string[]
  sourceMessageRange?: [number, number]
}

export interface ThreadEntry {
  id: string
  name: string
  status: 'ACTIVE' | 'DORMANT' | 'SEEDED' | 'RESOLVED'
  lastTouched: string
  summary: string
  dependencies: string[]
  triggerConditions: string[]
  downstreamConsequences: string[]
}

export interface HeartEntry {
  id: string
  from: string
  to: string
  status: string
  keyKnowledge: string[]
  processing: string
  sensoryMemories: string[]
  unresolved: string[]
  nextBeat: string
}

export interface PaletteSection {
  formattingAssignments: Record<string, string>
  voiceNotes: Record<string, string>
  sensorySignatures: Record<string, string>
  fragileDetails: string[]
}

export interface CanonSection {
  timelinePosition: string
  completedEvents: CanonEvent[]
  upcomingEvents: CanonEvent[]
  butterflyLog: ButterflyEntry[]
}

export interface CanonEvent {
  event: string
  deviations?: string
  foreshadowingNeeded?: string
}

export interface ButterflyEntry {
  change: string
  projectedConsequences: string
}

// ─── Archive Types ───────────────────────────────────────────────────────────

export interface Archive {
  chatId: string
  messages: ArchivedMessage[]
}

export interface ArchivedMessage {
  messageIndex: number
  messageId: string
  role: 'user' | 'assistant' | 'system'
  inStoryTimestamp?: string
  charactersPresent: string[]
  sceneDescriptor: string
  emotionalRegister: string
  activeThreads: string[]
  content: string
  tokenEstimate: number
}

// ─── Intern Types ────────────────────────────────────────────────────────────

export interface InternQuery {
  query: string
  intent?: string
  maxResults?: number
}

export interface InternResult {
  source: string
  emotionalRegister: string
  keyContent: string
  relevanceNote: string
  fullScene: string
  tokenCount: number
}

// ─── Config Types ────────────────────────────────────────────────────────────

export interface NovelistConfig {
  enabled: boolean
  slidingWindowSize: number
  autoCommitUpdates: boolean
  updateReviewWindowMs: number
  whiteboardTokenBudget: number
  useSidecar: boolean
  internModel?: string
  internConnectionId?: string
  updaterModel?: string
  updaterConnectionId?: string
  compactionThreshold: number
  auditIntervalMessages: number
  directEditRequiresReview: boolean
  snapshotRetentionMessages: number
  snapshotRetentionAllSwipes: number
}

// ─── Calibration Bank Types ─────────────────────────────────────────────────

export interface CalibrationBank {
  chatId: string
  chronicle?: string[]
  threads?: string[]
  hearts?: string[]
  palette?: string[]
  canon?: string[]
  authorNotes?: string[]
}

// ─── Update Types ────────────────────────────────────────────────────────────

export interface PendingUpdate {
  id: string
  chatId: string
  timestamp: string
  changes: WhiteboardDelta
  sourceMessageId?: string
  status: 'pending' | 'committed' | 'rejected' | 'edited'
  autoCommitAt?: number
}

export interface WhiteboardDelta {
  chronicle?: { add?: ChronicleEntry[], update?: Partial<ChronicleEntry>[] }
  threads?: { add?: ThreadEntry[], update?: Partial<ThreadEntry>[] }
  hearts?: { add?: HeartEntry[], update?: Partial<HeartEntry>[] }
  palette?: Partial<PaletteSection>
  canon?: Partial<CanonSection>
  authorNotes?: { add?: string[], remove?: number[] }
}

// ─── Snapshot Types ─────────────────────────────────────────────────────────

export interface WhiteboardSnapshot {
  id: string
  chatId: string
  messageId: string
  swipeId: number
  messageIndex: number
  state: Whiteboard
  deltas: WhiteboardDelta[]
  source: 'updater' | 'direct_edit' | 'combined'
  timestamp: string
}
