import chokidar from "chokidar";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { makeGitignoreWatcher } from "./gitignoreWatcher";

// ─── ANSI colors ─────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  // Futuristic neon colors
  neonCyan: '\x1b[96m',
  neonBlue: '\x1b[38;5;117m',
  neonPurple: '\x1b[38;5;141m',
  electricBlue: '\x1b[38;5;81m',
};

// ─── Типы событий ────────────────────────────────────────────────────────────

export type ProjectEvent =
  | { type: "tree_changed" }
  | { type: "file_changed"; path: string }
  | { type: "connected" };




// ─── Debounce + batch ────────────────────────────────────────────────────────

const DEBOUNCE_MS = 200;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTreeChanged = false;
const pendingFileChanges = new Set<string>();

// ─── WebSocket broadcast ─────────────────────────────────────────────────────

let wss: WebSocketServer | null = null;

const broadcast = (event: ProjectEvent) => {
  if (!wss) return;
  const message = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// ─── Flush batch после debounce ──────────────────────────────────────────────

const scheduleBatch = () => {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    if (pendingTreeChanged) {
      broadcast({ type: "tree_changed" });
      pendingTreeChanged = false;
    }

    pendingFileChanges.forEach((filePath) => {
      broadcast({ type: "file_changed", path: filePath });
    });
    pendingFileChanges.clear();

    debounceTimer = null;
  }, DEBOUNCE_MS);
};

// ─── Запуск watcher ──────────────────────────────────────────────────────────

export const startWatcher = (targetDir: string, httpServer: Server) => {
  // WebSocket сервер без привязки к серверу — routing через upgrade event
  wss = new WebSocketServer({ noServer: true });

  // Регистрируем upgrade-обработчик для пути /ws
  httpServer.on("upgrade", (req, socket, head) => {
    if ((req.url ?? "") === "/ws") {
      wss!.handleUpgrade(req, socket, head, (ws) => {
        wss!.emit("connection", ws, req);
      });
    }
  });

  wss.on("connection", (socket) => {
    // Сразу сообщаем клиенту что подключились
    socket.send(JSON.stringify({ type: "connected" } satisfies ProjectEvent));

    socket.on("close", () => {
      // Тихое отключение — не логируем
    });
  });

  const watcher = chokidar.watch(targetDir, {
    ignored: (filePath: string) => {
      // Всегда игнорируем Unix-сокеты и системные файлы — chokidar не умеет их watchить
      if (
        filePath.endsWith(".sock") ||
        filePath.endsWith(".socket") ||
        /com\.apple\.launchd\./i.test(filePath) ||
        filePath.includes("Visual Studio Code-")
      ) {
        return true;
      }
      return makeGitignoreWatcher(targetDir)(filePath);
    },
    ignoreInitial: true,
    persistent: true,
    ignorePermissionErrors: true,
    usePolling: false,
    depth: 10,
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 50,
    },
  });

  // Структурные изменения → tree_changed
  const onStructure = (filePath: string) => {
    const relative = path.relative(targetDir, filePath).replace(/\\/g, "/");
    const shortPath = relative.length > 50 ? '...' + relative.slice(-47) : relative;
    console.log(`  ${c.neonPurple}${c.bold}+${c.reset} ${c.dim}${shortPath}${c.reset}`);
    pendingTreeChanged = true;
    scheduleBatch();
  };

  // Изменение содержимого → file_changed + tree_changed (git-статусы обновились)
  const onChange = (filePath: string) => {
    const relative = path.relative(targetDir, filePath).replace(/\\/g, "/");
    const shortPath = relative.length > 50 ? '...' + relative.slice(-47) : relative;
    console.log(`  ${c.neonCyan}${c.bold}~${c.reset} ${c.dim}${shortPath}${c.reset}`);
    pendingFileChanges.add(relative);
    // git-статус файла мог измениться → нужно пересобрать дерево
    pendingTreeChanged = true;
    scheduleBatch();
  };

  watcher
    .on("add", onStructure)
    .on("addDir", onStructure)
    .on("unlink", onStructure)
    .on("unlinkDir", onStructure)
    .on("change", onChange)
    .on("error", (err: unknown) => {
      // UNKNOWN — это системные сокеты / .sock файлы — chokidar не умеет их watchить, тихо игнорируем
      const e = err as NodeJS.ErrnoException;
      if (e.code === "UNKNOWN" || e.code === "ENOENT") return;
      console.error(`  ${c.yellow}⚠${c.reset}  ${c.dim}Watcher error:${c.reset}`, err);
    })
    .on("ready", () => {
      // Убираем лог ready — уже выводим в index.ts
    });

  return watcher;
};
