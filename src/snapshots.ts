import type { WhiteboardSnapshot, Whiteboard, WhiteboardDelta } from './types'
import { getWhiteboard, saveWhiteboard, applyDelta } from './whiteboard'
import { getConfig } from './config'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

// ─── Storage ─────────────────────────────────────────────────────────────────

function snapshotPath(chatId: string): string {
  return `snapshots/${chatId}.json`
}

function makeSnapshotId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function getSnapshots(chatId: string): Promise<WhiteboardSnapshot[]> {
  const path = snapshotPath(chatId)
  const exists = await spindle.storage.exists(path)
  if (!exists) return []
  return spindle.storage.getJson<WhiteboardSnapshot[]>(path, { fallback: [] })
}

async function saveSnapshots(chatId: string, snapshots: WhiteboardSnapshot[]): Promise<void> {
  await spindle.storage.setJson(snapshotPath(chatId), snapshots, { indent: 2 })
}

// ─── Snapshot Creation ──────────────────────────────────────────────────────

export async function createSnapshot(
  chatId: string,
  messageId: string,
  swipeId: number,
  messageIndex: number,
  finalState: Whiteboard,
  deltas: WhiteboardDelta[],
  source: WhiteboardSnapshot['source'],
): Promise<WhiteboardSnapshot> {
  const snapshot: WhiteboardSnapshot = {
    id: makeSnapshotId(),
    chatId,
    messageId,
    swipeId,
    messageIndex,
    state: structuredClone(finalState),
    deltas,
    source,
    timestamp: new Date().toISOString(),
  }

  const snapshots = await getSnapshots(chatId)
  snapshots.push(snapshot)
  await saveSnapshots(chatId, snapshots)

  spindle.log.info(`[NovelistMemory] Snapshot created: ${snapshot.id} (msg ${messageId}, swipe ${swipeId}, idx ${messageIndex})`)
  return snapshot
}

// ─── Snapshot Lookup ────────────────────────────────────────────────────────

/**
 * Find the snapshot for a specific message + swipe combination.
 * Returns the most recent one if multiple exist (e.g., direct edit then updater).
 */
export async function getSnapshotForSwipe(
  chatId: string,
  messageId: string,
  swipeId: number,
): Promise<WhiteboardSnapshot | null> {
  const snapshots = await getSnapshots(chatId)
  // Walk backwards — most recent first
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (snapshots[i].messageId === messageId && snapshots[i].swipeId === swipeId) {
      return snapshots[i]
    }
  }
  return null
}

/**
 * Get the whiteboard state from BEFORE a given message had any effect.
 * This is the latest snapshot whose messageId is NOT the target message.
 * Used for regen rewind — restores the whiteboard to what it was before
 * the message being regenerated ever touched it.
 */
export async function getPreMessageState(
  chatId: string,
  messageId: string,
): Promise<Whiteboard | null> {
  const snapshots = await getSnapshots(chatId)
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (snapshots[i].messageId !== messageId) {
      return snapshots[i].state
    }
  }
  return null
}

/**
 * Find the latest snapshot at or before a given message index.
 * Used for fork seeding — the fork diverges at a message index, and we need
 * the whiteboard state as it was at that point.
 */
export async function getLatestSnapshotAtOrBefore(
  chatId: string,
  messageIndex: number,
): Promise<WhiteboardSnapshot | null> {
  const snapshots = await getSnapshots(chatId)
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (snapshots[i].messageIndex <= messageIndex) {
      return snapshots[i]
    }
  }
  return null
}

/**
 * Get all snapshots for a specific message (all swipe variants).
 * Used for fork seeding — when the fork point message has multiple swipes,
 * we copy all of them so swipe navigation works in the new branch.
 */
export async function getSnapshotsForMessage(
  chatId: string,
  messageId: string,
): Promise<WhiteboardSnapshot[]> {
  const snapshots = await getSnapshots(chatId)
  return snapshots.filter(s => s.messageId === messageId)
}

// ─── Snapshot Removal for Regen ─────────────────────────────────────────────

/**
 * Remove all snapshots for a specific message.
 * Called during regen rewind — the old generation's snapshots are invalidated
 * because the message is being regenerated.
 */
export async function removeSnapshotsForMessage(
  chatId: string,
  messageId: string,
): Promise<void> {
  const snapshots = await getSnapshots(chatId)
  const filtered = snapshots.filter(s => s.messageId !== messageId)
  if (filtered.length !== snapshots.length) {
    await saveSnapshots(chatId, filtered)
    spindle.log.info(`[NovelistMemory] Removed ${snapshots.length - filtered.length} snapshot(s) for message ${messageId} (regen rewind)`)
  }
}

// ─── Fork Seeding ───────────────────────────────────────────────────────────

/**
 * Seed a forked branch's whiteboard from its parent chat's snapshots.
 *
 * The fork creates a new chat with messages copied up to the fork point.
 * We need to:
 * 1. Find the parent's whiteboard state at the fork point
 * 2. Set that as the new branch's whiteboard
 * 3. Copy the parent's snapshots for the fork-point message (all swipe variants)
 *    so swipe navigation works on the branch's tip
 *
 * Returns the seeded whiteboard, or null if seeding wasn't possible.
 */
