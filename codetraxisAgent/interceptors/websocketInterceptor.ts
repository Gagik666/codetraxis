/* eslint-disable no-undef */
/**
 * codetraxis agent — WebSocket interceptor.
 * Patches the native WebSocket API to track connections, messages, and state changes.
 */
// Keep imports below to preserve ESLint directive above
import type { TreeViewerBridge } from "../shared";

const INSTALLED_KEY = "__tv_websocket_installed__";

export function setupWebSocketInterceptor(bridge: TreeViewerBridge): void {
  const g = globalThis as Record<string, any>;
  if (g[INSTALLED_KEY]) return;
  g[INSTALLED_KEY] = true;

  if (typeof WebSocket === "undefined") return;

  try {
    const OriginalWebSocket = WebSocket;

    // @ts-ignore
    globalThis.WebSocket = function PatchedWebSocket(
      url: string | URL,
      protocols?: string | string[]
    ) {
      const id = bridge.uid();
      const wsUrl = typeof url === "string" ? url : url.toString();
      const start = Date.now();

      // Skip tracking codetraxis agent's own WebSocket connection
      const isSelfConnection = wsUrl.includes("/agent?projectId=") ||
                               wsUrl.includes("/debug") ||
                               wsUrl.includes("codetraxis");

      if (isSelfConnection) {
        // Return original WebSocket without tracking
        return new OriginalWebSocket(url, protocols as any);
      }

      // Create the original WebSocket instance
      const ws = new OriginalWebSocket(url, protocols as any);

      // Track connection opened
      bridge.send({
        id,
        type: "network",
        transport: "websocket",
        method: "CONNECT",
        url: wsUrl,
        state: "pending",
        timestamp: start,
        requestHeaders: protocols
          ? { "Sec-WebSocket-Protocol": Array.isArray(protocols) ? protocols.join(", ") : protocols }
          : undefined,
      });

      // Track successful connection
      const origOnOpen = ws.onopen;
      ws.addEventListener("open", (event) => {
        bridge.send({
          id,
          type: "network",
          transport: "websocket",
          method: "CONNECT",
          url: wsUrl,
          state: "success",
          duration: Date.now() - start,
          timestamp: start,
        });
      });

      // Track incoming messages
      const origOnMessage = ws.onmessage;
      ws.addEventListener("message", (event) => {
        let responseBody: unknown;
        try {
          if (typeof event.data === "string") {
            responseBody = bridge.truncate(event.data);
          } else if (event.data instanceof Blob) {
            responseBody = `[Blob: ${event.data.size} bytes]`;
          } else if (event.data instanceof ArrayBuffer) {
            responseBody = `[ArrayBuffer: ${event.data.byteLength} bytes]`;
          } else {
            responseBody = String(event.data);
          }
        } catch {
          responseBody = "[unserializable]";
        }

        bridge.send({
          id: bridge.uid(),
          type: "network",
          transport: "websocket",
          method: "MESSAGE",
          url: wsUrl,
          responseBody: bridge.safeSerialize(responseBody),
          state: "success",
          timestamp: Date.now(),
        });
      });

      // Track connection errors
      const origOnError = ws.onerror;
      ws.addEventListener("error", (event) => {
        bridge.send({
          id,
          type: "network",
          transport: "websocket",
          method: "CONNECT",
          url: wsUrl,
          state: "error",
          duration: Date.now() - start,
          timestamp: start,
          error: bridge.safeSerialize({ message: "WebSocket connection error" }),
        });
      });

      // Track connection closed
      const origOnClose = ws.onclose;
      ws.addEventListener("close", (event) => {
        bridge.send({
          id: bridge.uid(),
          type: "network",
          transport: "websocket",
          method: "CLOSE",
          url: wsUrl,
          status: event.code,
          responseBody: event.reason ? bridge.truncate(event.reason) : undefined,
          state: event.wasClean ? "success" : "error",
          timestamp: Date.now(),
        });
      });

      // Patch send method to track outgoing messages
      const origSend = ws.send.bind(ws);
      ws.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        let requestBody: unknown;
        try {
          if (typeof data === "string") {
            requestBody = bridge.truncate(data);
          } else if (data instanceof Blob) {
            requestBody = `[Blob: ${data.size} bytes]`;
          } else if (data instanceof ArrayBuffer) {
            requestBody = `[ArrayBuffer: ${data.byteLength} bytes]`;
          } else if (ArrayBuffer.isView(data)) {
            requestBody = `[${data.constructor.name}: ${data.byteLength} bytes]`;
          } else {
            requestBody = String(data);
          }
        } catch {
          requestBody = "[unserializable]";
        }

        bridge.send({
          id: bridge.uid(),
          type: "network",
          transport: "websocket",
          method: "SEND",
          url: wsUrl,
          requestBody: bridge.safeSerialize(requestBody),
          state: "success",
          timestamp: Date.now(),
        });

        return origSend(data);
      };

      return ws;
    };

    // Copy static properties from original WebSocket
    Object.setPrototypeOf(globalThis.WebSocket, OriginalWebSocket);
    globalThis.WebSocket.prototype = OriginalWebSocket.prototype;

    // Copy WebSocket constants
    (globalThis.WebSocket as any).CONNECTING = OriginalWebSocket.CONNECTING;
    (globalThis.WebSocket as any).OPEN = OriginalWebSocket.OPEN;
    (globalThis.WebSocket as any).CLOSING = OriginalWebSocket.CLOSING;
    (globalThis.WebSocket as any).CLOSED = OriginalWebSocket.CLOSED;
  } catch {
    /* WebSocket patching failed */
  }
}
