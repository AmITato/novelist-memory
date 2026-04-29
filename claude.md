# Novelist Memory

A Lumiverse Spindle extension implementing persistent memory architecture for long-form serialized AI fiction. Maintains narrative continuity across hundreds of messages by replacing raw conversation history with structured state (the Whiteboard) and intelligent scene retrieval (the Intern).

## Architecture

Three components:

1. **Whiteboard** — Structured persistent state injected into every generation. Six sections: Chronicle (what happened), Threads (active narrative arcs), Hearts (relationship dynamics), Palette (voice/style continuity), Canon (source material tracking), Author Notes (model-to-self coaching).

2. **Archive** — Full message history stored externally with rich metadata indexing (in-story timestamps, character tags, scene descriptors, emotional registers, thread tags). NOT loaded into primary context.

3. **Intern** — A retrieval tool the primary model can call via `recall_scene`. Uses the sidecar model (or active connection) to search the Archive by narrative intent, not keywords. Returns annotated scenes with full original text.

## Project structure

```
novelist-memory/
  spindle.json          # Extension manifest
  package.json          # Build scripts, devDependencies
  tsconfig.json         # TypeScript config
  claude.md             # This file — coding guidelines for AI assistants
  src/
    backend.ts          # Main entry — hooks, tools, events, commands, frontend messaging
    frontend.ts         # Drawer tab UI — whiteboard viewer, recall interface, archive stats, settings
    types.ts            # All TypeScript interfaces
    config.ts           # Extension config with storage persistence + sidecar connection resolution
    whiteboard.ts       # Whiteboard CRUD, delta application, serialization for injection
    archive.ts          # Archive CRUD, metadata indexing, search helpers
    intern.ts           # Intern retrieval logic — index search, scene annotation
    updater.ts          # Post-generation pipeline — whiteboard updates, message archival
    prompts.ts          # All LLM prompt templates (update, metadata extraction, intern)
  dist/
    backend.js          # Built backend bundle
    frontend.js         # Built frontend bundle
```

## Tech stack

- Runtime: Bun (Spindle subprocess/worker)
- Language: TypeScript (strict)
- Build: `bun build` with ESM output
- Storage: Spindle extension storage API (JSON files)
- LLM calls: Spindle `generate.quiet()` for updater and intern
- UI: Spindle drawer tab with vanilla DOM (CSS variables from Lumiverse theme)

## Building

```bash
bun install
bun run build          # Builds both backend and frontend
bun run build:backend  # Backend only
bun run build:frontend # Frontend only
```

## Spindle permissions used

| Permission | Why |
|---|---|
| `generation` | Quiet gen for whiteboard updates and intern retrieval |
| `interceptor` | Inject serialized whiteboard into final message array post-assembly |
| `context_handler` | Seed whiteboard data into generation context pre-assembly |
| `chat_mutation` | Read chat messages for archival and context |
| `chats` | Access active chat info, council settings for sidecar resolution |
| `tools` | Register `recall_scene` tool for primary model |

## Hook points

### Context Handler (priority 50)
Runs before prompt assembly. Reads the whiteboard for the active chat and attaches it to the generation context as `novelistMemory.whiteboard` and `novelistMemory.serialized`. Other extensions can read this.

### Interceptor (priority 30)
Runs after prompt assembly. Injects the serialized whiteboard as a system message immediately after the main system prompt. Creates a Prompt Breakdown entry ("Novelist Memory: Whiteboard") so the user can see it in the token breakdown.

### Tool: `recall_scene`
Registered as a council-eligible tool. The primary model calls it with a natural language query describing what scene it needs and why. The intern:
1. Resolves connection (sidecar → explicit override → active connection)
2. Searches the archive index by metadata via quiet gen
3. Fetches full scenes and annotates them
4. Returns formatted results with source info, annotations, and full text

### Events
- `GENERATION_ENDED` — triggers whiteboard update + archive check. Payload: `{ generationId, chatId, messageId, content, usage }`.
- `CHAT_CHANGED` — refreshes macros for the new chat. Payload: `{ chat: { id, ... } }` (NOT `{ chatId }`).

## Data flow per generation cycle

```
1. Context Handler reads whiteboard → attaches to context
2. Interceptor injects serialized whiteboard into message array
3. Primary model generates (can tool-call recall_scene mid-generation)
4. GENERATION_ENDED fires → updater runs:
   a. Resolves background connection (sidecar if enabled, else active)
   b. Quiet gen analyzes new exchange → produces whiteboard delta
   c. Delta saved as pending update (auto-commits after review window)
   d. Messages past sliding window → archived with metadata extraction
5. Frontend notified of pending update → user can review/edit/reject
```

## Model connection resolution

Background LLM calls (updater + intern) resolve connections in this priority order:

1. **Explicit override** — `internConnectionId` or `updaterConnectionId` in config (set via Settings tab)
2. **Sidecar** — if `useSidecar` is enabled (default: true), reads `CouncilSettings.toolsSettings.sidecar.connectionProfileId`
3. **Active connection** — falls back to the user's currently active connection/preset

This is handled by `resolveBackgroundConnectionId()` in `config.ts`.

## Configuration (stored in `config.json`)

