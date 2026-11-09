# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**codetraxis** is a local DevTools alternative for JavaScript projects. It provides a browser-based UI (http://localhost:3333) with:
- Live file explorer (respects `.gitignore`)
- Network inspector (fetch/XHR/axios)
- Console timeline (log/info/warn/error)
- Real-time file watching via WebSocket
- Monaco editor for syntax-highlighted file viewing
- TypeScript interface generator from network payloads

The tool runs fully locally (`127.0.0.1` bound) and injects a lightweight agent (`codetraxisAgent/`) into target projects to intercept console and network calls.

## Architecture

**Monorepo structure:**
- `bin/cli.js` — CLI entry point, starts the server
- `server/` — Express backend (TypeScript → `server/dist/`)
  - Serves the React UI from `client/dist/`
  - API routes: `/api/tree`, `/api/file`, `/api/agent`
  - WebSocket endpoints: `/agent` (target app), `/debug` (viewer UI), `/ws` (file watcher)
  - `utils/agent/agentInstaller.ts` — scans project, injects/removes agent using `@babel/parser`
  - `utils/agent/debugHub.ts` — WebSocket relay hub (agent → viewer)
  - `utils/watcher/watcherService.ts` — chokidar-based file watcher (also wires `gitignoreWatcher.ts` to re-filter the tree when `.gitignore` changes)
  - `utils/file/buildTree.ts` — builds the tree and annotates each node with a `gitStatus` from `utils/git/getGitStatus.ts` (folders aggregate their children's status), so the UI shows Git status indicators
- `client/` — React 19 + Vite frontend (TypeScript → `client/dist/`)
  - Redux state: `treeSlice` (file tree), `fileSlice` (open file), `debugSlice` (events)
  - Monaco editor for file viewing (read-only)
  - `debugPanel/` — timeline UI for console/network events (max 500, upsert by ID) with client-side filter + search (`debugPanel/utils/filters.ts`) and TypeScript interface generation from payloads (`debugPanel/utils/generateTypes.ts`)
- `codetraxisAgent/` — Template agent source copied into target projects
  - `index.ts` — entry; wires up all interceptors. Placeholders `__PORT__`, `__PROJECT_ID__`, `__XHR_LINE__` are substituted at install time by `agentInstaller.ts`.
  - `shared.ts` — WebSocket bridge to server (`createTreeViewerBridge`; exposes `uid()`, `send()`, `safeSerialize()`, `truncate()`)
  - `interceptors/` — patches `console`, `fetch`, `XMLHttpRequest`, and native `WebSocket` (`websocketInterceptor.ts`)
  - Auto-attaches to the default `axios` instance and auto-patches `socket.io-client` (incl. React Native / Metro module cache). For `axios.create()` instances or manually-created sockets, import and call the exported `attachAxios(instance)` / `attachSocketIO(socket)` helpers.
  - Compiled to `codetraxisAgent-dist/` for npm distribution
- `codetraxisAgent-dist/` — Compiled agent template bundled with the npm package

**Key WebSocket flow:**
1. Target app agent → `ws://localhost:3333/agent` (sends events)
2. Server `debugHub.ts` relays → `ws://localhost:3333/debug` (viewer UI receives)
3. File watcher → `ws://localhost:3333/ws` (notifies tree/file changes)

**Event types:**
- `ConsoleEvent`: `{id, type: "console", level: "log"|"info"|"warn"|"error", args, timestamp}`
- `NetworkEvent`: `{id, type: "network", transport: "fetch"|"xhr"|"axios"|"websocket", method, url, status, state: "pending"|"success"|"error", duration, timestamp, requestHeaders?, requestBody?, responseHeaders?, responseBody?, error?}`

## Common Commands

**Development:**
```bash
npm install                    # Install all dependencies (root + server + client)
npm run dev                    # Start dev mode (runs client Vite + server ts-node-dev concurrently)
npm run build                  # Build everything (agent + server + client, in order)
npm run build:agent            # Compile codetraxisAgent/ → codetraxisAgent-dist/
npm run build:server           # Compile server TS → server/dist/
npm run build:client           # Build client → client/dist/
npm start                      # Start compiled server (serves client/dist from server/dist/)
npm run codetraxis             # Test CLI in current dir (shortcut for node bin/cli.js .)
```

**Testing the CLI locally:**
```bash
npm link                       # Link package globally for testing
codetraxis /path/to/project    # Test in any project
codetraxis . --dev             # Run in dev mode (ts-node-dev + Vite)
```

**Server-only (within `server/` dir):**
```bash
npm run dev                    # ts-node-dev with hot reload (watches src/)
npm run build                  # tsc → dist/
npm run lint                   # ESLint on src/
```

**Client-only (within `client/` dir):**
```bash
npm run dev                    # Vite dev server (port 5173, proxies /api to :3333)
npm run build                  # tsc + vite build → dist/
npm run lint                   # ESLint
npm run preview                # Preview production build locally
```

**Publishing:**
```bash
npm pack --dry-run             # Verify what gets packaged
npm publish                    # Publish to npm (includes: bin/, server/dist/, client/dist/, codetraxisAgent-dist/)
```

## Development Notes

- **Entry point in dev mode:** `bin/cli.js --dev` runs `ts-node-dev` for server and `vite` for client concurrently.
- **Entry point in prod:** `bin/cli.js` runs `node server/dist/index.js` (expects `server/dist/` and `client/dist/` to exist).
- **Agent installation:** Server scans target project for entry files (e.g., `src/index.tsx`, `App.tsx`, `main.tsx`), copies `codetraxisAgent-dist/` template, injects `import "./codetraxisAgent"` at the top using `@babel/parser` for safe AST-based injection.
- **File tree respects `.gitignore`:** `utils/file/gitignoreLoader.ts` parses patterns, `utils/file/buildTree.ts` builds the tree.
- **Monaco editor:** Used read-only for syntax-highlighted file viewing in the UI.
- **Debug events limit:** `debugSlice` stores max 500 events (oldest dropped), upserts by ID to prevent unbounded memory growth.
- **Port resilience:** Uses `get-port` to fallback to next available port if `3333` is occupied.
- **Local security:** Bound to `127.0.0.1` only — no external network exposure.

## Key Implementation Details

- **Safe Code Modification**: `agentInstaller.ts` uses `@babel/parser` to locate the top of the entry file and inject `import "./codetraxisAgent"`, ensuring clean injection and idempotent removal.
- **Event Types Synchronization**: Changes to event types in `codetraxisAgent/` must be mirrored in `client/src/components/home/debugPanel/utils/types.ts` and `client/src/redux/debugSlice/`.
- **Zero-dependency Agent**: Keep the agent injection footprint zero-dependency and compatible with diverse JavaScript/TypeScript bundlers (Vite, Webpack, Metro, etc.).
- **Git & Ignore Filtering**: The file tree strictly honors `.gitignore` via the `ignore` package and live updates if `.gitignore` changes.

## Testing Changes

There is **no automated test framework** in this repo — no `npm test`, no unit/integration runner. Verification is manual (build + run the CLI against a target project). ESLint is the only automated check, and it lives per-package (`npm run lint` inside `server/` or `client/`), not at the root.

After making changes to server or client:
1. Run `npm run build` from root
2. Test with `npm link && codetraxis /path/to/test-project`
3. Open browser to `http://localhost:3333`
4. Install agent via UI, verify console/network interception works

## Port Configuration

Default port: `3333`. Override with `PORT=<num> codetraxis .`

Server automatically picks next available port if default is taken (uses `get-port` package).

## Files Included in NPM Package

```
✅ bin/
✅ server/dist/
✅ client/dist/
✅ codetraxisAgent-dist/

❌ server/src/
❌ client/src/
❌ codetraxisAgent/ (source)
```
