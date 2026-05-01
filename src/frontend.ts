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

interface DirectEditEntry {
  id: string
  chatId: string
  timestamp: string
  delta: Record<string, unknown>
  summary: string
  generationMessageId?: string
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

    .novelist-field {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid var(--lumiverse-border);
      gap: 12px;
    }

    .novelist-field:last-child { border-bottom: none; }

    .novelist-field-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--lumiverse-text);
      flex: 1;
    }

    .novelist-field-desc {
      font-size: 11px;
      color: var(--lumiverse-text-muted, #888);
      margin-top: 2px;
      font-weight: 400;
    }

    .novelist-input {
      width: 80px;
      padding: 6px 8px;
      background: var(--lumiverse-bg);
      border: 1px solid var(--lumiverse-border);
      border-radius: var(--lumiverse-radius);
      color: var(--lumiverse-text);
      font-family: inherit;
      font-size: 13px;
      text-align: right;
    }

    .novelist-input:focus { outline: none; border-color: var(--lumiverse-accent); }

    .novelist-input-wide { width: 100%; text-align: left; }

    .novelist-switch {
      position: relative;
      width: 40px;
      height: 22px;
      background: var(--lumiverse-border);
      border-radius: 11px;
      cursor: pointer;
      transition: background 0.2s;
      flex-shrink: 0;
    }

    .novelist-switch.active { background: var(--lumiverse-accent); }

    .novelist-switch::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }

    .novelist-switch.active::after { transform: translateX(18px); }

    .novelist-save-banner {
      padding: 10px 12px;
      background: rgba(76, 175, 80, 0.1);
      border: 1px solid rgba(76, 175, 80, 0.3);
      border-radius: var(--lumiverse-radius);
      font-size: 12px;
      color: #4caf50;
      text-align: center;
      margin-bottom: 12px;
    }

    .novelist-history-entry {
      padding: 12px;
      margin-bottom: 8px;
      background: var(--lumiverse-fill);
      border-radius: var(--lumiverse-radius);
      border-left: 3px solid var(--lumiverse-accent);
      transition: border-color 0.2s;
    }

    .novelist-history-entry:hover {
      border-left-color: #e5c07b;
    }

    .novelist-history-entry.novelist-history-new {
      animation: novelist-flash 1.5s ease-out;
    }

    @keyframes novelist-flash {
      0% { background: rgba(76, 175, 80, 0.15); border-left-color: #4caf50; }
      100% { background: var(--lumiverse-fill); border-left-color: var(--lumiverse-accent); }
    }

    .novelist-history-time {
      font-size: 11px;
      color: var(--lumiverse-text-muted, #888);
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .novelist-history-summary {
      font-size: 13px;
      line-height: 1.5;
      color: var(--lumiverse-text);
    }

    .novelist-history-delta {
      margin-top: 8px;
      padding: 10px;
      background: var(--lumiverse-bg);
      border-radius: calc(var(--lumiverse-radius) - 2px);
      font-family: monospace;
      font-size: 11px;
      line-height: 1.6;
      max-height: 300px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .novelist-history-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 600;
      background: rgba(156, 39, 176, 0.2);
      color: #ce93d8;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
  `)

  // ─── State ──────────────────────────────────────────────────────────────

  let currentChatId: string | null = null
  let currentWhiteboard: Record<string, unknown> | null = null
  let pendingUpdates: PendingUpdateData[] = []
  let recallResults: RecallResult[] = []
  let archiveStats: ArchiveStats['stats'] | null = null
  let drawerContainer: HTMLElement | null = null
  let currentConfig: Record<string, unknown> | null = null
  let whiteboardTokenInfo: { tokens: number, approximate: boolean, tokenizer: string, budget: number } | null = null
  let availableConnections: Array<{ id: string, name: string, provider: string, model: string }> | null = null
  let directEditHistory: DirectEditEntry[] = []

  // ─── Detect Active Chat on Load ──────────────────────────────────────

  const activeChat = ctx.getActiveChat()
  if (activeChat.chatId) {
    currentChatId = activeChat.chatId
    ctx.sendToBackend({ type: 'get_whiteboard', data: { chatId: activeChat.chatId } })
  }

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
    // Re-check active chat in case it changed while we were hidden
    const chat = ctx.getActiveChat()
    if (chat.chatId && chat.chatId !== currentChatId) {
      currentChatId = chat.chatId
      currentWhiteboard = null
      pendingUpdates = []
      recallResults = []
      archiveStats = null
      whiteboardTokenInfo = null
      directEditHistory = []
      ctx.sendToBackend({ type: 'get_whiteboard', data: { chatId: chat.chatId } })
    }
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
    const tabs = ['Whiteboard', 'History', 'Recall', 'Archive', 'Settings']
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
      case 'History': renderHistoryTab(root); break
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

    // Token meter — shows current whiteboard size against the configured budget
    if (whiteboardTokenInfo) {
      const info = whiteboardTokenInfo
      const pct = info.budget > 0 ? Math.min(100, Math.round((info.tokens / info.budget) * 100)) : 0
      const barColor = pct >= 100 ? '#e06c75' : pct >= 75 ? '#e5c07b' : '#98c379'
      const tokenizerNote = info.approximate
        ? ` <span title="Lumiverse couldn't resolve a tokenizer for the active model — this is a char/4 fallback estimate" style="opacity: 0.7;">~estimate</span>`
        : ` <span title="Counted with the active model's tokenizer (${escapeHtml(info.tokenizer)})" style="opacity: 0.6;">${escapeHtml(info.tokenizer)}</span>`
      const meter = document.createElement('div')
      meter.style.cssText = 'margin-bottom: 16px; padding: 10px 12px; background: var(--lumiverse-surface, rgba(255,255,255,0.04)); border: 1px solid var(--lumiverse-border, rgba(255,255,255,0.1)); border-radius: 6px;'
      meter.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; font-size: 12px;">
          <span><strong>Whiteboard size:</strong> ${info.tokens.toLocaleString()} / ${info.budget.toLocaleString()} tokens${tokenizerNote}</span>
          <span style="display: flex; align-items: center; gap: 8px;">
            <span style="color: ${barColor}; font-weight: 600;">${pct}%</span>
            <button class="novelist-btn novelist-btn-ghost" style="padding: 2px 8px; font-size: 11px;" title="Refresh token count">↻</button>
          </span>
        </div>
        <div style="height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden;">
          <div style="width: ${pct}%; height: 100%; background: ${barColor}; transition: width 0.3s ease;"></div>
        </div>
      `
      const refreshBtn = meter.querySelector('button')
      if (refreshBtn) {
        refreshBtn.onclick = () => {
          whiteboardTokenInfo = null
          if (currentChatId) ctx.sendToBackend({ type: 'get_whiteboard_tokens', data: { chatId: currentChatId } })
          renderDrawer()
        }
      }
      root.appendChild(meter)
    } else if (currentChatId) {
      ctx.sendToBackend({ type: 'get_whiteboard_tokens', data: { chatId: currentChatId } })
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

    // Edit button — toggles an inline JSON editor
    const editBtn = document.createElement('button')
    editBtn.className = 'novelist-btn novelist-btn-ghost'
    editBtn.style.cssText = 'width: 100%; margin-top: 12px;'
    editBtn.textContent = '✎ Edit Whiteboard (JSON)'
    editBtn.onclick = () => {
      if (!currentWhiteboard || !currentChatId) return

      const editorContainer = document.createElement('div')
      editorContainer.style.cssText = 'margin-top: 12px;'

      const textarea = document.createElement('textarea')
      textarea.className = 'novelist-recall-input'
      textarea.style.cssText = 'width: 100%; min-height: 300px; font-family: monospace; font-size: 12px;'
      textarea.value = JSON.stringify(currentWhiteboard, null, 2)
      editorContainer.appendChild(textarea)

      const btnRow = document.createElement('div')
      btnRow.style.cssText = 'display: flex; gap: 8px; margin-top: 8px;'

      const saveBtn = document.createElement('button')
      saveBtn.className = 'novelist-btn novelist-btn-primary'
      saveBtn.textContent = '✓ Save'
      saveBtn.onclick = () => {
        try {
          const edited = JSON.parse(textarea.value)
          ctx.sendToBackend({ type: 'save_whiteboard', data: { chatId: currentChatId, whiteboard: edited } })
          currentWhiteboard = edited
          renderDrawer()
        } catch (e) {
          textarea.style.borderColor = 'rgba(244, 67, 54, 0.8)'
          setTimeout(() => { textarea.style.borderColor = '' }, 2000)
        }
      }
      btnRow.appendChild(saveBtn)

      const cancelBtn = document.createElement('button')
      cancelBtn.className = 'novelist-btn novelist-btn-ghost'
      cancelBtn.textContent = '✕ Cancel'
      cancelBtn.onclick = () => renderDrawer()
      btnRow.appendChild(cancelBtn)

      editorContainer.appendChild(btnRow)

      // Replace the edit button with the editor
      editBtn.replaceWith(editorContainer)
    }
    root.appendChild(editBtn)
  }

  function renderHistoryTab(root: HTMLElement) {
    // Request history if we haven't loaded it yet for this chat
    if (directEditHistory.length === 0 && currentChatId) {
      ctx.sendToBackend({ type: 'get_update_history', data: { chatId: currentChatId } })
    }

    if (directEditHistory.length === 0) {
      root.innerHTML += '<div class="novelist-empty">No direct edits yet.<br><br>When Lumia calls <code>update_whiteboard</code> during generation, her changes will appear here in real time.</div>'
      return
    }

    const container = document.createElement('div')

    const header = document.createElement('div')
    header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;'
    header.innerHTML = `
      <div style="font-size: 13px; font-weight: 600; color: var(--lumiverse-accent);">Lumia's Direct Edits</div>
      <div style="font-size: 11px; color: var(--lumiverse-text-muted, #888);">${directEditHistory.length} edit${directEditHistory.length !== 1 ? 's' : ''}</div>
    `
    container.appendChild(header)

    // Show most recent first
    const sorted = [...directEditHistory].reverse()

    for (const entry of sorted) {
      const el = document.createElement('div')
      el.className = 'novelist-history-entry'

      // Time formatting
      const date = new Date(entry.timestamp)
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' })
      const isToday = new Date().toDateString() === date.toDateString()
      const displayTime = isToday ? timeStr : `${dateStr} ${timeStr}`

      // Count sections touched for the badge
      const delta = entry.delta as Record<string, unknown>
      const sectionCount = ['chronicle', 'threads', 'hearts', 'palette', 'canon', 'authorNotes']
        .filter(k => delta[k] != null).length

      el.innerHTML = `
        <div class="novelist-history-time">
          <span class="novelist-history-badge">tool call</span>
          <span>${displayTime}</span>
          <span>·</span>
          <span>${sectionCount} section${sectionCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="novelist-history-summary">${escapeHtml(entry.summary)}</div>
      `

      // Expandable delta detail
      const detailsEl = document.createElement('details')
      detailsEl.style.marginTop = '6px'

      const summaryEl = document.createElement('summary')
      summaryEl.style.cssText = 'cursor: pointer; font-size: 11px; color: var(--lumiverse-accent); user-select: none;'
      summaryEl.textContent = 'Show raw delta'
      detailsEl.appendChild(summaryEl)

      const deltaContent = document.createElement('div')
      deltaContent.className = 'novelist-history-delta'
      deltaContent.textContent = JSON.stringify(entry.delta, null, 2)
      detailsEl.appendChild(deltaContent)

      el.appendChild(detailsEl)
      container.appendChild(el)
    }

    root.appendChild(container)
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
    if (!currentConfig) {
      const loading = document.createElement('div')
      loading.className = 'novelist-empty'
      loading.textContent = 'Loading settings...'
      root.appendChild(loading)
      ctx.sendToBackend({ type: 'get_config' })
      return
    }

    const cfg = currentConfig as {
      enabled: boolean
      slidingWindowSize: number
      autoCommitUpdates: boolean
      useSidecar: boolean
      updateReviewWindowMs: number
      whiteboardTokenBudget: number
      internConnectionId?: string
      updaterConnectionId?: string
      compactionThreshold: number
      auditIntervalMessages: number
      updaterTemperature?: number
      injectOnImpersonate?: boolean
    }

    const container = document.createElement('div')

    // Saved banner (hidden by default)
    const savedBanner = document.createElement('div')
    savedBanner.className = 'novelist-save-banner'
    savedBanner.style.display = 'none'
    savedBanner.textContent = '✓ Settings saved'
    container.appendChild(savedBanner)

    function showSaved() {
      savedBanner.style.display = 'block'
      setTimeout(() => { savedBanner.style.display = 'none' }, 2000)
    }

    function saveField(key: string, value: unknown) {
      if (!currentConfig) return
      currentConfig[key] = value
      ctx.sendToBackend({ type: 'save_config', data: { config: { [key]: value } } })
      showSaved()
    }

    // ─── General ──────────────────────────────────────────────────────

    const generalSection = createSection('General', '')

    // Enabled toggle
    generalSection.appendChild(makeToggleField(
      'Enabled',
      'Master toggle for Novelist Memory',
      cfg.enabled,
      (val) => saveField('enabled', val)
    ))

    // Auto-commit toggle
    generalSection.appendChild(makeToggleField(
      'Auto-Commit Updates',
      'Automatically commit whiteboard updates after the review window',
      cfg.autoCommitUpdates,
      (val) => saveField('autoCommitUpdates', val)
    ))

    // Use sidecar toggle
    generalSection.appendChild(makeToggleField(
      'Use Sidecar Model',
      'Use the Council sidecar connection for background LLM calls (updater + intern). Falls back to active connection if no sidecar is configured.',
      cfg.useSidecar ?? true,
      (val) => saveField('useSidecar', val)
    ))

    // Include character context toggle
    generalSection.appendChild(makeToggleField(
      'Include Character Context',
      'Send the active character card and persona to the sidecar updater for richer, more character-specific whiteboard entries.',
      cfg.includeCharacterContext ?? true,
      (val) => saveField('includeCharacterContext', val)
    ))

    // Inject on impersonate toggle
    generalSection.appendChild(makeToggleField(
      'Inject on Impersonate',
      'Include the whiteboard in context when generating impersonate (user-side) messages. Useful for maintaining continuity when writing as your character.',
      cfg.injectOnImpersonate ?? false,
      (val) => saveField('injectOnImpersonate', val)
    ))

    container.appendChild(generalSection)

    // ─── Context Window ───────────────────────────────────────────────

    const windowSection = createSection('Context Window', '')

    // Sliding window size
    windowSection.appendChild(makeNumberField(
      'Sliding Window',
      'Recent exchanges kept in active context (each = 1 user + 1 assistant msg)',
      cfg.slidingWindowSize,
      1, 20,
      (val) => saveField('slidingWindowSize', val)
    ))

    // Whiteboard token budget
    windowSection.appendChild(makeNumberField(
      'Token Budget',
      'Warn when whiteboard exceeds this many tokens',
      cfg.whiteboardTokenBudget,
      2000, 50000,
      (val) => saveField('whiteboardTokenBudget', val)
    ))

    // Review window
    windowSection.appendChild(makeNumberField(
      'Review Window (seconds)',
      'Time before pending updates auto-commit',
      Math.round(cfg.updateReviewWindowMs / 1000),
      5, 300,
      (val) => saveField('updateReviewWindowMs', val * 1000)
    ))

    container.appendChild(windowSection)

    // ─── Maintenance ──────────────────────────────────────────────────

    const maintenanceSection = createSection('Maintenance', '')

    maintenanceSection.appendChild(makeNumberField(
      'Compaction Threshold',
      'Chronicle entries before compaction triggers',
      cfg.compactionThreshold,
      20, 500,
      (val) => saveField('compactionThreshold', val)
    ))

    maintenanceSection.appendChild(makeNumberField(
      'Audit Interval',
      'Messages between full whiteboard consistency audits',
      cfg.auditIntervalMessages,
      10, 200,
      (val) => saveField('auditIntervalMessages', val)
    ))

    container.appendChild(maintenanceSection)

    // ─── Model Connections ────────────────────────────────────────────

    const modelSection = createSection('Model Connections', 'optional')

    // Request connections list if we don't have it yet
    if (!availableConnections) {
      ctx.sendToBackend({ type: 'list_connections' })
    }

    modelSection.appendChild(makeConnectionField(
      'Intern Connection',
      'Model for the retrieval intern (scene search). Blank = use active connection.',
      cfg.internConnectionId ?? '',
      (val) => saveField('internConnectionId', val || undefined)
    ))

    modelSection.appendChild(makeConnectionField(
      'Updater Connection',
      'Model for the whiteboard updater (post-gen analysis). Blank = use active connection.',
      cfg.updaterConnectionId ?? '',
      (val) => saveField('updaterConnectionId', val || undefined)
    ))

    // Updater temperature slider
    const tempField = document.createElement('div')
    tempField.className = 'novelist-field'

    const tempLabelDiv = document.createElement('div')
    tempLabelDiv.className = 'novelist-field-label'
    tempLabelDiv.innerHTML = `Updater Temperature<div class="novelist-field-desc">Controls creativity vs precision for the sidecar updater (0.0–1.0). Lower = more precise JSON, higher = richer narrative entries.</div>`

    const tempControls = document.createElement('div')
    tempControls.style.cssText = 'display: flex; align-items: center; gap: 8px;'

    const tempSlider = document.createElement('input')
    tempSlider.type = 'range'
    tempSlider.min = '0'
    tempSlider.max = '100'
    tempSlider.value = String(Math.round((cfg.updaterTemperature ?? 0.3) * 100))
    tempSlider.style.cssText = 'width: 100px; cursor: pointer;'

    const tempValue = document.createElement('span')
    tempValue.style.cssText = 'font-size: 13px; font-weight: 600; min-width: 32px; text-align: right;'
    tempValue.textContent = (cfg.updaterTemperature ?? 0.3).toFixed(2)

    tempSlider.oninput = () => {
      const val = parseInt(tempSlider.value, 10) / 100
      tempValue.textContent = val.toFixed(2)
    }
    tempSlider.onchange = () => {
      const val = parseInt(tempSlider.value, 10) / 100
      saveField('updaterTemperature', val)
    }

    tempControls.appendChild(tempSlider)
    tempControls.appendChild(tempValue)
    tempField.appendChild(tempLabelDiv)
    tempField.appendChild(tempControls)
    modelSection.appendChild(tempField)

    container.appendChild(modelSection)

    // ─── Debug ─────────────────────────────────────────────────────

    if (currentChatId) {
      const debugSection = createSection('Debug', '')

      const debugDesc = document.createElement('div')
      debugDesc.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-muted, #888); margin-bottom: 12px; line-height: 1.5;'
      debugDesc.textContent = 'Re-run the updater sidecar against the current chat\'s latest exchange. Useful for A/B testing different sidecar models — change the Updater Connection above, then re-run.'
      debugSection.appendChild(debugDesc)

      const debugBtnRow = document.createElement('div')
      debugBtnRow.style.cssText = 'display: flex; gap: 8px;'

      const rerunResetBtn = document.createElement('button')
      rerunResetBtn.className = 'novelist-btn novelist-btn-ghost'
      rerunResetBtn.style.cssText = 'flex: 1;'
      rerunResetBtn.textContent = '↻ Re-run (Reset to Pre)'
      rerunResetBtn.title = 'Reset whiteboard to its state before the last sidecar run, then re-fire the updater. Clean A/B test.'
      rerunResetBtn.onclick = () => {
        rerunResetBtn.textContent = '⏳ Running...'
        rerunResetBtn.disabled = true
        rerunKeepBtn.disabled = true
        ctx.sendToBackend({ type: 'rerun_updater', data: { chatId: currentChatId, mode: 'reset_to_pre' } })
      }
      debugBtnRow.appendChild(rerunResetBtn)

      const rerunKeepBtn = document.createElement('button')
      rerunKeepBtn.className = 'novelist-btn novelist-btn-ghost'
      rerunKeepBtn.style.cssText = 'flex: 1;'
      rerunKeepBtn.textContent = '↻ Re-run (Keep Current)'
      rerunKeepBtn.title = 'Re-fire the updater against the current whiteboard state. Tests what the model would add on top of existing entries.'
      rerunKeepBtn.onclick = () => {
        rerunKeepBtn.textContent = '⏳ Running...'
        rerunKeepBtn.disabled = true
        rerunResetBtn.disabled = true
        ctx.sendToBackend({ type: 'rerun_updater', data: { chatId: currentChatId, mode: 'keep_current' } })
      }
      debugBtnRow.appendChild(rerunKeepBtn)

      debugSection.appendChild(debugBtnRow)

      // Rebuild whiteboard button
      const rebuildDesc = document.createElement('div')
      rebuildDesc.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-muted, #888); margin: 16px 0 8px 0; line-height: 1.5;'
      rebuildDesc.textContent = 'Rebuild the entire whiteboard from scratch by re-processing every message pair in the chat. Uses your active (primary) model for full-quality results including hearts, palette, and author notes. Expensive but thorough — use when whiteboard state has been lost.'
      debugSection.appendChild(rebuildDesc)

      const rebuildBtn = document.createElement('button')
      rebuildBtn.className = 'novelist-btn novelist-btn-ghost'
      rebuildBtn.style.cssText = 'width: 100%;'
      rebuildBtn.textContent = '🔨 Rebuild Whiteboard from History'
      rebuildBtn.title = 'Reset whiteboard to empty and re-process every exchange using the primary model. Full recovery tool.'
      rebuildBtn.onclick = () => {
        if (!confirm('This will reset the whiteboard to empty and rebuild it by re-processing every message pair in the chat using your active model. This may take a while and will use tokens for each exchange. Continue?')) return
        rebuildBtn.textContent = '⏳ Rebuilding...'
        rebuildBtn.disabled = true
        rerunResetBtn.disabled = true
        rerunKeepBtn.disabled = true
        ctx.sendToBackend({ type: 'rebuild_whiteboard', data: { chatId: currentChatId } })
      }
      debugSection.appendChild(rebuildBtn)

      container.appendChild(debugSection)
    }

    // ─── Danger Zone ──────────────────────────────────────────────────

    if (currentChatId) {
      const dangerSection = createSection('Danger Zone', '')

      const resetBtn = document.createElement('button')
      resetBtn.className = 'novelist-btn novelist-btn-danger'
      resetBtn.style.cssText = 'width: 100%;'
      resetBtn.textContent = 'Reset Whiteboard for Current Chat'
      resetBtn.onclick = () => {
        if (confirm('This will erase the entire whiteboard for this chat. The archive is preserved. Continue?')) {
          ctx.sendToBackend({ type: 'reset_whiteboard', data: { chatId: currentChatId } })
        }
      }
      dangerSection.appendChild(resetBtn)

      container.appendChild(dangerSection)
    }

    root.appendChild(container)
  }

  // ─── Form Field Helpers ─────────────────────────────────────────────────

  function makeToggleField(label: string, desc: string, value: boolean, onChange: (val: boolean) => void): HTMLElement {
    const field = document.createElement('div')
    field.className = 'novelist-field'

    const labelDiv = document.createElement('div')
    labelDiv.className = 'novelist-field-label'
    labelDiv.innerHTML = `${escapeHtml(label)}<div class="novelist-field-desc">${escapeHtml(desc)}</div>`

    const toggle = document.createElement('div')
    toggle.className = `novelist-switch${value ? ' active' : ''}`
    toggle.onclick = () => {
      const newVal = !toggle.classList.contains('active')
      toggle.classList.toggle('active', newVal)
      onChange(newVal)
    }

    field.appendChild(labelDiv)
    field.appendChild(toggle)
    return field
  }

  function makeNumberField(label: string, desc: string, value: number, min: number, max: number, onChange: (val: number) => void): HTMLElement {
    const field = document.createElement('div')
    field.className = 'novelist-field'

    const labelDiv = document.createElement('div')
    labelDiv.className = 'novelist-field-label'
    labelDiv.innerHTML = `${escapeHtml(label)}<div class="novelist-field-desc">${escapeHtml(desc)}</div>`

    const input = document.createElement('input')
    input.type = 'number'
    input.className = 'novelist-input'
    input.value = String(value)
    input.min = String(min)
    input.max = String(max)
    input.onchange = () => {
      const num = parseInt(input.value, 10)
      if (!isNaN(num) && num >= min && num <= max) onChange(num)
      else input.value = String(value)
    }

    field.appendChild(labelDiv)
    field.appendChild(input)
    return field
  }

  function makeTextField(label: string, desc: string, value: string, onChange: (val: string) => void): HTMLElement {
    const field = document.createElement('div')
    field.className = 'novelist-field'
    field.style.flexDirection = 'column'
    field.style.alignItems = 'stretch'

    const labelDiv = document.createElement('div')
    labelDiv.className = 'novelist-field-label'
    labelDiv.innerHTML = `${escapeHtml(label)}<div class="novelist-field-desc">${escapeHtml(desc)}</div>`

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'novelist-input novelist-input-wide'
    input.value = value
    input.placeholder = 'Leave blank for default'
    input.onchange = () => onChange(input.value.trim())

    field.appendChild(labelDiv)
    field.appendChild(input)
    return field
  }

  function makeConnectionField(label: string, desc: string, value: string, onChange: (val: string) => void): HTMLElement {
    const field = document.createElement('div')
    field.className = 'novelist-field'
    field.style.flexDirection = 'column'
    field.style.alignItems = 'stretch'

    const labelDiv = document.createElement('div')
    labelDiv.className = 'novelist-field-label'
    labelDiv.innerHTML = `${escapeHtml(label)}<div class="novelist-field-desc">${escapeHtml(desc)}</div>`
    field.appendChild(labelDiv)

    if (availableConnections && availableConnections.length > 0) {
      const select = document.createElement('select')
      select.className = 'novelist-input novelist-input-wide'
      select.style.cssText = 'appearance: auto; text-align: left; padding: 6px 8px; cursor: pointer;'

      // Default option
      const defaultOpt = document.createElement('option')
      defaultOpt.value = ''
      defaultOpt.textContent = '— Use active connection —'
      select.appendChild(defaultOpt)

      for (const conn of availableConnections) {
        const opt = document.createElement('option')
        opt.value = conn.id
        opt.textContent = `${conn.name} (${conn.provider}/${conn.model})`
        if (conn.id === value) opt.selected = true
        select.appendChild(opt)
      }

      if (value && !availableConnections.find(c => c.id === value)) {
        // Current value doesn't match any known connection — show it as-is
        const unknownOpt = document.createElement('option')
        unknownOpt.value = value
        unknownOpt.textContent = `⚠ ${value} (unknown)`
        unknownOpt.selected = true
        select.appendChild(unknownOpt)
      }

      select.onchange = () => onChange(select.value)
      field.appendChild(select)
    } else {
      // Fallback to text input if connections haven't loaded
      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'novelist-input novelist-input-wide'
      input.value = value
      input.placeholder = availableConnections === null ? 'Loading connections...' : 'No connections found — enter ID manually'
      input.onchange = () => onChange(input.value.trim())
      field.appendChild(input)
    }

    return field
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
          // Whiteboard changed → token count is stale, re-request it
          whiteboardTokenInfo = null
          ctx.sendToBackend({ type: 'get_whiteboard_tokens', data: { chatId: data.chatId } })
          renderDrawer()
        }
        break
      }

      case 'whiteboard_tokens': {
        const data = payload.data as { chatId: string, tokens: number, approximate: boolean, tokenizer: string, budget: number }
        if (data.chatId === currentChatId) {
          whiteboardTokenInfo = { tokens: data.tokens, approximate: data.approximate, tokenizer: data.tokenizer, budget: data.budget }
          renderDrawer()
        }
        break
      }

      case 'connections_list': {
        const data = payload.data as { connections: Array<{ id: string, name: string, provider: string, model: string }> }
        availableConnections = data.connections
        renderDrawer()
        break
      }

      case 'direct_edit': {
        const data = payload.data as { chatId: string, entry: DirectEditEntry }
        if (data.chatId === currentChatId) {
          directEditHistory.push(data.entry)
          renderDrawer()
        }
        break
      }

      case 'update_history': {
        const data = payload.data as { chatId: string, entries: DirectEditEntry[] }
        if (data.chatId === currentChatId) {
          directEditHistory = data.entries
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
        const data = payload.data as { config: Record<string, unknown> }
        currentConfig = data.config
        renderDrawer()
        break
      }

      case 'config_saved': {
        const data = payload.data as { config: Record<string, unknown> }
        currentConfig = data.config
        break
      }

      case 'rerun_pending_cleared': {
        const data = payload.data as { chatId: string }
        if (data.chatId === currentChatId) {
          pendingUpdates = []
          renderDrawer()
        }
        break
      }

      case 'rerun_started': {
        // The updater is running — the pending_update message will arrive
        // when it finishes, which triggers the normal approval flow.
        // No special handling needed here.
        break
      }

      case 'rerun_error': {
        const data = payload.data as { chatId: string, error: string }
        if (data.chatId === currentChatId) {
          renderDrawer()
        }
        break
      }

      case 'rebuild_progress': {
        const data = payload.data as { chatId: string, step: number, total: number, section: string }
        if (data.chatId === currentChatId) {
          // Update the rebuild button text with progress
          const rebuildBtn = drawerContainer?.querySelector('button[title*="Rebuild"]') as HTMLButtonElement | null
          if (rebuildBtn) rebuildBtn.textContent = `⏳ ${data.step}/${data.total} — ${data.section}`
        }
        break
      }

      case 'rebuild_complete': {
        const data = payload.data as { chatId: string }
        if (data.chatId === currentChatId) {
          renderDrawer()
        }
        break
      }

      case 'rebuild_error': {
        const data = payload.data as { chatId: string, error: string }
        if (data.chatId === currentChatId) {
          renderDrawer()
        }
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
    const payload = raw as { chat?: { id: string }, chatId?: string }
    const newChatId = payload.chat?.id ?? payload.chatId ?? null
    currentChatId = newChatId
    currentWhiteboard = null
    pendingUpdates = []
    recallResults = []
    archiveStats = null
    whiteboardTokenInfo = null
    directEditHistory = []
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
