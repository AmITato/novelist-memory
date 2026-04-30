declare const spindle: import('lumiverse-spindle-types').SpindleAPI

// ─── Token Counting ──────────────────────────────────────────────────────────
// Thin wrapper around `spindle.tokens.countText` with graceful fallback to a
// char/4 estimate when the spindle call fails (no main connection configured,
// no userId for an operator-scoped extension, etc.). The extension should
// never crash because tokenization couldn't resolve a model.

export interface TokenCount {
  count: number
  /** True when the count came from the char/4 fallback or Lumiverse's own approximate path. */
  approximate: boolean
  /** The tokenizer name from Lumiverse, or 'fallback' when our wrapper bailed. */
  tokenizer: string
}

/**
 * Count tokens for an arbitrary text string.
 *
 * Uses Lumiverse's server-side tokenizer (the configured main connection's
 * model by default). Falls back to a char/4 estimate if the call fails.
 *
 * For operator-scoped extensions (this one), `userId` should be threaded
 * through whenever it's available. Without it the spindle call will reject
 * and we'll silently fall back.
 */
export async function countTokens(text: string, userId?: string): Promise<TokenCount> {
  if (!text) return { count: 0, approximate: false, tokenizer: 'empty' }

  try {
    const result = await spindle.tokens.countText(text, { userId, modelSource: 'main' })
    return {
      count: result.total_tokens,
      approximate: result.approximate,
      tokenizer: result.tokenizer_name,
    }
  } catch (err) {
    spindle.log.warn(`[NovelistMemory] Token counting failed, using char/4 fallback: ${err}`)
    return {
      count: Math.ceil(text.length / 4),
      approximate: true,
      tokenizer: 'fallback',
    }
  }
}

/**
 * Synchronous char/4 estimate. Use this only when async isn't an option
 * (e.g., logging hot paths). Prefer `countTokens` everywhere else.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
