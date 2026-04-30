# Novelist Memory

A Lumiverse Spindle extension implementing persistent memory architecture for long-form serialized AI fiction. Maintains narrative continuity across hundreds of messages by replacing raw conversation history with structured state (the Whiteboard) and intelligent scene retrieval.

## Architecture

Four components:

1. **Whiteboard** — Structured persistent state injected into every generation. Six sections: Chronicle (what happened), Threads (active narrative arcs), Hearts (relationship dynamics), Palette (voice/style continuity), Canon (source material tracking), Author Notes (model-to-self coaching).

2. **Archive** — Full message history stored externally with rich metadata indexing (in-story timestamps, character tags, scene descriptors, emotional registers, thread tags). NOT loaded into primary context.

3. **Retrieval Tools** — Tools the primary model can call mid-generation:
   - `recall_by_range` — Direct archive lookup by message index. Zero LLM overhead.
   - `recall_scene` — Semantic search via the Intern (background LLM). Finds scenes by thematic/emotional relevance.
   - `update_whiteboard` — Direct whiteboard mutation. The model can edit any section mid-generation without waiting for the post-gen updater.

4. **Versioning** — Whiteboard snapshots tagged by message + swipe, enabling correct state on swipe navigation, regen rewind, and fork seeding.

## Project structure

```
novelist-memory/
  spindle.json          # Extension manifest
  package.json          # Build scripts, devDependencies
  tsconfig.json         # TypeScript config
  claude.md             # This file — coding guidelines for AI assistants
  cot_phase_novelist_memory.md  # CoT integration guide for Lumia's Weave Planning Phase
  src/
    backend.ts          # Main entry — hooks, tools, events, commands, frontend messaging
    frontend.ts         # Drawer tab UI — whiteboard viewer, recall interface, archive stats, settings
    types.ts            # All TypeScript interfaces
    config.ts           # Extension config with storage persistence + sidecar connection resolution
    whiteboard.ts       # Whiteboard CRUD, delta application, calibration bank, serialization
    snapshots.ts        # Whiteboard versioning — snapshot CRUD, fork seeding, pruning
    archive.ts          # Archive CRUD, metadata indexing, search helpers
    intern.ts           # Intern retrieval logic — index search, scene annotation
    updater.ts          # Post-generation pipeline — whiteboard updates, message archival
    tokens.ts           # Token counting wrapper — spindle.tokens.countText with char/4 fallback
    prompts.ts          # All LLM prompt templates (update, metadata extraction, intern)
  dist/
    backend.js          # Built backend bundle
    frontend.js         # Built frontend bundle
```

## Storage directories

| Directory | Contents |
|---|---|
| `whiteboards/` | `{chatId}.json` — per-chat whiteboard state |
| `archives/` | `{chatId}.json` — per-chat archived messages with metadata |
| `pending/` | `{chatId}.json` — pending whiteboard updates awaiting commit |
| `snapshots/` | `{chatId}.json` — whiteboard snapshot chains for versioning |
| `calibration/` | `{chatId}.json` — per-chat calibration example banks |

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
| `generation` | Quiet gen for whiteboard updates, intern retrieval, and GENERATION_STARTED/GENERATION_ENDED events |
| `interceptor` | Inject serialized whiteboard into final message array post-assembly |
| `context_handler` | Seed whiteboard data into generation context pre-assembly |
| `chat_mutation` | Read chat messages for archival and context |
| `chats` | Access active chat info, council settings for sidecar resolution, fork detection |
| `characters` | Read character cards for sidecar updater context injection |
| `personas` | Read active persona for sidecar updater context injection |
| `tools` | Register `recall_scene`, `recall_by_range`, `update_whiteboard`, and `random_number` tools |

## Hook points

### Context Handler (priority 50)
Runs before prompt assembly. Reads the whiteboard for the active chat and attaches it to the generation context as `novelistMemory.whiteboard` and `novelistMemory.serialized`. Other extensions can read this. Also captures `activeGenerationChatId` for tool handlers.

### Interceptor (priority 30)
Runs after prompt assembly. Injects the serialized whiteboard as a system message immediately after the main system prompt. Creates a Prompt Breakdown entry ("Novelist Memory: Whiteboard") so the user can see it in the token breakdown.

### Tool: `update_whiteboard` (inline_available)
Direct whiteboard mutation tool. The primary model can call this mid-generation to edit the whiteboard immediately rather than waiting for the post-generation updater pipeline. Accepts a `WhiteboardDelta` object as its arguments — same schema the updater produces. Supports all six sections: chronicle (add/update), threads (add/update), hearts (add/update), palette (shallow merge), canon (timeline/events), authorNotes (add/remove).

Behavior is controlled by the `directEditRequiresReview` config option:
- **`false` (default)** — Delta is applied immediately via `applyDelta` + `saveWhiteboard`. Frontend is notified with `whiteboard_data` so the drawer updates live. Macros are refreshed. Delta is accumulated in `pendingDirectDeltas` for the eventual snapshot.
- **`true`** — Delta is wrapped in a `PendingUpdate` and saved via `savePendingUpdate`. Frontend is notified with `pending_update`. The user can review/edit/reject from the drawer. Auto-commit timer applies if `autoCommitUpdates` is enabled.

Uses `activeGenerationChatId` (captured by context handler) — same pattern as the recall tools.

### Tool: `recall_by_range` (inline_available)
Direct archive lookup by message index range. No LLM calls, instant retrieval. The primary model reads `Messages: #N–#M` in Chronicle entries and calls this tool to fetch the full original prose. Returns formatted messages with metadata headers. Falls back to `spindle.chat.getMessages()` for messages not yet archived.

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

