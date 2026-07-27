# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**codetraxis** is a local DevTools alternative for JavaScript projects. It provides a browser-based UI (http://localhost:3333) with:
- Live file explorer (respects `.gitignore`)
- Network inspector (fetch/XHR/axios)
- Console timeline (log/info/warn/error)
- Real-time file watching via WebSocket

The tool runs fully locally (`127.0.0.1` bound) and injects a lightweight agent (`codetraxisAgent/`) into target projects to intercept console and network calls.

## Architecture

**Monorepo structure:**
- `bin/cli.js` — CLI entry point, starts the server
- `server/` — Express backend (TypeScript → `server/dist/`)
  - Serves the React UI from `client/dist/`
  - API routes: `/api/tree`, `/api/file`, `/api/agent`
  - WebSocket endpoints: `/agent` (target app), `/debug` (viewer UI), `/ws` (file watcher)
  - `utils/agent/agentInstaller.ts` — scans project, injects/removes agent
  - `utils/agent/debugHub.ts` — WebSocket relay hub (agent → viewer)
  - `utils/watcher/watcherService.ts` — chokidar-based file watcher
- `client/` — React + Vite frontend (TypeScript → `client/dist/`)
  - Redux state: `treeSlice` (file tree), `fileSlice` (open file), `debugSlice` (events)
  - Monaco editor for file viewing
  - `debugPanel/` — timeline UI for console/network events (max 500, upsert by ID)
- `codetraxisAgent/` — Template agent files copied into target projects
  - `shared.ts` — WebSocket bridge to server
  - `interceptors/` — patches `console`, `fetch`, `XMLHttpRequest`

**Key WebSocket flow:**
1. Target app agent → `ws://localhost:3333/agent` (sends events)
2. Server `debugHub.ts` relays → `ws://localhost:3333/debug` (viewer UI receives)
3. File watcher → `ws://localhost:3333/ws` (notifies tree/file changes)

**Event types:**
- `ConsoleEvent`: `{type: "console", level: "log"|"info"|"warn"|"error", args, timestamp}`
- `NetworkEvent`: `{type: "network", transport: "fetch"|"xhr"|"axios", method, url, status, state: "pending"|"success"|"error", duration, timestamp}`

## Common Commands

**Development:**
```bash
npm install                    # Install all dependencies
npm run dev                    # Start dev mode (client Vite + server ts-node-dev)
npm run build                  # Build everything (server + client)
npm run build:server           # Compile server TS → server/dist/
npm run build:client           # Build client → client/dist/
```

**Testing the CLI locally:**
```bash
npm link                       # Link package globally
codetraxis /path/to/project    # Test in any project
```

**Server-only (within `server/` dir):**
```bash
npm run dev                    # ts-node-dev with hot reload
npm run build                  # tsc → dist/
npm run lint                   # ESLint
```

**Client-only (within `client/` dir):**
```bash
npm run dev                    # Vite dev server (port 5173, proxies API to :3333)
npm run build                  # tsc + vite build → dist/
npm run lint                   # ESLint
```

**Publishing:**
```bash
npm pack --dry-run             # Verify what gets packaged
npm publish                    # Publish to npm (includes: bin/, server/dist/, client/dist/, codetraxisAgent/)
```

## Development Notes

- **Entry point in dev mode:** `bin/cli.js --dev` runs `ts-node-dev` for server and `vite` for client concurrently.
- **Entry point in prod:** `bin/cli.js` runs `node server/dist/index.js` (expects `server/dist/` and `client/dist/` to exist).
- **Agent installation:** Server scans target project for entry files (e.g., `src/index.tsx`, `App.tsx`, `main.tsx`), copies `codetraxisAgent/` template, injects `import "./codetraxisAgent"` at the top.
- **File tree respects `.gitignore`:** `utils/file/gitignoreLoader.ts` parses patterns, `utils/file/buildTree.ts` builds the tree.
- **Monaco editor:** Used read-only for syntax-highlighted file viewing in the UI.
- **Debug events limit:** `debugSlice` stores max 500 events (oldest dropped).

## Testing Changes

After making changes to server or client:
1. Run `npm run build` from root
2. Test with `npm link && codetraxis /path/to/test-project`
3. Open browser to `http://localhost:3333`
4. Install agent via UI, verify console/network interception works

## Port Configuration

Default port: `3333`. Override with `PORT=<num> codetraxis .`

Server automatically picks next available port if default is taken (uses `get-port` package).
