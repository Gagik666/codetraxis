# codetraxis

**A local DevTools alternative for any JavaScript project.**

Tired of jumping between DevTools tabs, losing console logs, and not seeing the full network flow?

`codetraxis` gives you a **file explorer**, **network inspector**, and **console timeline** — all in one browser UI, running completely on localhost.

```bash
npx codetraxis .
```

Open **http://localhost:3333** — that's it.

---

## 🚀 Features

* 📁 **Live file tree**: Browse your project in real time — respects `.gitignore`.
* 🧾 **Code viewer**: Monaco-based syntax-highlighted file viewer.
* 🌐 **Network inspector**: `fetch` / `axios` / `XHR` — method, URL, status, body, headers, duration.
* 🧠 **Console timeline**: `log` / `info` / `warn` / `error` — persistent, in order.
* ⚡ **Real-time updates**: File changes pushed via WebSocket — no refresh needed.
* 🔌 **Any project**: React, React Native, Next.js, Expo, Vite, CRA, plain Node.
* 🔒 **100% local**: Bound to `127.0.0.1` — no data ever leaves your machine.

---

## 📦 Quick start

```bash
# No install needed
npx codetraxis .

# Or globally
npm install -g codetraxis
codetraxis .

# Specific project
codetraxis ~/projects/my-app

# Custom port
PORT=4000 codetraxis .
```

---

## 🛠 How it works

1. **Start the server**: Run `codetraxis` in your terminal. It spins up a local UI on port 3333.
2. **Install the Agent**: Click **Install Agent** in the UI. A lightweight agent (`codetraxisAgent`) is safely injected into your project's entry file.
3. **Debug**: The agent intercepts `console.*`, `fetch`, and `XMLHttpRequest` and sends events via WebSocket directly to your codetraxis dashboard.

**Manual axios attachment** (for `axios.create()` instances):

```typescript
import { attachAxios } from "./codetraxisAgent";

attachAxios(myAxiosInstance);
```

---

## ⚙️ CLI Flags

| Flag | Description |
|---|---|
| `[path]` | Target project directory (default: current dir) |
| `--dev` | Dev mode — starts `ts-node-dev` + Vite dev server separately |
| `--help` | Show usage |
| `PORT=XXXX` | Override default port `3333` via env var |

---

## 🔒 Security

codetraxis runs fully locally.
* **Server bind**: `127.0.0.1` only. Not reachable from external networks.
* **File access**: Restricted to the target directory.
* **Telemetry**: Zero. No data is collected or sent anywhere.

---

## ❓ Common issues

* **White screen in browser?** Ensure you are running the latest version.
* **Port already in use?** codetraxis will automatically pick the next available port.
* **Permission denied?** Run `chmod +x bin/cli.js`.

---

*Built because `console.log` debugging gets old fast.*
