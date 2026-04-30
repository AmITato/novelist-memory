# Novelist Memory

A Lumiverse Spindle extension implementing persistent memory architecture for long-form serialized AI fiction. Maintains narrative continuity across hundreds of messages by replacing raw conversation history with structured state (the Whiteboard) and intelligent scene retrieval.

## Architecture

Three components:

1. **Whiteboard** — Structured persistent state injected into every generation. Six sections: Chronicle (what happened), Threads (active narrative arcs), Hearts (relationship dynamics), Palette (voice/style continuity), Canon (source material tracking), Author Notes (model-to-self coaching).

2. **Archive** — Full message history stored externally with rich metadata indexing (in-story timestamps, character tags, scene descriptors, emotional registers, thread tags). NOT loaded into primary context.

3. **Retrieval Tools** — Two tools the primary model can call:
   - `recall_by_range` — Direct archive lookup by message index. Zero LLM overhead. The primary model sees message ranges in Chronicle entries and fetches full prose instantly.
   - `recall_scene` — Semantic search via the Intern (background LLM). Slower but finds scenes by thematic/emotional relevance when the model doesn't know the exact message range.

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
| `tools` | Register `recall_scene`, `recall_by_range`, and `random_number` tools |

## Hook points

### Context Handler (priority 50)
Runs before prompt assembly. Reads the whiteboard for the active chat and attaches it to the generation context as `novelistMemory.whiteboard` and `novelistMemory.serialized`. Other extensions can read this.

### Interceptor (priority 30)
Runs after prompt assembly. Injects the serialized whiteboard as a system message immediately after the main system prompt. Creates a Prompt Breakdown entry ("Novelist Memory: Whiteboard") so the user can see it in the token breakdown.

### Tool: `recall_by_range` (inline_available)
Direct archive lookup by message index range. No LLM calls, instant retrieval. The primary model reads `Messages: #N–#M` in Chronicle entries and calls this tool to fetch the full original prose. Returns formatted messages with metadata headers.

### Tool: `recall_scene` (inline_available)
Semantic search via the Intern (background LLM). The primary model calls it with a natural language query describing what scene it needs and why. The intern:
1. Resolves connection (sidecar → explicit override → active connection)
2. Searches the archive index by metadata via quiet gen
3. Fetches full scenes and annotates them
4. Returns formatted results with source info, annotations, and full text

Slower than `recall_by_range` (2-3 background LLM calls) but finds scenes by thematic/emotional relevance when the exact message range isn't known.

### Tool: `random_number` (inline_available)
Test tool for validating inline function calling. Generates a random number between min and max.

### Events
- `GENERATION_ENDED` — triggers whiteboard update + archive check. Captured via catch-all overload to get userId: `(spindle.on as Function)('GENERATION_ENDED', (payload, userId) => {...})`.
- `CHAT_CHANGED` — refreshes macros for the new chat.

## Data flow per generation cycle

```
1. Context Handler reads whiteboard → attaches to context
2. Interceptor injects serialized whiteboard into message array
   (Chronicle entries show "Messages: #N–#M" for each scene)
3. Primary model generates:
   a. During <think> phase, reads Chronicle summaries
   b. Identifies scenes where full prose is needed
   c. Calls recall_by_range with message indices from Chronicle
   d. Receives full archived messages instantly (no LLM overhead)
   e. Continues generation with full scene context
4. GENERATION_ENDED fires → updater runs:
   a. Resolves background connection (sidecar if enabled, else active)
   b. Quiet gen analyzes new exchange → produces whiteboard delta
      (includes sourceMessageRange for each Chronicle entry)
   c. Delta saved as pending update (auto-commits after review window)
   d. Messages past sliding window → archived with metadata extraction
5. Frontend notified of pending update → user can review/edit/reject
```

## Model connection resolution

Background LLM calls (updater + intern) resolve connections in this priority order:

1. **Explicit override** — `internConnectionId` or `updaterConnectionId` in config (set via Settings tab)
2. **Sidecar** — if `useSidecar` is enabled (default: true), reads `CouncilSettings.toolsSettings.sidecar.connectionProfileId`
3. **Active connection** — falls back to the user's currently active connection/preset

This is handled by `resolveBackgroundConnectionId()` in `config.ts`. userId is threaded through for operator-scoped extensions.

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

- **Whiteboard** — Read-only view of all six sections (Chronicle, Threads, Hearts, Palette, Canon, Author Notes) with inline JSON editor (textarea with save/cancel). Shows pending update banners with commit/reject/edit actions.
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
- On `CHAT_CHANGED` event: reads `payload.chat?.id ?? payload.chatId`
- On drawer tab activation: re-checks `ctx.getActiveChat()` in case chat changed while drawer was hidden

## Spindle API type gotchas

