import type { Archive, ArchivedMessage } from './types'
import { getConfig } from './config'

declare const spindle: import('lumiverse-spindle-types').SpindleAPI

// ─── Storage ─────────────────────────────────────────────────────────────────

function archivePath(chatId: string): string {
  return `archives/${chatId}.json`
}

function indexPath(chatId: string): string {
  return `archives/${chatId}.index.json`
}

export async function getArchive(chatId: string): Promise<Archive> {
  const path = archivePath(chatId)
  const exists = await spindle.storage.exists(path)
  if (!exists) return { chatId, messages: [] }
  return spindle.storage.getJson<Archive>(path, { fallback: { chatId, messages: [] } })
}

export async function saveArchive(archive: Archive): Promise<void> {
  await spindle.storage.setJson(archivePath(archive.chatId), archive, { indent: 2 })
  // also save a lightweight index for the intern to scan quickly
  const index = archive.messages.map(m => ({
    messageIndex: m.messageIndex,
    messageId: m.messageId,
    role: m.role,
    inStoryTimestamp: m.inStoryTimestamp,
    charactersPresent: m.charactersPresent,
    sceneDescriptor: m.sceneDescriptor,
    emotionalRegister: m.emotionalRegister,
    activeThreads: m.activeThreads,
    tokenEstimate: m.tokenEstimate,
  }))
  await spindle.storage.setJson(indexPath(archive.chatId), index, { indent: 2 })
}

// ─── Archival Logic ─────────────────────────────────────────────────────────

export async function archiveMessages(
  chatId: string,
  messages: ArchivedMessage[]
): Promise<void> {
  const archive = await getArchive(chatId)
  const existingIds = new Set(archive.messages.map(m => m.messageId))

  const newMessages = messages.filter(m => !existingIds.has(m.messageId))
  if (newMessages.length === 0) return

  archive.messages.push(...newMessages)
  archive.messages.sort((a, b) => a.messageIndex - b.messageIndex)
  await saveArchive(archive)

  spindle.log.info(`Archived ${newMessages.length} messages for chat ${chatId}`)
}

// ─── Search ─────────────────────────────────────────────────────────────────

type IndexEntry = Omit<ArchivedMessage, 'content'>

export async function getArchiveIndex(chatId: string): Promise<IndexEntry[]> {
  const path = indexPath(chatId)
  const exists = await spindle.storage.exists(path)
  if (!exists) return []
  return spindle.storage.getJson<IndexEntry[]>(path, { fallback: [] })
}

export async function getArchivedMessagesByIds(
  chatId: string,
  messageIds: string[]
): Promise<ArchivedMessage[]> {
  const archive = await getArchive(chatId)
  const idSet = new Set(messageIds)
  return archive.messages.filter(m => idSet.has(m.messageId))
}

export async function getArchivedMessagesByRange(
  chatId: string,
  startIndex: number,
  endIndex: number
): Promise<ArchivedMessage[]> {
  const archive = await getArchive(chatId)
  return archive.messages.filter(m => m.messageIndex >= startIndex && m.messageIndex <= endIndex)
}

export async function searchArchiveByCharacter(
  chatId: string,
  characterName: string
): Promise<IndexEntry[]> {
  const index = await getArchiveIndex(chatId)
  const lowerName = characterName.toLowerCase()
  return index.filter(m =>
    m.charactersPresent.some(c => c.toLowerCase().includes(lowerName))
  )
}

export async function searchArchiveByThread(
  chatId: string,
  threadName: string
): Promise<IndexEntry[]> {
  const index = await getArchiveIndex(chatId)
  const lowerThread = threadName.toLowerCase()
  return index.filter(m =>
    m.activeThreads.some(t => t.toLowerCase().includes(lowerThread))
  )
}

export async function searchArchiveByRegister(
  chatId: string,
  register: string
): Promise<IndexEntry[]> {
  const index = await getArchiveIndex(chatId)
  const lowerRegister = register.toLowerCase()
  return index.filter(m => m.emotionalRegister.toLowerCase().includes(lowerRegister))
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export async function getArchiveStats(chatId: string): Promise<{
  totalMessages: number
  totalTokens: number
  characterCounts: Record<string, number>
  registerCounts: Record<string, number>
  threadCounts: Record<string, number>
}> {
  const index = await getArchiveIndex(chatId)

  const characterCounts: Record<string, number> = {}
  const registerCounts: Record<string, number> = {}
  const threadCounts: Record<string, number> = {}
  let totalTokens = 0

  for (const entry of index) {
    totalTokens += entry.tokenEstimate
    for (const char of entry.charactersPresent)
      characterCounts[char] = (characterCounts[char] ?? 0) + 1
    registerCounts[entry.emotionalRegister] = (registerCounts[entry.emotionalRegister] ?? 0) + 1
    for (const thread of entry.activeThreads)
      threadCounts[thread] = (threadCounts[thread] ?? 0) + 1
  }

  return {
    totalMessages: index.length,
    totalTokens,
    characterCounts,
    registerCounts,
    threadCounts,
  }
}
