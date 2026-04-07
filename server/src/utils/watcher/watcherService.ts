import chokidar from "chokidar";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { makeGitignoreWatcher } from "./gitignoreWatcher";

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
    console.log("🔌 WebSocket client connected");
    // Сразу сообщаем клиенту что подключились
    socket.send(JSON.stringify({ type: "connected" } satisfies ProjectEvent));

    socket.on("close", () => {
      console.log("🔌 WebSocket client disconnected");
    });
  });

  const watcher = chokidar.watch(targetDir, {
    ignored: makeGitignoreWatcher(targetDir), // теперь watcher учитывает .gitignore и ALWAYS_IGNORE
    ignoreInitial: true,
    persistent: true,
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
    console.log(`📁 Structure change: ${relative}`);
    pendingTreeChanged = true;
    scheduleBatch();
  };

  // Изменение содержимого → file_changed + tree_changed (git-статусы обновились)
  const onChange = (filePath: string) => {
    const relative = path.relative(targetDir, filePath).replace(/\\/g, "/");
    console.log(`📝 File changed: ${relative}`);
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
    .on("error", (err) => console.error("❌ Watcher error:", err))
    .on("ready", () =>
      console.log(`👀 Watching: ${targetDir}`)
    );

  return watcher;
};