- `spindle.on('TOOL_INVOCATION', handler)` — TypeScript overload resolution can fail. Use `(spindle.on as Function)('TOOL_INVOCATION', handler)` or extract the handler to a typed const.
- `spindle.generate.quiet()` returns `Promise<unknown>` — cast result as `{ content: string }`.
- `GenerationRequestDTO` has fields: `messages`, `parameters`, `connection_id`, `signal`, `userId`, `tools`. The `type` field is auto-injected by `quiet()`/`raw()`/`batch()` — don't pass it manually.
- **Operator-scoped userId**: `GenerationRequestDTO.userId` is a field ON the request object (NOT a second argument). For operator-scoped extensions (or globally installed), this is REQUIRED — without it you get `Error: userId is required for operator-scoped extensions`. Thread userId from event handlers (`GENERATION_ENDED`, `TOOL_INVOCATION`, `onFrontendMessage`) and include it as `{ ...request, userId }` in all `quiet()`/`raw()` calls. For user-scoped extensions, `userId` is auto-inferred and can be omitted.
- `spindle.on('GENERATION_ENDED', handler)` — use `(spindle.on as Function)('GENERATION_ENDED', (payload, userId) => {...})` to capture the userId from the catch-all overload.
- `SpindleDrawerTabOptions` uses `title` (not `label`), and the handle has `destroy()` (not `dispose()`).
- `ctx.onBackendMessage()` callback gets `(payload: unknown)` — no userId on the frontend side.
- `spindle.onFrontendMessage()` callback gets `(payload: unknown, userId: string)` — userId is always present.
- **Inline function calling**: Tools registered with `inline_available: true` are sent to the primary model as function call schemas during generation (requires `enableFunctionCalling` in the preset's completion settings). Tool names are sanitized: `extensionId:toolName` → `extensionId__toolName`. The tool execution uses Lumiverse's existing 3-round inline tool call loop.

## Style conventions

- **const over let**, early returns, no else blocks
- **No classes** — plain exported functions
- **Inline types** except shared interfaces in `types.ts`
- **`spindle.log.info/warn/error()`** for all logging — prefix with `[NovelistMemory]`
- **JSON storage** with `{ indent: 2 }` for human readability
- **Error handling**: try/catch at boundaries, fallbacks for LLM failures (e.g., basic metadata when LLM extraction fails)
- **Async patterns**: `Promise.all()` for concurrent work, fire-and-forget with `.catch()` for non-blocking background tasks
- **JSON response parsing**: always strip markdown code fences before `JSON.parse()` — models sometimes wrap JSON in ` ```json `

## Key design decisions

1. **Both context handler AND interceptor** — Context handler lets other extensions see the whiteboard data. Interceptor controls exact placement in the message array.
2. **Auto-commit with review window** — Updates commit after 30s unless the user intervenes. Balances flow with safety.
3. **Pending updates as separate storage** — Don't mutate the whiteboard until committed. Frontend shows pending state with commit/reject/edit actions. `commitPendingUpdate` checks `update.status` to prevent double-application of deltas.
4. **Separate archive index** — Lightweight metadata file (`{chatId}.index.json`) for fast intern scanning without loading full message content.
5. **Direct retrieval via message ranges** — Chronicle entries include `sourceMessageRange` (message indices). The primary model can call `recall_by_range` for instant full-prose retrieval with zero LLM overhead. This is the preferred retrieval path.
6. **Scene-based chronicle, not message-count-based** — Update prompt instructs the model to add entries based on narrative density, not rigid counting.
7. **Sidecar by default** — Background LLM calls use the Council sidecar connection to avoid burning expensive frontier model tokens on bookkeeping. Toggleable in settings.
8. **Settings in drawer tab** — Lumiverse doesn't have a per-extension settings hook in the Spindle panel. All config lives in the drawer's Settings sub-tab.
9. **Inline function calling** — Both `recall_by_range` and `recall_scene` use `inline_available: true` so the primary model (e.g., Lumia) can call them mid-generation during its thinking/planning phase without Council.

## Bugs fixed (session log)

1. **Whiteboard staying empty after generation** — `generate.quiet()` requires `userId` as a field on the request object for operator-scoped extensions. Was missing entirely → silent failure. Fixed by threading `userId` from `GENERATION_ENDED` event handler through the entire pipeline.
2. **userId passed as second arg instead of request field** — `quiet(request, userId)` is wrong. `quiet({ ...request, userId })` is correct. The worker runtime spreads the input and the host reads `input.userId`.
3. **Edit JSON button doubling entries** — `commitPendingUpdate()` didn't check if the update was already committed. Both `autoCommitDueUpdates()` and the `setTimeout` callback could fire for the same update, applying the delta twice. Fixed with `if (update.status === 'committed') return`.
4. **Edit button was a no-op** — Just re-fetched data without opening an editor. Replaced with inline JSON textarea editor with save/cancel.
5. **recall_by_range returning empty for non-archived messages** — Only looked in the archive, which is empty for new chats or messages within the sliding window. Added fallback to `spindle.chat.getMessages()` for direct chat history access regardless of whiteboard/archival state.
6. **GENERATION_ENDED firing when whiteboard disabled** — The event handler was running the full updater pipeline even with `config.enabled = false`. Moved the `config.enabled` check to the very top of the handler, before any other work.
7. **Tool invocations failing with "can't determine active chat"** — `invokeExtensionTool` strips `userId` from args (security) and doesn't pass it in the `tool_invocation` message. The `TOOL_INVOCATION` handler only receives `(payload)` — no userId second arg. This made `spindle.chats.getActive()` fail for operator-scoped extensions. Fixed by capturing `activeGenerationChatId` in the context handler (fires before prompt assembly, before tools execute) and reading it in the tool handler. No `getActive()` call needed.

## Important: tool invocation has no userId

`invokeExtensionTool` in `worker-host.ts` deliberately strips `userId`, `__userId`, and `__user_id` from the tool args for security. The `tool_invocation` message sent to the worker carries no userId field. The worker runtime calls `handler(payload)` with only ONE argument — there is no `(payload, userId)` catch-all for tool invocations like there is for events.

**Consequence:** Tool handlers cannot call APIs that require userId (like `spindle.chats.getActive()` on operator-scoped extensions). Use the context handler to capture state before tools execute.

## Not yet implemented

- **Compaction logic** — when Chronicle grows past `compactionThreshold`, compress older entries
- **Full audit** — every N messages, cross-check whiteboard against archive for drift
- **Token counting** — using rough char/4 estimates; could use `spindle.tokens.countText()` for accuracy
- **Connection picker UI** — dropdown listing available connections instead of raw ID text fields
- **Phase 2.75 CoT integration** — Adding a section to Lumia's chain-of-thought template for Archive Dive retrieval during the thinking phase
