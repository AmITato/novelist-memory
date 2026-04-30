import type { NovelistConfig } from './types'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

const CONFIG_FILE = 'config.json'

const DEFAULT_CONFIG: NovelistConfig = {
  enabled: true,
  slidingWindowSize: 6,
  autoCommitUpdates: true,
  updateReviewWindowMs: 30000,
  whiteboardTokenBudget: 12000,
  useSidecar: true,
  compactionThreshold: 100,
  auditIntervalMessages: 40,
  directEditRequiresReview: false,
  snapshotRetentionMessages: 10,
  snapshotRetentionAllSwipes: 1,
  includeCharacterContext: true,
}

/**
 * Resolve the connection ID to use for background LLM calls (updater + intern).
 * Priority: explicit override → sidecar (if useSidecar enabled) → undefined (active connection).
 */
export async function resolveBackgroundConnectionId(overrideConnectionId?: string, userId?: string): Promise<string | undefined> {
  if (overrideConnectionId) return overrideConnectionId

  const config = await getConfig()
  if (!config.useSidecar) return undefined

  try {
    const councilSettings = await (spindle.council.getSettings as Function)(userId ? { userId } : undefined)
    // Check sidecar config in council tools settings
    const toolsSettings = councilSettings.toolsSettings as Record<string, unknown> | undefined
    const sidecar = toolsSettings?.sidecar as Record<string, unknown> | undefined
    const sidecarConnectionId = sidecar?.connectionProfileId as string | undefined
    if (sidecarConnectionId) return sidecarConnectionId
  } catch { /* no council settings or no sidecar configured */ }

  return undefined
}

let cachedConfig: NovelistConfig | null = null

export async function getConfig(): Promise<NovelistConfig> {
  if (cachedConfig) return cachedConfig
  cachedConfig = await spindle.storage.getJson<NovelistConfig>(CONFIG_FILE, { fallback: DEFAULT_CONFIG })
  return cachedConfig
}

export async function saveConfig(config: Partial<NovelistConfig>): Promise<NovelistConfig> {
  const current = await getConfig()
  const merged = { ...current, ...config }
  await spindle.storage.setJson(CONFIG_FILE, merged, { indent: 2 })
  cachedConfig = merged
  return merged
}

export function invalidateConfigCache(): void {
  cachedConfig = null
}
