import type { SpindleFrontendContext } from 'lumiverse-spindle-types'

interface PendingUpdateData {
  updateId: string
  chatId: string
  changes: Record<string, unknown>
  autoCommitAt?: number
  requiresReview?: boolean
}

interface WhiteboardData {
  chatId: string
  whiteboard: Record<string, unknown>
}

interface ArchiveStats {
  chatId: string
  stats: {
    totalMessages: number
    totalTokens: number
    characterCounts: Record<string, number>
    registerCounts: Record<string, number>
    threadCounts: Record<string, number>
  }
}

interface RecallResult {
  source: string
  emotionalRegister: string
  keyContent: string
  relevanceNote: string
  fullScene: string
  tokenCount: number
}

export function setup(ctx: SpindleFrontendContext) {
  // ─── Styles ─────────────────────────────────────────────────────────────

  ctx.dom.addStyle(`
    .novelist-drawer {
      padding: 16px;
      font-family: inherit;
      color: var(--lumiverse-text);
      overflow-y: auto;
      height: 100%;
    }

    .novelist-section {
      margin-bottom: 20px;
      padding: 12px;
      background: var(--lumiverse-fill);
      border-radius: var(--lumiverse-radius);
      border: 1px solid var(--lumiverse-border);
    }

    .novelist-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--lumiverse-accent);
    }

    .novelist-entry {
      padding: 8px;
      margin-bottom: 6px;
      background: var(--lumiverse-bg);
      border-radius: calc(var(--lumiverse-radius) - 2px);
      font-size: 13px;
      line-height: 1.5;
    }

    .novelist-entry-meta {
      font-size: 11px;
      color: var(--lumiverse-text-muted, #888);
      margin-bottom: 4px;
    }

    .novelist-status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .novelist-status-active { background: rgba(76, 175, 80, 0.2); color: #4caf50; }
    .novelist-status-dormant { background: rgba(255, 193, 7, 0.2); color: #ffc107; }
    .novelist-status-seeded { background: rgba(33, 150, 243, 0.2); color: #2196f3; }
    .novelist-status-resolved { background: rgba(158, 158, 158, 0.2); color: #9e9e9e; }

    .novelist-pending {
      padding: 12px;
      margin-bottom: 12px;
      background: rgba(255, 193, 7, 0.1);
      border: 1px solid rgba(255, 193, 7, 0.3);
      border-radius: var(--lumiverse-radius);
    }

    .novelist-pending-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .novelist-btn {
      padding: 6px 14px;
      border: none;
      border-radius: var(--lumiverse-radius);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .novelist-btn:hover { opacity: 0.85; }
    .novelist-btn-primary { background: var(--lumiverse-accent); color: white; }
    .novelist-btn-danger { background: rgba(244, 67, 54, 0.8); color: white; }
    .novelist-btn-ghost {
      background: transparent;
      border: 1px solid var(--lumiverse-border);
      color: var(--lumiverse-text);
    }

    .novelist-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 8px;
    }

    .novelist-stat {
      padding: 10px;
      background: var(--lumiverse-bg);
      border-radius: var(--lumiverse-radius);
      text-align: center;
    }

    .novelist-stat-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--lumiverse-accent);
    }

    .novelist-stat-label {
      font-size: 11px;
      color: var(--lumiverse-text-muted, #888);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .novelist-recall-input {
      width: 100%;
      padding: 10px;
      background: var(--lumiverse-bg);
      border: 1px solid var(--lumiverse-border);
      border-radius: var(--lumiverse-radius);
      color: var(--lumiverse-text);
      font-family: inherit;
      font-size: 13px;
      resize: vertical;
      min-height: 60px;
    }

    .novelist-recall-input::placeholder { color: var(--lumiverse-text-muted, #666); }
    .novelist-recall-input:focus { outline: none; border-color: var(--lumiverse-accent); }

    .novelist-result {
      padding: 12px;
      margin-top: 10px;
      background: var(--lumiverse-fill);
      border-radius: var(--lumiverse-radius);
      border-left: 3px solid var(--lumiverse-accent);
    }

    .novelist-result-source {
      font-size: 11px;
      font-weight: 600;
      color: var(--lumiverse-accent);
      margin-bottom: 4px;
    }

    .novelist-result-annotation {
      font-size: 13px;
      line-height: 1.5;
      margin-bottom: 8px;
    }

    .novelist-result-scene {
      font-size: 12px;
      line-height: 1.6;
      padding: 10px;
      background: var(--lumiverse-bg);
      border-radius: calc(var(--lumiverse-radius) - 2px);
      max-height: 300px;
      overflow-y: auto;
      white-space: pre-wrap;
      font-family: inherit;
    }

    .novelist-empty {
      text-align: center;
      padding: 40px 20px;
      color: var(--lumiverse-text-muted, #888);
      font-size: 13px;
      line-height: 1.6;
    }

    .novelist-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
    }

    .novelist-countdown {
      font-size: 11px;
      color: var(--lumiverse-text-muted, #888);
      font-style: italic;
    }
  `)

  // ─── State ──────────────────────────────────────────────────────────────

  let currentChatId: string | null = null
  let currentWhiteboard: Record<string, unknown> | null = null
  let pendingUpdates: PendingUpdateData[] = []
  let recallResults: RecallResult[] = []
  let archiveStats: ArchiveStats['stats'] | null = null
  let drawerContainer: HTMLElement | null = null

  // ─── Drawer Tab ─────────────────────────────────────────────────────────

  const drawerHandle = ctx.ui.registerDrawerTab({
    id: 'novelist-memory',
    title: 'Novelist Memory',
    shortName: 'Memory',
    description: 'Persistent narrative memory for serialized fiction',
  })

  // Render into the drawer tab's root container
  drawerContainer = drawerHandle.root

  // Re-render when the tab is activated
  drawerHandle.onActivate(() => {
    drawerContainer = drawerHandle.root
    renderDrawer()
  })

  // Initial render
  renderDrawer()

  // ─── Rendering ──────────────────────────────────────────────────────────

  function renderDrawer() {
    if (!drawerContainer) return
    drawerContainer.innerHTML = ''

    const root = document.createElement('div')
    root.className = 'novelist-drawer'

    if (!currentChatId) {
      root.innerHTML = '<div class="novelist-empty">Open a chat to view the Novelist Memory whiteboard.</div>'
      drawerContainer.appendChild(root)
      return
    }

    // Tab bar
    const tabs = ['Whiteboard', 'Recall', 'Archive', 'Settings']
    const activeTab = (drawerContainer.dataset.activeTab ?? 'Whiteboard') as string

    const tabBar = document.createElement('div')
    tabBar.style.cssText = 'display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--lumiverse-border); padding-bottom: 8px;'

    for (const tab of tabs) {
      const btn = document.createElement('button')
      btn.className = 'novelist-btn'
      btn.style.cssText = tab === activeTab
        ? 'background: var(--lumiverse-accent); color: white;'
        : 'background: transparent; color: var(--lumiverse-text);'
      btn.textContent = tab
      btn.onclick = () => {
        if (drawerContainer) drawerContainer.dataset.activeTab = tab
        renderDrawer()
      }
      tabBar.appendChild(btn)
    }
    root.appendChild(tabBar)

    // Pending updates banner
    if (pendingUpdates.length > 0) {
      for (const update of pendingUpdates) {
        const banner = document.createElement('div')
        banner.className = 'novelist-pending'
        banner.innerHTML = `
          <div style="font-weight: 600; font-size: 13px;">📝 Pending Whiteboard Update</div>
          <div style="font-size: 12px; margin-top: 4px; color: var(--lumiverse-text-muted, #888);">
            ${update.autoCommitAt ? `<span class="novelist-countdown">Auto-commits in ${Math.max(0, Math.ceil((update.autoCommitAt - Date.now()) / 1000))}s</span>` : 'Requires manual review'}
          </div>
          <div class="novelist-pending-actions">
            <button class="novelist-btn novelist-btn-primary" data-action="commit" data-id="${update.updateId}">✓ Commit</button>
            <button class="novelist-btn novelist-btn-ghost" data-action="edit" data-id="${update.updateId}">✎ Edit</button>
            <button class="novelist-btn novelist-btn-danger" data-action="reject" data-id="${update.updateId}">✕ Reject</button>
          </div>
        `
        banner.querySelectorAll('button[data-action]').forEach(btn => {
          btn.addEventListener('click', () => {
            const action = (btn as HTMLElement).dataset.action
            const updateId = (btn as HTMLElement).dataset.id
            if (!updateId || !currentChatId) return
            if (action === 'commit') {
              ctx.sendToBackend({ type: 'commit_update', data: { chatId: currentChatId, updateId } })
            } else if (action === 'reject') {
              ctx.sendToBackend({ type: 'reject_update', data: { chatId: currentChatId, updateId } })
              pendingUpdates = pendingUpdates.filter(u => u.updateId !== updateId)
              renderDrawer()
            } else if (action === 'edit') {
              // Open text editor with the whiteboard for manual editing
              ctx.sendToBackend({ type: 'get_whiteboard', data: { chatId: currentChatId } })
            }
          })
        })
        root.appendChild(banner)
      }
    }

    // Tab content
    switch (activeTab) {
      case 'Whiteboard': renderWhiteboardTab(root); break
      case 'Recall': renderRecallTab(root); break
      case 'Archive': renderArchiveTab(root); break
      case 'Settings': renderSettingsTab(root); break
    }

    drawerContainer.appendChild(root)
  }

  function renderWhiteboardTab(root: HTMLElement) {
    if (!currentWhiteboard) {
      root.innerHTML += '<div class="novelist-empty">Loading whiteboard...</div>'
      if (currentChatId) {
        ctx.sendToBackend({ type: 'get_whiteboard', data: { chatId: currentChatId } })
      }
      return
    }

    const wb = currentWhiteboard as {
      chronicle?: Array<{ timestamp: string, location: string, summary: string, charactersPresent?: string[], emotionalStates?: Record<string, string> }>
      threads?: Array<{ name: string, status: string, summary: string, lastTouched: string }>
      hearts?: Array<{ from: string, to: string, status: string, processing?: string, nextBeat?: string }>
      palette?: { voiceNotes?: Record<string, string>, fragileDetails?: string[] }
      authorNotes?: string[]
    }

    // Chronicle
    const chronicleSection = createSection('Chronicle', `${wb.chronicle?.length ?? 0} entries`)
    if (wb.chronicle && wb.chronicle.length > 0) {
      for (const entry of wb.chronicle) {
        const el = document.createElement('div')
        el.className = 'novelist-entry'
        el.innerHTML = `
          <div class="novelist-entry-meta">${entry.timestamp} · ${entry.location}${entry.charactersPresent?.length ? ' · ' + entry.charactersPresent.join(', ') : ''}</div>
          <div>${escapeHtml(entry.summary)}</div>
          ${entry.emotionalStates ? `<div class="novelist-entry-meta" style="margin-top: 4px;">${Object.entries(entry.emotionalStates).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>` : ''}
        `
        chronicleSection.appendChild(el)
      }
    } else {
      chronicleSection.innerHTML += '<div class="novelist-empty" style="padding: 12px;">No chronicle entries yet. They\'ll appear after your first generation.</div>'
    }
    root.appendChild(chronicleSection)

    // Threads
    const threadsSection = createSection('Threads', `${wb.threads?.length ?? 0} tracked`)
    if (wb.threads && wb.threads.length > 0) {
      for (const thread of wb.threads) {
        const el = document.createElement('div')
        el.className = 'novelist-entry'
        el.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <strong>${escapeHtml(thread.name)}</strong>
            <span class="novelist-status novelist-status-${thread.status.toLowerCase()}">${thread.status}</span>
          </div>
          <div class="novelist-entry-meta">Last touched: ${thread.lastTouched}</div>
          <div>${escapeHtml(thread.summary)}</div>
        `
        threadsSection.appendChild(el)
      }
    } else {
      threadsSection.innerHTML += '<div class="novelist-empty" style="padding: 12px;">No narrative threads tracked yet.</div>'
    }
    root.appendChild(threadsSection)

    // Hearts
    const heartsSection = createSection('Hearts', `${wb.hearts?.length ?? 0} dynamics`)
    if (wb.hearts && wb.hearts.length > 0) {
      for (const heart of wb.hearts) {
        const el = document.createElement('div')
        el.className = 'novelist-entry'
        el.innerHTML = `
          <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(heart.from)} → ${escapeHtml(heart.to)}</div>
          <div class="novelist-entry-meta">Status: ${escapeHtml(heart.status)}</div>
          ${heart.processing ? `<div>${escapeHtml(heart.processing)}</div>` : ''}
          ${heart.nextBeat ? `<div class="novelist-entry-meta" style="margin-top: 4px;">Next beat: ${escapeHtml(heart.nextBeat)}</div>` : ''}
        `
        heartsSection.appendChild(el)
      }
    } else {
      heartsSection.innerHTML += '<div class="novelist-empty" style="padding: 12px;">No relationship dynamics tracked yet.</div>'
    }
    root.appendChild(heartsSection)

    // Author Notes
    if (wb.authorNotes && wb.authorNotes.length > 0) {
      const notesSection = createSection('Author Notes', `${wb.authorNotes.length} notes`)
      for (const note of wb.authorNotes) {
        const el = document.createElement('div')
        el.className = 'novelist-entry'
        el.textContent = note
        notesSection.appendChild(el)
      }
      root.appendChild(notesSection)
    }

    // Edit button
    const editBtn = document.createElement('button')
    editBtn.className = 'novelist-btn novelist-btn-ghost'
    editBtn.style.cssText = 'width: 100%; margin-top: 12px;'
    editBtn.textContent = '✎ Edit Whiteboard (JSON)'
    editBtn.onclick = () => {
      ctx.sendToBackend({ type: 'get_whiteboard', data: { chatId: currentChatId } })
      // The backend will send back the data, and we'll use the text editor
    }
    root.appendChild(editBtn)
  }

  function renderRecallTab(root: HTMLElement) {
    const container = document.createElement('div')

    // Query input
    const label = document.createElement('div')
    label.style.cssText = 'font-size: 13px; font-weight: 600; margin-bottom: 8px;'
    label.textContent = 'Ask the Intern'
    container.appendChild(label)

    const textarea = document.createElement('textarea')
    textarea.className = 'novelist-recall-input'
    textarea.placeholder = 'Describe the scene you need... e.g., "The first time K saw A\'s ability. I need the physical tells and coping mechanism formation."'
    container.appendChild(textarea)

    const searchBtn = document.createElement('button')
    searchBtn.className = 'novelist-btn novelist-btn-primary'
    searchBtn.style.cssText = 'margin-top: 8px; width: 100%;'
    searchBtn.textContent = '🔍 Search Archive'
    searchBtn.onclick = () => {
      if (!textarea.value.trim() || !currentChatId) return
      searchBtn.textContent = '⏳ Searching...'
      searchBtn.disabled = true
      ctx.sendToBackend({ type: 'manual_recall', data: { chatId: currentChatId, query: textarea.value.trim() } })
    }
    container.appendChild(searchBtn)

    // Results
    if (recallResults.length > 0) {
      const resultsContainer = document.createElement('div')
      resultsContainer.style.cssText = 'margin-top: 16px;'

      for (const result of recallResults) {
        const el = document.createElement('div')
        el.className = 'novelist-result'
        el.innerHTML = `
          <div class="novelist-result-source">${escapeHtml(result.source)} · ${escapeHtml(result.emotionalRegister)}</div>
          <div class="novelist-result-annotation">${escapeHtml(result.keyContent)}</div>
          ${result.fullScene ? `<details><summary style="cursor: pointer; font-size: 12px; color: var(--lumiverse-accent);">Show full scene (~${result.tokenCount} tokens)</summary><div class="novelist-result-scene">${escapeHtml(result.fullScene)}</div></details>` : ''}
        `
        resultsContainer.appendChild(el)
      }
      container.appendChild(resultsContainer)
    }

    root.appendChild(container)
  }

  function renderArchiveTab(root: HTMLElement) {
    if (!archiveStats) {
      const loading = document.createElement('div')
      loading.className = 'novelist-empty'
      loading.textContent = 'Loading archive stats...'
      root.appendChild(loading)
      if (currentChatId) {
        ctx.sendToBackend({ type: 'get_archive_stats', data: { chatId: currentChatId } })
      }
      return
    }

    const stats = archiveStats

    // Stats grid
    const statsGrid = document.createElement('div')
    statsGrid.className = 'novelist-stats'
    statsGrid.innerHTML = `
      <div class="novelist-stat">
        <div class="novelist-stat-value">${stats.totalMessages}</div>
        <div class="novelist-stat-label">Archived</div>
      </div>
      <div class="novelist-stat">
        <div class="novelist-stat-value">${Math.round(stats.totalTokens / 1000)}K</div>
        <div class="novelist-stat-label">Tokens</div>
      </div>
      <div class="novelist-stat">
        <div class="novelist-stat-value">${Object.keys(stats.characterCounts).length}</div>
        <div class="novelist-stat-label">Characters</div>
      </div>
      <div class="novelist-stat">
        <div class="novelist-stat-value">${Object.keys(stats.threadCounts).length}</div>
        <div class="novelist-stat-label">Threads</div>
      </div>
    `
    root.appendChild(statsGrid)

    // Character breakdown
    if (Object.keys(stats.characterCounts).length > 0) {
      const charSection = createSection('Characters by Appearance', '')
      const sorted = Object.entries(stats.characterCounts).sort((a, b) => b[1] - a[1])
      for (const [name, count] of sorted) {
        const el = document.createElement('div')
        el.className = 'novelist-entry'
        el.innerHTML = `<strong>${escapeHtml(name)}</strong> — ${count} scenes`
        charSection.appendChild(el)
      }
      root.appendChild(charSection)
    }

    // Emotional register breakdown
    if (Object.keys(stats.registerCounts).length > 0) {
      const regSection = createSection('Emotional Registers', '')
      const sorted = Object.entries(stats.registerCounts).sort((a, b) => b[1] - a[1])
      for (const [register, count] of sorted) {
        const el = document.createElement('div')
        el.className = 'novelist-entry'
        el.innerHTML = `<strong>${escapeHtml(register)}</strong> — ${count} scenes`
        regSection.appendChild(el)
      }
      root.appendChild(regSection)
    }

    // Refresh button
    const refreshBtn = document.createElement('button')
    refreshBtn.className = 'novelist-btn novelist-btn-ghost'
    refreshBtn.style.cssText = 'width: 100%; margin-top: 12px;'
    refreshBtn.textContent = '↻ Refresh Stats'
    refreshBtn.onclick = () => {
      archiveStats = null
      renderDrawer()
    }
    root.appendChild(refreshBtn)
  }

  function renderSettingsTab(root: HTMLElement) {
    const container = document.createElement('div')
    container.innerHTML = `
      <div class="novelist-section">
        <div class="novelist-section-header">Configuration</div>
        <div class="novelist-empty" style="padding: 12px;">
          Settings will load from the backend. Use the command palette to adjust Novelist Memory settings.
        </div>
      </div>
    `

    // Request config
    ctx.sendToBackend({ type: 'get_config' })

    root.appendChild(container)
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  function createSection(title: string, subtitle: string): HTMLElement {
    const section = document.createElement('div')
    section.className = 'novelist-section'
    section.innerHTML = `<div class="novelist-section-header"><span>${title}</span><span style="font-weight: 400; font-size: 11px; text-transform: none;">${subtitle}</span></div>`
    return section
  }

  function escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  // ─── Backend Message Handling ───────────────────────────────────────────

  ctx.onBackendMessage((raw) => {
    const payload = raw as { type: string, data?: Record<string, unknown> }
    switch (payload.type) {
      case 'whiteboard_data': {
        const data = payload.data as unknown as WhiteboardData
        if (data.chatId === currentChatId) {
          currentWhiteboard = data.whiteboard
          renderDrawer()
        }
        break
      }

      case 'pending_update': {
        const data = payload.data as unknown as PendingUpdateData
        if (data.chatId === currentChatId) {
          pendingUpdates.push(data)
          renderDrawer()
        }
        break
      }

      case 'update_committed': {
        const data = payload.data as { updateId: string, chatId: string, whiteboard?: Record<string, unknown> }
        pendingUpdates = pendingUpdates.filter(u => u.updateId !== data.updateId)
        if (data.whiteboard && data.chatId === currentChatId) {
          currentWhiteboard = data.whiteboard
        }
        renderDrawer()
        break
      }

      case 'update_rejected': {
        const data = payload.data as { updateId: string }
        pendingUpdates = pendingUpdates.filter(u => u.updateId !== data.updateId)
        renderDrawer()
        break
      }

      case 'archive_stats': {
        const data = payload.data as unknown as ArchiveStats
        if (data.chatId === currentChatId) {
          archiveStats = data.stats
          renderDrawer()
        }
        break
      }

      case 'recall_results': {
        const data = payload.data as { chatId: string, results: RecallResult[] }
        if (data.chatId === currentChatId) {
          recallResults = data.results
          renderDrawer()
        }
        break
      }

      case 'config_data': {
        // Could render config UI here
        break
      }

      case 'open_whiteboard': {
        const data = payload.data as { chatId?: string }
        if (data.chatId) {
          currentChatId = data.chatId
          if (drawerContainer) drawerContainer.dataset.activeTab = 'Whiteboard'
          ctx.sendToBackend({ type: 'get_whiteboard', data: { chatId: data.chatId } })
        }
        break
      }

      case 'open_recall': {
        const data = payload.data as { chatId?: string }
        if (data.chatId) {
          currentChatId = data.chatId
          if (drawerContainer) drawerContainer.dataset.activeTab = 'Recall'
          renderDrawer()
        }
        break
      }
    }
  })

  // ─── Event Handling ─────────────────────────────────────────────────────

  ctx.events.on('CHAT_CHANGED', (raw) => {
    const payload = raw as { chatId?: string }
    currentChatId = payload.chatId ?? null
    currentWhiteboard = null
    pendingUpdates = []
    recallResults = []
    archiveStats = null
    if (currentChatId) {
      ctx.sendToBackend({ type: 'get_whiteboard', data: { chatId: currentChatId } })
    }
    renderDrawer()
  })

  // ─── Cleanup ────────────────────────────────────────────────────────────

  return () => {
    drawerHandle?.destroy?.()
  }
}
