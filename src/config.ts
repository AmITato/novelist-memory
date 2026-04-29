import type { NovelistConfig } from './types'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

const CONFIG_FILE = 'config.json'

const DEFAULT_CONFIG: NovelistConfig = {
  enabled: true,
  slidingWindowSize: 6,
  autoCommitUpdates: true,
  updateReviewWindowMs: 30000,
  whiteboardTokenBudget: 12000,
  compactionThreshold: 100,
  auditIntervalMessages: 40,
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