- `GENERATION_STARTED` — Captures `targetMessageId` for regen detection, `generationType` for impersonate detection. If impersonate, returns early (skips all processing). If regen (`targetMessageId` present), rewinds whiteboard to pre-message state. Resets per-generation state (`pendingDirectDeltas`, etc.). Uses typed overload: `spindle.on('GENERATION_STARTED', handler)`.
- `GENERATION_ENDED` — First checks `generationType` (from payload, with fallback to value captured by `GENERATION_STARTED`). If impersonate, skips everything and resets state. Otherwise runs updater pipeline, then creates a `WhiteboardSnapshot` tagged with messageId + swipeId + messageIndex. Captured via catch-all overload to get userId: `(spindle.on as Function)('GENERATION_ENDED', (payload, userId) => {...})`.
- `MESSAGE_SWIPED` — Handles swipe navigation. When `action === 'navigated'`, restores the whiteboard snapshot for the target swipe. If no snapshot found (swipe predates snapshot system), leaves whiteboard unchanged. Uses typed overload: `spindle.on('MESSAGE_SWIPED', handler)`.
- `CHAT_SWITCHED` — Handles fork seeding. When the user navigates to a forked chat with an empty whiteboard, seeds it from the parent chat's snapshots at the fork point. If no snapshots exist for the fork point, leaves whiteboard blank rather than copying stale state. Captures `userId` from the catch-all overload for `spindle.chats.get()` calls. Uses cast overload: `(spindle.on as Function)('CHAT_SWITCHED', (payload, userId) => {...})`.
- `CHAT_CHANGED` — Refreshes macros for the new chat.
- `MESSAGE_DELETED` — Handles full cleanup when a message is deleted: rewinds whiteboard to preState, removes snapshots for the deleted messageId, rejects pending updates sourced from it, removes archive entries. Captures `userId` from the catch-all overload. Uses cast overload: `(spindle.on as Function)('MESSAGE_DELETED', (payload, userId) => {...})`.

## Data flow per generation cycle

```
1. GENERATION_STARTED fires:
   - Captures targetMessageId, generationType
   - If impersonate → skip everything, return
   - If regen → rewind whiteboard to pre-message state (preserve old swipe snapshots)
   - Reset pendingDirectDeltas

2. Context Handler reads whiteboard → attaches to context

3. Interceptor injects serialized whiteboard into message array
   (Chronicle entries show "Messages: #N–#M" for each scene)

4. Primary model generates:
   a. During <think> phase, reads Chronicle summaries + whiteboard
   b. May call recall_by_range for full prose from Chronicle message ranges
   c. May call recall_scene for thematic/emotional scene retrieval
   d. May call update_whiteboard to pin changes mid-generation
      (deltas accumulated in pendingDirectDeltas for snapshot)
   e. Continues generation with full context

5. GENERATION_ENDED fires:
   a. If impersonate → skip, reset state, return
   b. Runs updater pipeline:
      - Quiet gen analyzes new exchange → produces whiteboard delta
      - Delta saved as pending update (auto-commits after review window)
      - Messages past sliding window → archived with metadata extraction
   c. Creates WhiteboardSnapshot with final state + all accumulated deltas
   d. Prunes old snapshots per retention policy
   e. Resets per-generation state
```

## Whiteboard versioning (swipe/fork/regen awareness)

The whiteboard is versioned via snapshots so that swipes, regenerations, and forks don't desync narrative state from what the user is actually reading.

### Core data structure: `WhiteboardSnapshot`

```ts
interface WhiteboardSnapshot {
  id: string              // "snap_{timestamp}_{random6}"
  chatId: string
  messageId: string       // which message's generation produced this
  swipeId: number         // which swipe variant
  messageIndex: number    // array position in chat (for fork lookups)
  state: Whiteboard       // full whiteboard AFTER all deltas applied
  preState?: Whiteboard   // whiteboard BEFORE this generation's deltas (used for regen rewind)
  deltas: WhiteboardDelta[]  // all deltas from this generation
  source: 'updater' | 'direct_edit' | 'combined'
  timestamp: string
}
```

Stored per-chat at `snapshots/{chatId}.json`. Ordered by creation time.

### How it handles each scenario

**Normal generation:** After the updater runs, a snapshot is created tagged with `messageId + swipeId + messageIndex`. The snapshot's `state` is the full whiteboard after all deltas (direct edits via `update_whiteboard` + updater).

**Regeneration:** `GENERATION_STARTED` detects regen via `targetMessageId`. Before the new generation runs, `performRegenRewind` rewinds the whiteboard via a three-tier fallback: (1) the latest snapshot of the target message's recorded `preState` (most accurate — exact whiteboard state before this message was first generated); (2) the latest snapshot belonging to any *other* message (legacy path, treats "end of previous message" as the new pre-state); (3) empty whiteboard if the only snapshots in the chat are for the target message itself (first-message-of-chat scenario). After rewind, `preGenerationState` is captured for the new generation so its eventual snapshot will have an exact `preState` recorded. Old swipe snapshots are **preserved** (not deleted) so the user can swipe back. The new generation creates a fresh snapshot with the new swipe's `swipeId`.

**Swipe navigation:** `MESSAGE_SWIPED(navigated)` looks up the snapshot for `messageId + target swipeId`. If found, restores it as the active whiteboard. If not found (swipe predates snapshot system), leaves whiteboard unchanged.

**Fork:** `CHAT_SWITCHED` detects forked chats via `metadata.branched_from`. If the new branch's whiteboard is empty and snapshots exist at the fork point, seeds from them and copies swipe-variant snapshots (remapped to the branch's message IDs). If no snapshots exist at the fork point, **leaves whiteboard blank** rather than copying stale state from the parent's current position.

