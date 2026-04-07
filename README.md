# codetraxis

A developer tool that runs alongside any project and gives you a **live file tree**, **code viewer**, and a **debug panel** — all in the browser on a single port.

---

## How it works

```
Your project (Expo / React Native / Next.js / etc.)
        │  imports codetraxisAgent  (auto-injected)
        │  sends events over WebSocket
        ▼
  codetraxis server  (Express + WS, port 3333)
        │  serves client/dist as static files
        │  exposes REST API + WebSocket endpoints
        ▼
     Browser  →  http://localhost:3333
        │  shows file tree, code viewer, debug timeline
```

---

## Quick start

```bash
# From the root of the project you want to inspect:
npx codetraxis .

# Or if installed globally:
codetraxis .
```

Opens **`http://localhost:3333`** automatically — API and UI on a single port.

---

## CLI flags

| Flag | Description |
|---|---|
| `[path]` | Target project directory (default: current dir) |
| `--dev` | Dev mode — starts `ts-node-dev` + Vite dev server separately |
| `PORT=XXXX` | Override default port 3333 via env var |

If port `3333` is busy, codetraxis automatically finds the next available port.

If `server/dist` is missing, codetraxis runs `npm run build` automatically before starting.

---

## Features

| Feature | Description |
|---|---|
| **File tree** | Live file tree of the target project, respects `.gitignore` |
| **Code viewer** | Monaco-based syntax-highlighted file viewer |
| **Debug panel** | Timeline of network (fetch / XHR / axios) and console events |
| **TS Types** | Generate TypeScript interfaces from any JSON response |
| **Agent install** | One-click agent injection into the target project entry file |
| **Single port** | UI + API served together from `:3333` in production |
| **WebSocket** | Real-time file-change notifications via chokidar |

---

## Build & publish

```bash
# Build everything (server TypeScript → JS + Vite client → static)
npm run build

# Test locally as a real CLI user would
npm link
codetraxis /path/to/some-project

# Check what will be published to npm
npm pack --dry-run

# Publish
npm publish
```

### What gets published (`files` in package.json)

```
bin/          ← CLI entry point
server/dist/  ← Compiled server JS
client/dist/  ← Built React app (static)
```

Source files (`src/`, `tsconfig`, `.env`, `node_modules`) are **never** included.

---

## Project structure

```
bin/
  cli.js              ← CLI entry: prod → node server/dist/index.js
                                   dev  → ts-node-dev + vite (--dev flag)

server/               ← Express + WebSocket server (port 3333)
  src/
    index.ts          ← HTTP server, mounts routes, serves client/dist, starts watcher
    routes/
      tree.route.ts   ← GET /api/tree — returns file tree JSON
      file.route.ts   ← GET /api/file — returns file content
      agent.route.ts  ← POST/DELETE /api/agent — install / uninstall agent
    utils/
      agent/
        agentInstaller.ts   ← Generates & injects codetraxisAgent into target project
        debugHub.ts         ← WebSocket hub: /agent (target) ↔ /debug (viewer)
      watcher/
        watcherService.ts   ← chokidar watcher → broadcasts tree_changed / file_changed
        gitignoreWatcher.ts ← Reloads .gitignore rules on change
      file/
        buildTree.ts        ← Builds file tree JSON, respects .gitignore
        gitignoreLoader.ts  ← Parses .gitignore patterns
      git/
        getGitStatus.ts     ← Returns git status for tree decorations
  dist/                 ← Compiled output (after npm run build:server)

client/               ← React + Vite SPA
  src/
    pages/home/
      Home.tsx              ← Root layout: LeftMenu + LeftContentTree + FileViewer + DebugPanel
    components/home/
      leftMenu/             ← Icon sidebar (File tree / Debug)
      leftContentTree/      ← File tree panel
      treeItem/             ← Single tree node (file / folder)
      fileViewer/           ← File content area (Monaco + preview)
      debugPanel/
        DebugPanel.tsx      ← Timeline (network, console events)
        components/
          TypesPanel/       ← Generate TS interfaces from JSON
          NetworkExpanded/  ← Expanded network event view
          ConsoleExpanded/  ← Expanded console event view
      topMenu/              ← Top bar with project path + agent controls
      addAgentModal/        ← Agent install modal
      removeAgentModal/     ← Agent uninstall modal
    redux/
      treeSlice/            ← File tree state
      fileSlice/            ← Open file state
      debugSlice/
        DebugSlice.ts       ← Debug events (max 500, upsert by id)
        types.ts            ← ConsoleEvent / NetworkEvent
    hooks/
      useDebugSocket.ts     ← ws://host:3333/debug → dispatches events to Redux
      useProjectWatcher.ts  ← ws://host:3333/ws → reloads tree on change
    axios/
      agent/agentApi.ts     ← installAgent / removeAgent / getAgentStatus
      tree/treeService.ts   ← fetchTree / fetchFile
  dist/                 ← Built static files (after npm run build:client)
```

---

## Debug Agent (`codetraxisAgent`)

Auto-generated and injected into the target project on "Add Agent" click.

| File | What it does |
|---|---|
| `shared.ts` | `createTreeViewerBridge()` — WS connection to `:3333/agent`, send queue, safe serializer |
| `interceptors/consoleInterceptor.ts` | Patches `console.log / warn / error / info` |
| `interceptors/fetchInterceptor.ts` | Patches `globalThis.fetch` |
| `interceptors/xhrInterceptor.ts` | Patches `XMLHttpRequest` (React Native / axios) |
| `index.ts` | Wires everything, exports `attachAxios(instance)` |

### Manual axios attachment (optional)

```ts
import { attachAxios } from "./codetraxisAgent";

// for axios.create() instances:
attachAxios(myAxiosInstance);
```

---

## Debug event types

```
ConsoleEvent   { type: "console", level: "log"|"info"|"warn"|"error", args[] }
NetworkEvent   { type: "network", transport: "fetch"|"xhr"|"axios",
                 method, url, status, requestBody, responseBody, headers,
                 duration, state: "pending"|"success"|"error" }
```

---

## WebSocket endpoints (server :3333)

| Path | Purpose |
|---|---|
| `/agent` | Target project agent sends events here |
| `/debug` | Browser viewer receives relayed events |
| `/ws` | File watcher — sends `tree_changed` / `file_changed` |

---

## Common errors

| Error | Fix |
|---|---|
| `Cannot find module server/dist/index.js` | Run `npm run build` first |
| White screen in browser | Run `npm run build:client` — `client/dist` is missing |
| `Permission denied` on CLI | Run `chmod +x bin/cli.js` |
