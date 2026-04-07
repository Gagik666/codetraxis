import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";

/**
 * Два типа подключений:
 *  "agent"  — target-проект слёт события  (path: /agent)
 *  "viewer" — codetraxis client слушает  (path: /debug)
 */

const viewerClients = new Set<WebSocket>();

export function setupDebugHub(httpServer: Server) {

  // ── WebSocket для агента (/agent) ─────────────────────────────────────────
  const agentWss = new WebSocketServer({ noServer: true });

  agentWss.on("connection", (socket) => {
    socket.on("message", (raw) => {
      const data = raw.toString();

      // Ретранслируем всем viewer-клиентам
      for (const viewer of viewerClients) {
        if (viewer.readyState === WebSocket.OPEN) {
          viewer.send(data);
        }
      }
    });

    socket.on("close", () => { /* agent disconnected */ });
  });

  // ── WebSocket для viewer (/debug) ─────────────────────────────────────────
  const viewerWss = new WebSocketServer({ noServer: true });

  viewerWss.on("connection", (socket) => {
    viewerClients.add(socket);

    socket.on("close", () => {
      viewerClients.delete(socket);
    });
  });

  // ── HTTP upgrade routing ──────────────────────────────────────────────────
  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = req.url ?? "";

    if (url === "/agent") {
      agentWss.handleUpgrade(req, socket, head, (ws) => {
        agentWss.emit("connection", ws, req);
      });
    } else if (url === "/debug") {
      viewerWss.handleUpgrade(req, socket, head, (ws) => {
        viewerWss.emit("connection", ws, req);
      });
    }
    // Все остальные пути (/ws и т.д.) — не трогаем,
    // watcherService зарегистрирован с { path: "/ws" } и обработает сам.
  });
}
