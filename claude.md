# Novelist Memory

A Lumiverse Spindle extension implementing persistent memory architecture for long-form serialized AI fiction. Maintains narrative continuity across hundreds of messages by replacing raw conversation history with structured state (the Whiteboard) and intelligent scene retrieval (the Intern).

## Architecture

Three components:

1. **Whiteboard** — Structured persistent state injected into every generation. Six sections: Chronicle (what happened), Threads (active narrative arcs), Hearts (relationship dynamics), Palette (voice/style continuity), Canon (source material tracking), Author Notes (model-to-self coaching).

2. **Archive** — Full message history stored externally with rich metadata indexing (in-story timestamps, character tags, scene descriptors, emotional registers, thread tags). NOT loaded into primary context.

3. **Intern** — A retrieval tool the primary model can call via `recall_scene`. Uses a smaller/faster model to search the Archive by narrative intent, not keywords. Returns annotated scenes with full original text.

## Project structure

```
novelist-memory/
  spindle.json          # Extension manifest
  package.json          # Build scripts, devDependencies
  tsconfig.json         # TypeScript config
  src/
    backend.ts          # Main entry — hooks, tools, events, commands, frontend messaging
    frontend.ts         # Drawer tab UI — whiteboard viewer, recall interface, archive stats
    types.ts            # All TypeScript interfaces
    config.ts           # Extension configuration with storage persistence
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
| `chats` | Access active chat info |
| `tools` | Register `recall_scene` tool for primary model |

## Hook points

### Context Handler (priority 50)
Runs before prompt assembly. Reads the whiteboard for the active chat and attaches it to the generation context as `novelistMemory.whiteboard` and `novelistMemory.serialized`. Other extensions can read this.

### Interceptor (priority 30)
Runs after prompt assembly. Injects the serialized whiteboard as a system message immediately after the main system prompt. Creates a Prompt Breakdown entry ("Novelist Memory: Whiteboard") so the user can see it in the token breakdown.

### Tool: `recall_scene`
Registered as a council-eligible tool. The primary model calls it with a natural language query describing what scene it needs and why. The intern:
1. Searches the archive index by metadata
2. Uses quiet gen to identify the most relevant scenes by narrative intent
3. Fetches full scenes and annotates them
4. Returns formatted results with source info, annotations, and full text

### Events
- `GENERATION_ENDED` — triggers whiteboard update + archive check
- `CHAT_CHANGED` — refreshes macros for the new chat

## Data flow per generation cycle

```
1. Context Handler reads whiteboard → attaches to context
2. Interceptor injects serialized whiteboard into message array
3. Primary model generates (can tool-call recall_scene mid-generation)
4. GENERATION_ENDED fires → updater runs:
   a. Quiet gen analyzes new exchange → produces whiteboard delta
   b. Delta saved as pending update (auto-commits after review window)
   c. Messages past sliding window → archived with metadata extraction
5. Frontend notified of pending update → user can review/edit/reject
```

## Configuration (stored in `config.json`)

| Setting | Default | Description |
|---|---|---|
| `enabled` | `true` | Master toggle |
| `slidingWindowSize` | `6` | Number of recent exchanges kept in active context |
| `autoCommitUpdates` | `true` | Auto-commit whiteboard updates after review window |
| `updateReviewWindowMs` | `30000` | Review window before auto-commit (30s) |
| `whiteboardTokenBudget` | `12000` | Warn when whiteboard exceeds this token count |
| `internConnectionId` | (none) | Optional specific connection for intern model |
| `updaterConnectionId` | (none) | Optional specific connection for updater model |
| `compactionThreshold` | `100` | Chronicle entries before compaction triggers |
| `auditIntervalMessages` | `40` | Messages between full whiteboard audits |

## Style conventions

- **const over let**, early returns, no else blocks
- **No classes** — plain exported functions
- **Inline types** except shared interfaces in `types.ts`
- **Template literal logging** with `[Novelist Memory]` prefix via `spindle.log`
- **JSON storage** with `{ indent: 2 }` for human readability
- **Error handling**: try/catch at boundaries, fallbacks for LLM failures, `spindle.log.error()` for diagnostics
- **Async patterns**: `Promise.all()` for concurrent work, fire-and-forget with `.catch()` for non-blocking background tasks

## Frontend

Single drawer tab with four sub-tabs:
- **Whiteboard** — Read-only view of all six sections with edit button
- **Recall** — Manual intern query interface with results display
- **Archive** — Stats dashboard (message count, token count, character/register breakdowns)
- **Settings** — Configuration panel

Uses Lumiverse CSS variables for theming. No external dependencies. Vanilla DOM manipulation via Spindle DOM helper.

## Key design decisions

1. **Both context handler AND interceptor** — Context handler lets other extensions see the whiteboard data. Interceptor controls exact placement in the message array.
2. **Auto-commit with review window** — Updates commit after 30s unless the user intervenes. Balances flow with safety.
3. **Pending updates as separate storage** — Don't mutate the whiteboard until committed. Frontend shows pending state with commit/reject/edit actions.
4. **Separate archive index** — Lightweight metadata file for fast intern scanning without loading full message content.
5. **Narrative-aware retrieval** — Intern uses LLM comprehension (not keyword search) to find scenes by emotional/thematic relevance.
6. **Scene-based chronicle, not message-count-based** — Update prompt instructs the model to add entries based on narrative density, not rigid counting.
