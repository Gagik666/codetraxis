# codetraxis

**A local DevTools alternative for any JavaScript project.**

Tired of jumping between DevTools tabs, losing console logs, and not seeing the full network flow?

`codetraxis` gives you a **file explorer**, **network inspector**, and **console timeline** — all in one browser UI, running completely on localhost.

```bash
npx codetraxis .
```

Open **http://localhost:3333** — that's it.

---

## Why codetraxis?

| Problem | codetraxis |
|---|---|
| Switching between DevTools tabs | Everything in one UI |
| Console logs disappearing on refresh | Persistent timeline |
| Can't track full request lifecycle | Request + response + headers + duration |
| No file tree in DevTools | Built-in live project explorer |
| Hard to debug React Native / Expo | Works over WebSocket — no browser required |

---

## Features

| | Feature | Description |
|---|---|---|
| 📁 | **Live file tree** | Browse your project in real time — respects `.gitignore` |
| 🧾 | **Code viewer** | Monaco-based syntax-highlighted file viewer |
| 🌐 | **Network inspector** | `fetch` / `axios` / `XHR` — method, URL, status, body, headers, duration |
| 🧠 | **Console timeline** | `log` / `info` / `warn` / `error` — persistent, in order |
| ⚡ | **Real-time updates** | File changes pushed via WebSocket — no refresh needed |
| 🔌 | **Any project** | React, React Native, Next.js, Expo, Vite, CRA, plain Node |
| 🔒 | **100% local** | Bound to `127.0.0.1` — no data ever leaves your machine |

---

## Quick start

```bash
# No install needed
npx codetraxis .

# Or globally
npm install -g codetraxis
codetraxis .

# Point at a specific project
codetraxis ~/projects/my-app

# Custom port
PORT=4000 codetraxis .
```

Opens **`http://localhost:3333`** automatically.

---

## How it works

```
Your App  (React / React Native / Next.js / Expo / etc.)
     │
     │  codetraxisAgent  ← auto-injected into your entry file
     │  intercepts: console.* · fetch · axios · XMLHttpRequest
     │  sends events over WebSocket
     ▼
codetraxis server  (Express + WS, 127.0.0.1:3333)
     │  serves the browser UI as static files
     │  exposes REST API + WebSocket endpoints
     │  watches your project for file changes
     ▼
Browser  →  http://localhost:3333
     file tree · code viewer · network inspector · console timeline
```

---

## CLI flags

| Flag | Description |
|---|---|
| `[path]` | Target project directory (default: current dir) |
| `--dev` | Dev mode — starts `ts-node-dev` + Vite dev server separately |
| `--help` | Show usage |
| `PORT=XXXX` | Override default port `3333` via env var |

If port `3333` is busy, codetraxis automatically finds the next available port.

If `server/dist` is missing, codetraxis runs `npm run build` automatically before starting.

---

## Debug Agent

Click **Install Agent** in the UI — codetraxis automatically injects a lightweight agent into your project's entry file.

The agent intercepts:
- `console.log / info / warn / error`
- `fetch` (web & React Native)
- `XMLHttpRequest` (axios / RN networking)

All events are sent over WebSocket and shown in real time.

**Manual axios attachment** (for `axios.create()` instances):

```ts
import { attachAxios } from "./codetraxisAgent";

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

## WebSocket endpoints

| Path | Purpose |
|---|---|
| `/agent` | Target app agent sends events here |
| `/debug` | Browser viewer receives relayed events |
| `/ws` | File watcher — `tree_changed` / `file_changed` |

---

## Security

codetraxis runs **fully locally** — no data ever leaves your machine.

| What | Detail |
|---|---|
| Server bind | `127.0.0.1` only — not reachable from other machines |
| CORS | Localhost origins only — external origins are blocked |
| File access | Only within the directory you pass as argument |
| On install | Nothing runs — no `postinstall` script |
| Telemetry | None. Zero. |

---

## Common issues

| Issue | Fix |
|---|---|
| White screen in browser | Run `npm run build` — `client/dist` is missing |
| `Cannot find module server/dist/index.js` | Run `npm run build` first |
| Port already in use | codetraxis auto-picks the next free port |
| Permission denied on CLI | `chmod +x bin/cli.js` |

---

## Build & develop

```bash
# Build everything (server TS → JS + Vite → static)
npm run build

# Test locally as a real user would
npm link
codetraxis /path/to/some-project

# Check what gets published
npm pack --dry-run

# Publish
npm publish
```

### What gets published

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
  cli.js              ← CLI entry point

server/src/
  index.ts            ← HTTP server, routes, serves client/dist, starts watcher
  routes/
    tree.route.ts     ← GET /api/tree
    file.route.ts     ← GET /api/file
    agent.route.ts    ← POST/DELETE /api/agent
  utils/
    agent/
      agentInstaller.ts   ← Detects project type, injects codetraxisAgent
      debugHub.ts         ← WS relay: /agent (target) ↔ /debug (viewer)
    watcher/
      watcherService.ts   ← chokidar → broadcasts tree_changed / file_changed
      gitignoreWatcher.ts ← Reloads .gitignore rules on change
    file/
      buildTree.ts        ← File tree JSON, respects .gitignore
      gitignoreLoader.ts  ← Parses .gitignore patterns
    git/
      getGitStatus.ts     ← Git status decorations

client/src/
  pages/home/Home.tsx         ← Root layout
  components/home/
    leftMenu/                 ← Icon sidebar
    leftContentTree/          ← File tree panel
    fileViewer/               ← Monaco code viewer + preview
    debugPanel/               ← Network & console timeline
      components/
        TypesPanel/           ← Generate TS interfaces from JSON responses
        NetworkExpanded/      ← Expanded network event view
        ConsoleExpanded/      ← Expanded console event view
    topMenu/                  ← Project path + agent controls
    addAgentModal/            ← Agent install modal
    removeAgentModal/         ← Agent uninstall modal
  redux/
    treeSlice/                ← File tree state
    fileSlice/                ← Open file state
    debugSlice/               ← Debug events (max 500, upsert by id)
  hooks/
    useDebugSocket.ts         ← ws://host/debug → Redux
    useProjectWatcher.ts      ← ws://host/ws → reload tree
```

---

*Built because `console.log` debugging gets old fast.*