### Pruning

Controlled by two config fields:
- `snapshotRetentionAllSwipes` (default 1): Keep ALL swipe snapshots for the last N messages
- `snapshotRetentionMessages` (default 10): Keep the latest snapshot per message for the last N messages
- Everything older is dropped

### Module-level generation state

```
activeGenerationChatId      — set by context handler (pre-assembly)
activeGenerationMessageId   — set by GENERATION_STARTED
activeGenerationIsRegen     — true if targetMessageId present
activeGenerationType        — set by GENERATION_STARTED from payload.generationType
pendingDirectDeltas         — accumulated by update_whiteboard tool calls, reset per generation
preGenerationState          — captured at GENERATION_STARTED (post-rewind for regens), saved into snapshot at GENERATION_ENDED
```

### Impersonate handling

Impersonate generates a user-side message (not narrative content). Both `GENERATION_STARTED` and `GENERATION_ENDED` check `generationType === 'impersonate'` and skip all processing (no updater, no snapshot, no rewind). The `generationType` field is emitted by Lumiverse core (`generate.service.ts`) — added in [PR #88](https://github.com/prolix-oc/Lumiverse/pull/88). The corresponding type definition is in [lumiverse-spindle-types PR #6](https://github.com/prolix-oc/lumiverse-spindle-types/pull/6).

## Calibration bank system

The updater prompt uses a two-layer calibration system to ensure high-quality whiteboard entries from the first generation.

### Layer 1: Default structural examples (always available)
Built into `prompts.ts` as constants. Use generic placeholder characters (A, B, C, Authority) to show the right *shape* and *density* without being tied to any story. These fire for any sparse section that doesn't have a per-chat calibration bank.

### Layer 2: Per-chat calibration bank (optional override)
Stored at `calibration/{chatId}.json`. When present, overrides the defaults for that section. Story-specific examples (e.g., MHA character examples for Lumia's chats) live here.

### CalibrationBank type

```ts
interface CalibrationBank {
  chatId: string
  chronicle?: string[]    // example chronicle entries (raw text blocks)
  threads?: string[]      // example thread entries
  hearts?: string[]       // example hearts entries
  palette?: string[]      // example palette entries
  canon?: string[]        // example canon entries
  authorNotes?: string[]  // example author notes
}
```

### Phase-out logic

Each section has a sparseness threshold (Chronicle < 3, Threads < 2, Hearts < 2, Palette < 2 total entries, Canon < 1, AuthorNotes < 2). When a section is sparse:
- If per-chat bank has examples for this section → inject as "STORY-SPECIFIC EXAMPLES"
- If no bank examples → inject default structural examples as "STRUCTURAL EXAMPLE"
- If section is NOT sparse → nothing injected. Existing entries serve as the style guide.

### Adaptive Canon mode

The updater prompt detects whether the story is an adaptation or original fiction by checking if `canon.completedEvents`, `upcomingEvents`, or `butterflyLog` have entries:
- **Adaptation mode**: Full source material tracking, deviation logging, butterfly effect analysis, foreshadowing flags
- **Original fiction mode**: Lightweight timeline tracking, no source-material overhead

## Updater prompt structure

The `buildUpdatePrompt` function in `prompts.ts` builds a comprehensive system prompt for the background updater LLM:

1. **Role declaration** — "You are a narrative continuity analyst"
2. **Current whiteboard state** — full serialized whiteboard
3. **Recent context** — last few exchanges for continuity
4. **Latest exchange** — user + assistant messages, with message index range
5. **Section guidelines** — per-section with:
   - Density targets (e.g., Chronicle: 3-6 sentences per entry)
   - Entry cadence rules (when to add vs. skip)
   - DO/DON'T rules (negative examples are gold for smaller models)
   - Calibration examples (conditionally injected based on sparseness)
6. **JSON schema** — exact WhiteboardDelta format expected

Called with `temperature: 0.3, max_tokens: 4000` via the sidecar connection.

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
| `directEditRequiresReview` | `false` | Whether model-initiated whiteboard edits go through the pending/review flow |
| `snapshotRetentionMessages` | `10` | Keep latest snapshot per message for this many recent messages |
| `snapshotRetentionAllSwipes` | `1` | Keep all swipe snapshots for the last N messages |
| `includeCharacterContext` | `true` | Send active character card + persona to the sidecar updater for richer entries |
| `injectOnImpersonate` | `false` | Include whiteboard in context when generating impersonate (user-side) messages |
| `updaterTemperature` | `0.3` | Temperature for the sidecar updater quiet gen (0.0–1.0). Lower = more precise JSON, higher = richer narrative entries |
| `compactionThreshold` | `100` | Chronicle entries before compaction triggers |
| `auditIntervalMessages` | `40` | Messages between full whiteboard audits |

## Frontend

Single drawer tab ("Novelist Memory") with four sub-tabs:

- **Whiteboard** — Read-only view of all six sections (Chronicle, Threads, Hearts, Palette, Canon, Author Notes) with inline JSON editor (textarea with save/cancel). Shows pending update banners with commit/reject/edit actions.
- **Recall** — Manual intern query interface. Textarea for natural language queries, results displayed with source info, annotations, and expandable full scenes.
- **Archive** — Stats dashboard: total archived messages, total tokens, character appearance counts, emotional register breakdown. Refresh button.
- **Settings** — Full configuration form with:
  - General: Enabled toggle, Auto-Commit toggle, Use Sidecar toggle, Include Character Context toggle, Inject on Impersonate toggle
  - Context Window: Sliding window size, token budget, review window (seconds)
  - Maintenance: Compaction threshold, audit interval
  - Model Connections: Intern and updater connection ID dropdowns, updater temperature slider (0.0–1.0)
  - Debug: Re-run Updater buttons (Reset to Pre / Keep Current) for A/B testing sidecar models
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
- `spindle.on('GENERATION_STARTED', handler)` — has a typed overload. Payload includes `generationId`, `chatId`, `model`, `targetMessageId?`, `characterId?`, `characterName?`, `generationType?`.
- `spindle.on('MESSAGE_SWIPED', handler)` — has a typed overload. Payload includes `chatId`, `message` (full `ChatMessageDTO`), `action` (`'added' | 'updated' | 'deleted' | 'navigated'`), `swipeId`, `previousSwipeId?`.
- `CHAT_SWITCHED` — no typed overload. Use `(spindle.on as Function)('CHAT_SWITCHED', handler)`. Payload: `{ chatId: string | null }`.
- `SpindleDrawerTabOptions` uses `title` (not `label`), and the handle has `destroy()` (not `dispose()`).
- `ctx.onBackendMessage()` callback gets `(payload: unknown)` — no userId on the frontend side.
- `spindle.onFrontendMessage()` callback gets `(payload: unknown, userId: string)` — userId is always present.
- **Inline function calling**: Tools registered with `inline_available: true` are sent to the primary model as function call schemas during generation (requires `enableFunctionCalling` in the preset's completion settings). Tool names are sanitized: `extensionId:toolName` → `extensionId__toolName`. The tool execution uses Lumiverse's existing 3-round inline tool call loop.
- **Tool invocations have no userId**: `invokeExtensionTool` in the worker host strips `userId`/`__userId`/`__user_id` from args for security. The `tool_invocation` message carries no userId. The handler receives `(payload)` only — NOT `(payload, userId)`. Don't call APIs that need userId (like `getActive()`) in tool handlers. Use the context handler to capture state beforehand.
- **`spindle.chats.get(chatId)`** — returns `ChatDTO` with `metadata: Record<string, unknown>`. Forked chats have `metadata.branched_from` (parent chat ID) and `metadata.branch_at_message` (fork-point message ID) at runtime. Access with type narrowing: `chat.metadata.branched_from as string | undefined`.

## Lumiverse core changes (inline tool calling)

We added inline function calling support for Spindle extension tools to Lumiverse core. PR: https://github.com/prolix-oc/Lumiverse/pull/88

### What was changed in Lumiverse (2 files)

**`src/spindle/tool-registry.ts`:**
- Added `getInlineAvailableTools()` — filters tools with `inline_available: true`

**`src/services/generate.service.ts`:**
- After the Council tools block (~line 1753), queries `toolRegistry.getInlineAvailableTools()` and injects them into the `inlineTools` array sent to the LLM provider. Gated by the same `enableFunctionCalling` preset toggle. Tool names sanitized `extensionId:toolName` → `extensionId__toolName`.
- Extended `executeInlineCouncilToolCalls()` to handle both Council-prefixed tools (`memberPrefix_toolName`) and bare extension tools (direct `toolsByName` lookup). Extension tools dispatch via `invokeExtensionCouncilTool` without council member context.
- Relaxed streaming loop dispatch gate — no longer requires `inlineMembersByPrefix`, fires when `inlineToolDefsByName` exists.

## Lumiverse core changes (generation type events)

Added `generationType` to all `GENERATION_STARTED` and `GENERATION_ENDED` event emissions in `generate.service.ts`. Same PR: https://github.com/prolix-oc/Lumiverse/pull/88

**`src/services/generate.service.ts`:**
- Added `generationType: lifecycle.generationType` to the `GENERATION_STARTED` emission (~line 1353)
- Added `generationType: lifecycle.generationType` to all three `GENERATION_ENDED` emissions (success ~2776, pre-stream error ~2048, mid-stream error ~2972)
- Exposes `normal`, `continue`, `regenerate`, `swipe`, or `impersonate` so extensions can distinguish generation types

### What was changed in lumiverse-spindle-types

PR: https://github.com/prolix-oc/lumiverse-spindle-types/pull/6

**`src/tools.ts`** — Added `inline_available?: boolean` to `ToolRegistration`
**`src/api.ts`** — Added `inline_available?: boolean` to `ToolRegistrationDTO`, `generationType?: string` to `GenerationStartedPayloadDTO` and `GenerationEndedPayloadDTO`

These changes are applied locally in `node_modules/` and `clean/` cache. PR #6 is open against `prolix-oc/lumiverse-spindle-types` — pending merge and npm publish.

## Lumiverse generation lifecycle (reference)

| User Action | Events Fired (in order) |
|---|---|
| **Send new message** | `MESSAGE_SENT` (user), `GENERATION_STARTED`, streaming..., `MESSAGE_SENT` (assistant), `GENERATION_ENDED` |
| **Regenerate** | `MESSAGE_SWIPED(added)` (blank swipe), `GENERATION_STARTED(targetMessageId=X)`, streaming..., `MESSAGE_SWIPED(updated)`, `GENERATION_ENDED(messageId=X)` |
| **Continue** | `GENERATION_STARTED(targetMessageId=X)`, streaming..., `MESSAGE_EDITED`, `GENERATION_ENDED(messageId=X)` |
| **Swipe left/right** | `MESSAGE_SWIPED(navigated)` — no generation events |
| **Impersonate** | `GENERATION_STARTED(generationType='impersonate')`, streaming..., `GENERATION_ENDED(generationType='impersonate')` — creates user message |
| **Fork** | New chat created via REST. `CHAT_SWITCHED` when user navigates to it |

Key facts:
- Tool call round-trips happen INSIDE `runGeneration` — they do NOT fire separate events. Max 3 rounds.
- `GENERATION_ENDED` fires exactly ONCE per `startGeneration` call.
- `quiet`/`raw`/`batch`/`summarize` generations never fire `GENERATION_ENDED`.
- Forks create a **new chat** with copied messages. `metadata.branched_from` and `metadata.branch_at_message` are set on the new chat.

## CoT integration (Lumia's Weave Planning Phase)

The file `cot_phase_novelist_memory.md` contains the full integration guide for adding Novelist Memory awareness to Lumia's chain-of-thought in the Lucid Loom preset. Three insertions:

1. **Step 2 addition (Archive Dive)** — Guidance for calling `recall_by_range` and `recall_scene` when memory feels thin during "Ground Myself in the Last Beat."
2. **Step 4 addition (Whiteboard Cross-Reference)** — Active scanning of the injected whiteboard during "Track the Bigger Picture" to catch stale entries.
3. **NEW Step 4.5 (The Memory Forge)** — Full new step where Lumia pins changes to the whiteboard via `update_whiteboard`. Walks through each section with concrete tool call examples.

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
9. **Inline function calling** — `recall_by_range`, `recall_scene`, and `update_whiteboard` use `inline_available: true` so the primary model can call them mid-generation during its thinking/planning phase without Council.
10. **Calibration bank for prompt quality** — Two-layer calibration: default structural examples (generic characters, always available) + per-chat story-specific examples (override defaults when sparse). Examples phase out once the whiteboard fills past threshold.
11. **Adaptive Canon mode** — Updater prompt detects adaptation vs original fiction from existing Canon entries and adjusts guidance accordingly.
12. **Impersonate handling** — `GENERATION_STARTED` and `GENERATION_ENDED` check `generationType === 'impersonate'` and skip updater processing and snapshot creation. Whiteboard injection (context handler + interceptor) is gated by the `injectOnImpersonate` config toggle (default false). When enabled, the model generating the user-side message sees the whiteboard for continuity; the sidecar never processes impersonate output regardless.
13. **Snapshot preservation on regen** — Old swipe snapshots are NOT deleted during regen rewind. The user can swipe back to a previous response and the whiteboard restores correctly.
14. **Blank fork on missing snapshots** — When forking to a point with no snapshot data, the whiteboard starts blank rather than copying stale state from the parent's current position.
15. **`config.enabled` controls injection, not versioning** — The master toggle gates two things: (1) whiteboard injection into LLM context (context handler + interceptor), and (2) the background updater pipeline in `GENERATION_ENDED`. It does NOT gate snapshot creation, regen rewind, swipe restore, or the `update_whiteboard` tool. This means versioning is always safe even when the user is testing with injection disabled.

## Bugs fixed (session log)

1. **Whiteboard staying empty after generation** — `generate.quiet()` requires `userId` as a field on the request object for operator-scoped extensions. Was missing entirely → silent failure. Fixed by threading `userId` from `GENERATION_ENDED` event handler through the entire pipeline.
2. **userId passed as second arg instead of request field** — `quiet(request, userId)` is wrong. `quiet({ ...request, userId })` is correct. The worker runtime spreads the input and the host reads `input.userId`.
3. **Edit JSON button doubling entries** — `commitPendingUpdate()` didn't check if the update was already committed. Both `autoCommitDueUpdates()` and the `setTimeout` callback could fire for the same update, applying the delta twice. Fixed with `if (update.status === 'committed') return`.
4. **Edit button was a no-op** — Just re-fetched data without opening an editor. Replaced with inline JSON textarea editor with save/cancel.
5. **recall_by_range returning empty for non-archived messages** — Only looked in the archive, which is empty for new chats or messages within the sliding window. Added fallback to `spindle.chat.getMessages()` for direct chat history access regardless of whiteboard/archival state.
6. **GENERATION_ENDED firing when whiteboard disabled** — The event handler was running the full updater pipeline even with `config.enabled = false`. Moved the `config.enabled` check to the very top of the handler, before any other work.
7. **Tool invocations failing with "can't determine active chat"** — `invokeExtensionTool` strips `userId` from args (security) and doesn't pass it in the `tool_invocation` message. The `TOOL_INVOCATION` handler only receives `(payload)` — no userId second arg. This made `spindle.chats.getActive()` fail for operator-scoped extensions. Fixed by capturing `activeGenerationChatId` in the context handler (fires before prompt assembly, before tools execute) and reading it in the tool handler. No `getActive()` call needed.
8. **Swipe-back not restoring whiteboard** — `removeSnapshotsForMessage` in the regen rewind handler was deleting ALL snapshots for the message, including those for previous swipes. Fixed by preserving old swipe snapshots — only the whiteboard state is rewound, not the snapshot history.
9. **Fork copying parent's current state instead of fork-point state** — When no snapshots existed at the fork point, the fallback copied the parent's current whiteboard (which includes state from messages after the fork point). Fixed by returning blank instead — no snapshot = no tracked state = blank whiteboard.
10. **Swipe not undoing `update_whiteboard` changes when `enabled = false`** — The `update_whiteboard` tool handler does not check `config.enabled` (by design — the tool should work regardless of context injection). But `GENERATION_ENDED`, `GENERATION_STARTED` (regen rewind), and `MESSAGE_SWIPED` (snapshot restore) all had `config.enabled` early-return gates that prevented snapshot creation, rewind, and restore when disabled. This meant whiteboard mutations from the tool persisted across swipes/regens with no undo mechanism. Additionally, the `GENERATION_ENDED` early return skipped state variable cleanup (`pendingDirectDeltas`, `activeGenerationIsRegen`, etc.), leaking stale state into subsequent generations. Fixed by: (1) moving `config.enabled` in `GENERATION_ENDED` to only gate the updater pipeline — snapshot creation and state cleanup always run; (2) removing the `config.enabled` gate from `GENERATION_STARTED` regen rewind; (3) removing the `config.enabled` gate from `MESSAGE_SWIPED` snapshot restore. `config.enabled` now strictly controls LLM context injection and the background updater, not versioning.
11. **`serializeWhiteboard` crash on missing optional fields** — `serializeWhiteboard` accessed `thread.triggerConditions.length`, `thread.dependencies.length`, `thread.downstreamConsequences.length`, `heart.keyKnowledge.length`, `heart.sensoryMemories.length`, and `heart.unresolved.length` without null guards. When the model called `update_whiteboard` and omitted these optional fields (not in the tool schema's `required`), the entries were stored with `undefined` values, and the serializer crashed on the next context injection or macro refresh. Fixed in two layers: (1) `applyDelta` now backfills default empty arrays/strings on all thread, heart, and chronicle `add` entries before pushing; (2) `serializeWhiteboard` uses optional chaining (`?.length`) as a defense-in-depth guard.
12. **Frontend drawer not updating live (only on extension refresh)** — All `sendToFrontend` calls from event handlers (`GENERATION_STARTED` rewind, `GENERATION_ENDED` snapshot, `MESSAGE_SWIPED` restore, `update_whiteboard` tool, `updater.ts` pending/commit notifications) were broadcasting without a `userId` argument. For operator-scoped extensions, Lumiverse's runtime routes `sendToFrontend` messages per-user — without `userId`, the message has no target and never reaches `ctx.onBackendMessage`. Only the frontend-initiated request/response flow worked (those handlers always had `userId` from `onFrontendMessage`). Fixed by adding `lastKnownUserId` module state, captured from `GENERATION_ENDED` and `onFrontendMessage`, and passing it to all `sendToFrontend` calls. Also threaded `userId` through `updater.ts` notification calls.
13. **Regen rewind no-op when target is the first message of the chat** — `getPreMessageState` walks backwards through snapshots looking for one belonging to a *different* message. For first-message regens, no such snapshot exists, so it returns null and the rewind no-ops — leaving any `update_whiteboard` mutations from the previous swipe baked into the new generation. The fundamental problem: snapshots stored only post-state, with no record of what the whiteboard looked like *before* the generation's deltas were applied. Fixed by introducing a tiered rewind strategy backed by an explicit `preState` field on snapshots: (1) added optional `preState: Whiteboard` to `WhiteboardSnapshot`; (2) added module-level `preGenerationState` captured at `GENERATION_STARTED` (post-rewind for regens, current state for new generations); (3) `createSnapshot` now accepts and persists `preState`; (4) `performRegenRewind` tries three tiers in order — exact preState from an existing snapshot of the target message, fall back to the latest other-message snapshot's state (legacy `getPreMessageState` path), and finally fall back to empty whiteboard if the only snapshots in the chat belong to the target message (first-message scenario). Tiers 1 and 3 are new; tier 2 is the original behavior preserved for compatibility.

14. **`serializeWhiteboard` crash on string-typed array fields** — Models (especially non-Opus tiers like Gemini 3 Flash) sometimes return bare strings instead of single-element arrays for fields like `unresolved`, `keyKnowledge`, `sensoryMemories`, `dependencies`, `triggerConditions`, `downstreamConsequences`, `charactersPresent`, and `verbatimDialogue`. The serializer called `.join()` on these, which doesn't exist on strings. Fixed in two layers: (1) `applyDelta` now normalizes string→array on write for all array-typed fields on chronicle, thread, and heart entries; (2) `serializeWhiteboard` wraps each field in `Array.isArray()` checks before calling `.join()`, coercing bare strings to single-element arrays as defense-in-depth.
15. **Snapshots capturing empty whiteboard state instead of post-updater state (snapshot speculation)** — The `GENERATION_ENDED` handler ran `processGenerationEnd` (which saves the updater's delta as a pending update) and then immediately created a snapshot by reading `getWhiteboard()`. But the pending update hadn't been committed yet (it auto-commits after a 30-second review window), so the snapshot captured the whiteboard BEFORE the delta — an empty whiteboard on first message. This meant swipe-back restore returned to an empty whiteboard instead of the correct post-updater state. Fixed by speculatively applying pending deltas from the current generation cycle to the snapshot's state: after `processGenerationEnd` returns, the snapshot creation reads pending updates for the current message, applies their deltas to the whiteboard copy, and stores that as the snapshot state.

16. **Fork seeding failing silently for operator-scoped extensions** — `CHAT_SWITCHED` handler called `spindle.chats.get(newChatId)` without passing `userId`. For operator-scoped extensions, `handleChatsGet` in `worker-host.ts` requires explicit `userId` (resolved via `resolveEffectiveUserId`). Without it, the call throws `"userId is required for operator-scoped extensions"` and the entire fork seeding block fails silently (caught by the outer try/catch). Fixed by: (1) capturing `userId` from the `CHAT_SWITCHED` catch-all overload — `(payload, userId)` — same pattern used by `GENERATION_ENDED`; (2) passing `userId ?? lastKnownUserId` to `spindle.chats.get()`; (3) also updating `lastKnownUserId` from the event. Note: `spindle.chat.getMessages()` (used inside `seedFromParent`) does NOT need explicit userId — its host handler derives it from `getChatOwnerId(chatId)`.
17. **No cleanup on message deletion** — Lumiverse emits `MESSAGE_DELETED` with `{ chatId, messageId }` when a message is deleted (all swipes go with it — they're inline JSON on the row). The extension had no handler for this event, meaning: (a) snapshots referencing deleted messages persisted and could cause broken swipe/regen restores; (b) the whiteboard retained chronicle entries, threads, hearts, and other state produced by the deleted message's generation; (c) pending updates sourced from deleted messages could still auto-commit; (d) archive entries for deleted messages persisted. Fixed by adding a `MESSAGE_DELETED` handler that performs full cleanup: (1) rewinds whiteboard to the deleted message's snapshot `preState` (tiered fallback: exact preState → latest other-message snapshot → unchanged); (2) removes all snapshots for the deleted messageId via `removeSnapshotsForMessage`; (3) rejects any pending updates with `sourceMessageId` matching the deleted message; (4) removes archive entries for the deleted messageId via new `removeArchivedMessage` function in `archive.ts`; (5) notifies frontend with the updated whiteboard and refreshes macros.

## Message deletion handling

The extension listens for `MESSAGE_DELETED` events. When a message is deleted:

1. **Whiteboard rewind** — Finds the deleted message's latest snapshot. If it has `preState`, rewinds the whiteboard to it (undoing everything that message's generation added). Falls back to `getPreMessageState` (latest other-message snapshot) if no `preState`. If no snapshot exists at all, whiteboard is left unchanged.
2. **Snapshot cleanup** — Removes all snapshots tagged with the deleted messageId. Prevents broken swipe/regen restores.
3. **Pending update rejection** — Rejects any pending updates whose `sourceMessageId` matches. Prevents auto-commit of stale deltas.
4. **Archive removal** — Removes the archived copy of the message via `removeArchivedMessage()` (new function in `archive.ts`).
5. **Frontend notification** — Sends updated whiteboard to the drawer, refreshes macros.

Note: `MESSAGE_DELETED` fires per-message (not batched). For bulk deletes, it fires once per message. The handler captures `userId` from the catch-all overload for `sendToFrontend` routing.

## Diagnostic logging

The `rerun_updater` handler and `updateWhiteboard` function in `updater.ts` include `[DIAG]`-tagged logging for investigating a suspected cross-chat message leak during fork + rerun scenarios. These log:

- Every message returned by `getMessages(chatId)` — id, role, content length, preview
- Whiteboard state summary before the updater prompt is built (chronicle/thread/heart counts, chronicle entry previews)
- `lastUser` and `lastAssistant` content previews
- Message range and recent context length
- Update prompt length and first/last 500 characters

Filter Spindle logs by `[DIAG]` to see this output. The logging is intentionally verbose and should be removed once the fork message leak is resolved.

## Important: tool invocation has no userId

`invokeExtensionTool` in `worker-host.ts` deliberately strips `userId`, `__userId`, and `__user_id` from the tool args for security. The `tool_invocation` message sent to the worker carries no userId field. The worker runtime calls `handler(payload)` with only ONE argument — there is no `(payload, userId)` catch-all for tool invocations like there is for events.

**Consequence:** Tool handlers cannot call APIs that require userId (like `spindle.chats.getActive()` on operator-scoped extensions). Use the context handler to capture state before tools execute.

## Debug: Re-run Updater

The Settings tab has a Debug section with two buttons for A/B testing different sidecar models against the same exchange:

- **Re-run (Reset to Pre)** — Rewinds whiteboard to its state before the last sidecar run (using the latest snapshot's `preState`), auto-rejects any pending updates, then re-fires `processGenerationEnd` against the chat's current latest exchange. Clean A/B test: swap the Updater Connection, hit this button, compare the pending update against the previous model's output.

- **Re-run (Keep Current)** — Re-fires the updater against the current whiteboard state without rewinding. Tests what a model would produce as a delta on top of existing entries (steady-state behavior testing).

Both buttons auto-reject existing pending updates for the chat before re-running to avoid stacking multiple pending updates. The result arrives as a normal pending update through the existing approval flow.

### Frontend message: `rerun_updater`
- `data.chatId: string` — which chat to re-run for
- `data.mode: 'reset_to_pre' | 'keep_current'` — whether to rewind first

### Backend responses:
- `rerun_pending_cleared` — old pending updates rejected, frontend clears its queue
- `rerun_started` — updater quiet gen is in progress
- `rerun_error` — something failed (no assistant message, gen failure, etc.)
- Normal `pending_update` arrives when the updater finishes

## Deduplication

`applyDelta` in `whiteboard.ts` deduplicates all append-only sections to prevent duplicate entries from Lumia + sidecar overlap:

| Section | Dedup strategy |
|---|---|
| **Chronicle** | By `id` — if a chronicle entry with the same id exists, merges into existing |
| **Threads** | By `id` OR by `name` (case-insensitive) — merges into existing |
| **Hearts** | By `id` OR by `from`→`to` pair (case-insensitive) — merges into existing |
| **Palette.fragileDetails** | Normalized substring containment — exact match or one contains the other |
| **Canon.completedEvents** | Normalized substring containment on the `event` string |
| **Canon.butterflyLog** | Normalized substring containment on the `change` string |
| **authorNotes** | Normalized substring containment |

This prevents the most common duplication pattern: Lumia pins a detail via `update_whiteboard` during her Memory Forge, then the sidecar updater produces an overlapping entry post-generation.

## Lumia/sidecar ownership split

The primary model (Lumia) and the sidecar updater (Hermes) have different responsibilities:

| Section | Sidecar | Lumia |
|---|---|---|
| **Chronicle** | ✅ Creates entries from prose | ❌ Does not add — can `update` to correct stale entries |
| **Threads** | ✅ Basic tracking | ✅ Status changes, new SEEDED threads, trigger/consequence updates |
| **Hearts** | ✅ Structurally correct | ✅ Adds emotional texture, sensory memories, relationship nuance |
| **Palette** | ❌ Doesn't touch | ✅ Voice notes, sensory signatures, fragile details |
| **Canon** | ✅ Basic timeline | ✅ Butterfly log, deviation analysis |
| **Author Notes** | ❌ Blocked in prompt | ✅ Exclusively Lumia's — must be in her voice/personality |

The sidecar prompt explicitly says "DO NOT GENERATE" for Author Notes. The sidecar is framed as "Lumia's memory keeper" — it writes with warmth and texture matching her sensibilities, not as a clinical analyst.

## Whiteboard injection placement

The interceptor injects the whiteboard **before the first user/assistant message** (i.e., before chat history starts), not at the end of the message array. This is critical for voice preservation — when the whiteboard sat at the bottom of context (closest to generation), its structured analytical format flattened the primary model's CoT voice. Moving it above chat history makes it background reference material rather than a final directive, preserving the model's personality in its thinking phase.

```
System prompts → CoT instructions → [WHITEBOARD HERE] → Chat history → User nudge → Generation
```

The interceptor runs at priority 30 (before most other interceptors).

## Git workflow — CRITICAL

**⚠️ ALWAYS PUSH AFTER EVERY COMMIT. NO EXCEPTIONS. ⚠️**

Lumiverse auto-updates installed extensions from GitHub on restart. If you have local commits that haven't been pushed, Lumiverse will silently pull from origin and **overwrite everything**. We lost a full day of progress to this once. Never again.

The workflow is:
1. Make changes
2. Build (`bun run build`)
3. `git add -A && git commit`
4. **`git push` immediately** — do not defer, do not "push later," do not close the terminal first

The remote is `origin` → `https://github.com/AmITato/novelist-memory`. Branch is `master`.

If you're an AI assistant working on this codebase: when LO asks you to commit, **always push too** unless he explicitly says not to. The default is push. Assume Lumiverse could restart at any moment.

## History tab (direct edit viewer)

The History tab shows every `update_whiteboard` tool call the primary model (Lumia) makes during generation. It lives between Whiteboard and Recall in the drawer tab bar.

### Data flow

1. Model calls `update_whiteboard` during generation
2. Backend tool handler (`backend.ts:323+`) creates a `DirectEditEntry` with the delta, a human-readable summary, and timestamp
3. Entry is persisted to `history/{chatId}.json` via `appendDirectEdit()`
4. Entry is sent to frontend in real-time via `sendToFrontend({ type: 'direct_edit', ... })`
5. When the History tab opens, frontend requests full history via `get_update_history` message

### DirectEditEntry type (in types.ts)

```ts
interface DirectEditEntry {
  id: string              // "de_{timestamp}_{random6}"
  chatId: string
  timestamp: string       // ISO 8601
  delta: WhiteboardDelta  // the exact delta Lumia sent
  summary: string         // human-readable summary (e.g. "+1 thread (Name) · +1 heart (A→B)")
  generationMessageId?: string  // which message was being generated when the tool fired
}
```

### Storage

| Directory | Contents |
|---|---|
| `history/` | `{chatId}.json` — per-chat direct edit history |

History entries are stored separately from snapshots and are **never pruned**. They're a permanent log of every direct edit Lumia has ever made in a chat.

### Frontend rendering

- Entries shown in reverse chronological order (newest first)
- Each entry shows: purple `TOOL CALL` badge, timestamp, section count, human-readable summary
- Expandable `Show raw delta` reveals the full JSON
- New entries arriving mid-generation get a green flash animation (`novelist-history-new` / `novelist-flash` keyframe)
- State resets on chat change (history reloaded from backend for the new chat)

### Backend message types

| Frontend → Backend | Backend → Frontend | Description |
|---|---|---|
| `get_update_history` | `update_history` | Load full history for a chat |
| — | `direct_edit` | Real-time notification of a new direct edit |

### Summary generation

`summarizeDelta()` in `backend.ts` produces human-readable summaries from a `WhiteboardDelta`:
- Chronicles: `+N chronicle` / `~N chronicle`
- Threads: `+N thread (Name1, Name2)` / `~N thread [id→STATUS]`
- Hearts: `+N heart (From→To)` / `~N heart`
- Palette: `palette (voice, sensory, N fragile, formatting)`
- Canon: `canon (timeline, +N events, +N butterfly)`
- Author Notes: `+N author note` / `-N author note`

Sections joined with ` · `. Falls back to `empty delta` if nothing changed.

## Not yet implemented

- **Compaction logic** — when Chronicle grows past `compactionThreshold`, compress older entries
- **Full audit** — every N messages, cross-check whiteboard against archive for drift
- ~~**Token counting**~~ — implemented via `src/tokens.ts`; uses `spindle.tokens.countText()` with char/4 fallback
- ~~**Connection picker UI**~~ — implemented: Settings tab lists available connections via `spindle.connections.list()` as `<select>` dropdowns
- **Calibration bank UI** — frontend interface for populating per-chat calibration examples (currently requires manual JSON editing)
- ~~**`removeSnapshotsForMessage` cleanup**~~ — now called by the `MESSAGE_DELETED` handler for full cleanup on message deletion.