export async function seedFromParent(
  newChatId: string,
  parentChatId: string,
  forkMessageId: string,
): Promise<Whiteboard | null> {
  // Find the fork-point message's index in the parent's snapshots
  const parentSnapshots = await getSnapshots(parentChatId)
  if (parentSnapshots.length === 0) {
    // Parent has no snapshots — no tracked state exists at the fork point.
    // Leave the whiteboard blank rather than copying stale/wrong state.
    spindle.log.info(`[NovelistMemory] Fork seeding: parent ${parentChatId} has no snapshots, leaving whiteboard blank`)
    return null
  }

  // Find the snapshot(s) for the fork-point message
  const forkPointSnapshots = parentSnapshots.filter(s => s.messageId === forkMessageId)

  if (forkPointSnapshots.length > 0) {
    // We have snapshots for the exact fork-point message.
    // Use the latest one's state as the seed.
    const latestForkSnapshot = forkPointSnapshots[forkPointSnapshots.length - 1]
    const seeded = structuredClone(latestForkSnapshot.state)
    seeded.chatId = newChatId
    await saveWhiteboard(seeded)

    // Copy all fork-point snapshots to the new branch.
    // The messageIds won't match (fork copies messages with new IDs), but we'll
    // need to remap them. We can do this by reading the new branch's messages
    // and finding the last one (which corresponds to the fork-point message).
    try {
      const newMessages = await spindle.chat.getMessages(newChatId)
      if (newMessages.length > 0) {
        const tipMessage = newMessages[newMessages.length - 1] as { id: string, swipe_id: number }
        const remapped: WhiteboardSnapshot[] = forkPointSnapshots.map(s => ({
          ...structuredClone(s),
          id: makeSnapshotId(),
          chatId: newChatId,
          messageId: tipMessage.id,
          // messageIndex stays the same — fork preserves index_in_chat
        }))
        // Also update the state's chatId in each snapshot
        for (const snap of remapped) {
          snap.state.chatId = newChatId
        }
        await saveSnapshots(newChatId, remapped)
      }
    } catch {
      // If we can't read messages, at least we seeded the whiteboard
      spindle.log.warn('[NovelistMemory] Fork seeding: could not remap snapshots for swipe navigation')
    }

    spindle.log.info(`[NovelistMemory] Fork seeded from parent ${parentChatId} at message ${forkMessageId}`)
    return seeded
  }

  // No snapshots for the exact fork-point message.
  // Find the latest snapshot at or before the fork point's index.
  // We need to figure out the fork-point's messageIndex first.
  try {
    const parentMessages = await spindle.chat.getMessages(parentChatId)
    const forkIdx = parentMessages.findIndex((m: { id: string }) => m.id === forkMessageId)
    if (forkIdx >= 0) {
      const closest = await getLatestSnapshotAtOrBefore(parentChatId, forkIdx)
      if (closest) {
        const seeded = structuredClone(closest.state)
        seeded.chatId = newChatId
        await saveWhiteboard(seeded)
        spindle.log.info(`[NovelistMemory] Fork seeded from nearest snapshot at index ${closest.messageIndex}`)
        return seeded
      }
    }
  } catch { /* fall through */ }

  // No snapshot found for the fork point — leave blank rather than copying wrong state
  spindle.log.info(`[NovelistMemory] Fork seeding: could not locate fork point snapshot, leaving whiteboard blank`)
  return null
}

// ─── Pruning ────────────────────────────────────────────────────────────────

/**
 * Prune old snapshots to keep storage bounded.
 *
 * Retention policy:
 * - Keep ALL swipe snapshots for the last `snapshotRetentionAllSwipes` messages
 *   (the active swipe zone — user is likely to swipe here)
 * - Keep the LATEST snapshot per message for the last `snapshotRetentionMessages` messages
 * - Drop everything older
 */
export async function pruneSnapshots(chatId: string): Promise<void> {
  const config = await getConfig()
  const snapshots = await getSnapshots(chatId)
  if (snapshots.length === 0) return

  // Collect unique messageIds in order of last appearance
  const messageOrder: string[] = []
  const seen = new Set<string>()
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (!seen.has(snapshots[i].messageId)) {
      messageOrder.unshift(snapshots[i].messageId)
      seen.add(snapshots[i].messageId)
    }
  }

  // The last N messages that get full swipe retention
  const allSwipeMessages = new Set(
    messageOrder.slice(-config.snapshotRetentionAllSwipes)
  )

  // The last M messages that get latest-per-message retention
  const retainMessages = new Set(
    messageOrder.slice(-config.snapshotRetentionMessages)
  )

  // Build the set of snapshots to keep
  const kept: WhiteboardSnapshot[] = []
  const latestPerMessage = new Map<string, WhiteboardSnapshot>()

  for (const snap of snapshots) {
    if (allSwipeMessages.has(snap.messageId)) {
      // Keep all swipe snapshots for recent messages
      kept.push(snap)
    } else if (retainMessages.has(snap.messageId)) {
      // Keep only the latest per message
      const existing = latestPerMessage.get(snap.messageId)
      if (!existing || snap.timestamp > existing.timestamp) {
        latestPerMessage.set(snap.messageId, snap)
      }
    }
    // Everything else gets dropped
  }

  // Add the latest-per-message entries
  for (const snap of latestPerMessage.values()) {
    kept.push(snap)
  }

  // Sort by timestamp to maintain order
  kept.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  if (kept.length < snapshots.length) {
    await saveSnapshots(chatId, kept)
    spindle.log.info(`[NovelistMemory] Pruned snapshots for ${chatId}: ${snapshots.length} → ${kept.length}`)
  }
}