| Setting | Default | Description |
|---|---|---|
| `enabled` | `true` | Master toggle |
| `slidingWindowSize` | `6` | Number of recent exchanges kept in active context |
| `autoCommitUpdates` | `true` | Auto-commit whiteboard updates after review window |
| `useSidecar` | `true` | Use Council sidecar connection for background LLM calls |
| `updateReviewWindowMs` | `30000` | Review window before auto-commit (30s) |
| `whiteboardTokenBudget` | `12000` | Warn when whiteboard exceeds this token count |
| `internConnectionId` | (none) | Optional explicit connection override for intern model |
| `updaterConnectionId` | (none) | Optional explicit connection override for updater model |
| `compactionThreshold` | `100` | Chronicle entries before compaction triggers |
| `auditIntervalMessages` | `40` | Messages between full whiteboard audits |

## Frontend

Single drawer tab ("Novelist Memory") with four sub-tabs:

- **Whiteboard** — Read-only view of all six sections (Chronicle, Threads, Hearts, Palette, Canon, Author Notes) with JSON edit button. Shows pending update banners with commit/reject/edit actions.
- **Recall** — Manual intern query interface. Textarea for natural language queries, results displayed with source info, annotations, and expandable full scenes.
- **Archive** — Stats dashboard: total archived messages, total tokens, character appearance counts, emotional register breakdown. Refresh button.
- **Settings** — Full configuration form with:
  - General: Enabled toggle, Auto-Commit toggle, Use Sidecar toggle
  - Context Window: Sliding window size, token budget, review window (seconds)
  - Maintenance: Compaction threshold, audit interval
  - Model Connections: Intern and updater connection ID overrides (text fields)
  - Danger Zone: Reset whiteboard button with confirmation

Settings save immediately on change (no save button needed). Green "✓ Settings saved" banner appears briefly on each change.

### Frontend chat detection

- On setup: calls `ctx.getActiveChat()` to detect the current chat immediately
- On `CHAT_CHANGED` event: reads `payload.chat?.id ?? payload.chatId` (Lumiverse emits `{ chat: { id, ... } }`)
- On drawer tab activation: re-checks `ctx.getActiveChat()` in case chat changed while drawer was hidden

## Lumiverse event payload shapes (important)

These are the actual shapes — not what you'd guess from the event name:

- `CHAT_CHANGED`: `{ chat: { id: string, ... } }` or `{ chatId: string, reattributedUserMessages: number }`
- `GENERATION_ENDED`: `{ generationId: string, chatId: string, messageId: string, content: string, usage: object }`
- `TOOL_INVOCATION`: `ToolInvocationPayloadDTO` — `{ toolName, args, requestId, councilMember?, contextMessages? }`

Frontend events via `ctx.events.on()` receive `(payload: unknown)` — always cast.
Backend events via `spindle.on()` have typed overloads for generation events but a catch-all `(payload: unknown, userId?: string)` for others.

## Spindle API type gotchas

- `spindle.on('TOOL_INVOCATION', handler)` — TypeScript overload resolution can fail. Use `(spindle.on as Function)('TOOL_INVOCATION', handler)` or extract the handler to a typed const.
- `spindle.generate.quiet()` returns `Promise<unknown>` — cast result as `{ content: string }`.
- `GenerationRequestDTO` requires `type: 'quiet' | 'raw' | 'batch'` — don't omit it.
- `SpindleDrawerTabOptions` uses `title` (not `label`), and the handle has `destroy()` (not `dispose()`).
- `ctx.onBackendMessage()` callback gets `(payload: unknown)` — no userId on the frontend side.
- `spindle.onFrontendMessage()` callback gets `(payload: unknown, userId: string)` — userId is always present.

## Style conventions

- **const over let**, early returns, no else blocks
- **No classes** — plain exported functions
- **Inline types** except shared interfaces in `types.ts`
- **`spindle.log.info/warn/error()`** for all logging
- **JSON storage** with `{ indent: 2 }` for human readability
- **Error handling**: try/catch at boundaries, fallbacks for LLM failures (e.g., basic metadata when LLM extraction fails)
- **Async patterns**: `Promise.all()` for concurrent work, fire-and-forget with `.catch()` for non-blocking background tasks
- **JSON response parsing**: always strip markdown code fences before `JSON.parse()` — models sometimes wrap JSON in ` ```json `

## Key design decisions

1. **Both context handler AND interceptor** — Context handler lets other extensions see the whiteboard data. Interceptor controls exact placement in the message array.
2. **Auto-commit with review window** — Updates commit after 30s unless the user intervenes. Balances flow with safety.
3. **Pending updates as separate storage** — Don't mutate the whiteboard until committed. Frontend shows pending state with commit/reject/edit actions.
4. **Separate archive index** — Lightweight metadata file (`{chatId}.index.json`) for fast intern scanning without loading full message content.
5. **Narrative-aware retrieval** — Intern uses LLM comprehension (not keyword search) to find scenes by emotional/thematic relevance.
6. **Scene-based chronicle, not message-count-based** — Update prompt instructs the model to add entries based on narrative density, not rigid counting.
7. **Sidecar by default** — Background LLM calls use the Council sidecar connection to avoid burning expensive frontier model tokens on bookkeeping. Toggleable in settings.
8. **Settings in drawer tab** — Lumiverse doesn't have a per-extension settings hook in the Spindle panel. All config lives in the drawer's Settings sub-tab.

## Not yet implemented

- **Compaction logic** — when Chronicle grows past `compactionThreshold`, compress older entries
- **Full audit** — every N messages, cross-check whiteboard against archive for drift
- **Token counting** — using rough char/4 estimates; could use `spindle.tokens.countText()` for accuracy
- **Connection picker UI** — dropdown listing available connections instead of raw ID text fields
