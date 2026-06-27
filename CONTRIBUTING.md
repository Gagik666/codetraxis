# Contributing to codetraxis

Thank you for your interest in contributing to `codetraxis`! This document guides you through setting up your development environment, understanding the project architecture, and releasing new versions.

## Build & develop

Set up a local workspace for developing `codetraxis`:

```bash
# Install dependencies
npm install

# Build everything (server TS → JS + Vite → static client files)
npm run build

# Link the package globally to test in external projects
npm link

# Run codetraxis in any local project folder to test it
codetraxis /path/to/some-project
```

For rapid feedback during development, you can run the client and server watch mode separately:
```bash
# Start Vite client dev server and ts-node-dev server concurrently
npm run dev
```

---

## Project Structure

```
myApp/
├── bin/
│   └── cli.js              ← CLI entry point (checks/builds server and runs it)
├── codetraxisAgent/         ← Modular agent source code (written to target project)
│   ├── interceptors/
│   │   ├── consoleInterceptor.ts
│   │   ├── fetchInterceptor.ts
│   │   └── xhrInterceptor.ts
│   ├── index.ts
│   └── shared.ts
├── server/
│   ├── src/
│   │   ├── index.ts        ← Express server, API router, serves client/dist, starts watcher
│   │   ├── routes/
│   │   │   ├── agent.route.ts
│   │   │   ├── file.route.ts
│   │   │   └── tree.route.ts
│   │   └── utils/
│   │       ├── agent/
│   │       │   ├── agentInstaller.ts  ← Scans and injects/removes the agent
│   │       │   └── debugHub.ts        ← WebSocket relay hub
│   │       ├── file/
│   │       │   ├── buildTree.ts
│   │       │   └── gitignoreLoader.ts
│   │       ├── git/
│   │       │   └── getGitStatus.ts
│   │       └── watcher/
│   │           ├── gitignoreWatcher.ts
│   │           └── watcherService.ts
│   ├── package.json
│   └── tsconfig.json
└── client/
    ├── src/
    │   ├── App.tsx
    │   ├── main.tsx
    │   ├── components/home/
    │   │   ├── addAgentModal/
    │   │   ├── removeAgentModal/
    │   │   ├── leftMenu/
    │   │   ├── topMenu/
    │   │   ├── leftContentTree/
    │   │   ├── treeItem/
    │   │   ├── fileViewer/
    │   │   └── debugPanel/
    │   ├── hooks/
    │   └── redux/
    ├── package.json
    └── vite.config.ts
```

---

## WebSocket Endpoints

| Path | Purpose |
|---|---|
| `/agent` | Target app agent connects and sends event stream here |
| `/debug` | Browser viewer UI receives relayed events |
| `/ws` | Project file watcher — notifies `tree_changed` / `file_changed` |

---

## Debug Event Types

All communication between the agent and dashboard utilizes JSON events structured as follows:

```typescript
type ConsoleEvent = {
  id: string;
  type: "console";
  level: "log" | "info" | "warn" | "error";
  args: any[];
  timestamp: number;
};

type NetworkEvent = {
  id: string;
  type: "network";
  transport: "fetch" | "xhr" | "axios" | "websocket";
  method: string;
  url: string;
  status?: number;
  requestHeaders?: Record<string, string>;
  requestBody?: any;
  responseHeaders?: Record<string, string>;
  responseBody?: any;
  state: "pending" | "success" | "error";
  duration?: number;
  timestamp: number;
  error?: any;
};
```

---

## What gets published (NPM Package Content)

Only the necessary distribution files are packaged during release:

```
bin/          ← CLI entry point script
server/dist/  ← Compiled server JS
client/dist/  ← Built React app static files
codetraxisAgent/ ← Template agent files
```

Check what will be included in the release bundle before publishing:
```bash
npm pack --dry-run
```
