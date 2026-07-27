import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import { parse as parseUrl } from "node:url";

/**
 * Два типа подключений:
 *  "agent"  — target-проект шлёт события  (path: /agent?projectId=xyz)
 *  "viewer" — codetraxis client слушает  (path: /debug?projectId=xyz)
 *
 * Events are routed only to viewers with matching projectId.
 */

interface SocketWithProjectId extends WebSocket {
  projectId?: string;
}

const viewersByProject = new Map<string, Set<SocketWithProjectId>>();
const agentsByProject = new Map<string, Set<SocketWithProjectId>>();

export function setupDebugHub(httpServer: Server) {

  // ── WebSocket для агента (/agent) ─────────────────────────────────────────
  const agentWss = new WebSocketServer({ noServer: true });

  agentWss.on("connection", (socket: SocketWithProjectId, req: IncomingMessage) => {
    const parsed = parseUrl(req.url ?? "", true);
    const projectId = parsed.query.projectId as string | undefined;

    if (!projectId) {
      socket.close(1008, "Missing projectId query param");
      return;
    }

    socket.projectId = projectId;

    if (!agentsByProject.has(projectId)) {
      agentsByProject.set(projectId, new Set());
    }
    agentsByProject.get(projectId)!.add(socket);

    socket.on("message", (raw) => {
      const data = raw.toString();
      const viewers = viewersByProject.get(projectId);

      if (viewers) {
        for (const viewer of viewers) {
          if (viewer.readyState === WebSocket.OPEN) {
            viewer.send(data);
          }
        }
      }
    });

    socket.on("close", () => {
      const agents = agentsByProject.get(projectId);
      if (agents) {
        agents.delete(socket);
        if (agents.size === 0) {
          agentsByProject.delete(projectId);
        }
      }
    });
  });

  // ── WebSocket для viewer (/debug) ─────────────────────────────────────────
  const viewerWss = new WebSocketServer({ noServer: true });

  viewerWss.on("connection", (socket: SocketWithProjectId, req: IncomingMessage) => {
    const parsed = parseUrl(req.url ?? "", true);
    const projectId = parsed.query.projectId as string | undefined;

    if (!projectId) {
      socket.close(1008, "Missing projectId query param");
      return;
    }

    socket.projectId = projectId;

    if (!viewersByProject.has(projectId)) {
      viewersByProject.set(projectId, new Set());
    }
    viewersByProject.get(projectId)!.add(socket);

    socket.on("close", () => {
      const viewers = viewersByProject.get(projectId);
      if (viewers) {
        viewers.delete(socket);
        if (viewers.size === 0) {
          viewersByProject.delete(projectId);
        }
      }
    });
  });

  // ── HTTP upgrade routing ──────────────────────────────────────────────────
  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = req.url ?? "";
    const path = url.split("?")[0];

    if (path === "/agent") {
      agentWss.handleUpgrade(req, socket, head, (ws) => {
        agentWss.emit("connection", ws, req);
      });
    } else if (path === "/debug") {
      viewerWss.handleUpgrade(req, socket, head, (ws) => {
        viewerWss.emit("connection", ws, req);
      });
    }
    // Все остальные пути (/ws и т.д.) — не трогаем,
    // watcherService зарегистрирован с { path: "/ws" } и обработает сам.
  });
}
