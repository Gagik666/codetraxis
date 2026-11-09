/* eslint-disable no-undef */
/**
 * codetraxis agent — shared bridge.
 * __PORT__ is replaced at install time with the actual server port.
 */

export type TreeViewerEvent = Record<string, unknown>;

export interface TreeViewerBridge {
  send: (event: TreeViewerEvent) => void;
  uid: () => string;
  safeSerialize: (value: unknown, depth?: number) => unknown;
  truncate: (value: string, max?: number) => string;
  isWeb: boolean;
}

export function createTreeViewerBridge(serverPort: string, projectId: string): TreeViewerBridge {
  const g = globalThis as Record<string, any>;

  const isWeb: boolean =
    typeof g.document !== "undefined" &&
    typeof g.addEventListener === "function";

  let ws: WebSocket | null = null;
  let wsReady = false;
  const queue: string[] = [];
  let retryCount = 0;
  let retryTimer: any = null;
  let heartbeatTimer: any = null;

  const getHost = (): string => {
    if (typeof g.__TREE_VIEWER_HOST__ === "string" && g.__TREE_VIEWER_HOST__) {
      return g.__TREE_VIEWER_HOST__ as string;
    }
    if (isWeb && g.location?.hostname) return g.location.hostname as string;
    return "localhost";
  };

  const log = (msg: string) => {
    if (typeof console !== "undefined" && console.log) {
      console.log(`[codetraxis] ${msg}`);
    }
  };

  const scheduleReconnect = () => {
    if (retryTimer) return; // Already scheduled

    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
    retryCount++;

    log(`Reconnecting in ${delay}ms (attempt ${retryCount})...`);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };

  const startHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    // Ping every 30s to keep connection alive
    heartbeatTimer = setInterval(() => {
      if (wsReady && ws && ws.readyState === 1) {
        try {
          ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        } catch { /* ignore */ }
      }
    }, 30000);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const connect = () => {
    try {
      const WS =
        typeof WebSocket !== "undefined"
          ? WebSocket
          : (g.WebSocket as typeof WebSocket | undefined);
      if (!WS) {
        log("WebSocket not available");
        return;
      }

      const url = `ws://${getHost()}:${serverPort}/agent?projectId=${projectId}`;
      log(`Connecting to ${url}...`);

      ws = new WS(url);

      ws.onopen = () => {
        wsReady = true;
        retryCount = 0; // Reset retry count on successful connection
        log("Connected successfully");

        // Flush queued events
        while (queue.length > 0) {
          const item = queue.shift();
          if (item && ws) ws.send(item);
        }

        startHeartbeat();
      };

      ws.onclose = (e) => {
        wsReady = false;
        stopHeartbeat();
        log(`Connection closed (code: ${e.code})`);
        scheduleReconnect();
      };

      ws.onerror = (e) => {
        wsReady = false;
        stopHeartbeat();
        log(`Connection error`);
        // onerror is always followed by onclose, so we don't schedule reconnect here
      };
    } catch (err) {
      log(`Connection failed: ${err}`);
      scheduleReconnect();
    }
  };

  connect();

  const truncate = (value: string, max = 50000): string =>
    value.length > max ? `${value.slice(0, max)}…[truncated]` : value;

  const safeSerialize = (value: unknown, depth = 0): unknown => {
    if (depth > 3)            return "[depth limit]";
    if (value == null)        return value;
    if (typeof value === "function") return `[Function]`;
    if (typeof value === "symbol")   return "[Symbol]";
    if (typeof value !== "object")   return value;
    if (value instanceof Error) return { __error: true, name: value.name, message: value.message };
    if (Array.isArray(value))   return value.slice(0, 100).map(i => safeSerialize(i, depth + 1));

    const seen = new WeakSet<object>();
    const walk = (obj: object, d: number): Record<string, unknown> | string => {
      if (seen.has(obj)) return "[circular]";
      seen.add(obj);
      const r: Record<string, unknown> = {};
      let n = 0;
      for (const k in obj as Record<string, unknown>) {
        if (n++ > 50) { r["..."] = "[truncated]"; break; }
        try { r[k] = safeSerialize((obj as Record<string, unknown>)[k], d + 1); }
        catch { r[k] = "[unserializable]"; }
      }
      return r;
    };
    return walk(value as object, depth);
  };

  const uid = () =>
    `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

  const send = (event: TreeViewerEvent) => {
    try {
      const payload = JSON.stringify(event);
      // Drop events if queue is full instead of serializing them
      if (wsReady && ws) {
        ws.send(payload);
      } else if (queue.length < 200) {
        queue.push(payload);
      }
    } catch { /* ignore */ }
  };

  return { send, uid, safeSerialize, truncate, isWeb };
}

/**
 * Framework/dev-server system traffic that should never appear in the panel:
 * Next.js HMR sockets, webpack hot-update chunks, static asset loads, etc.
 */
const SYSTEM_URL_PATTERNS = [
  "_next/hmr",
  "_next/webpack-hmr",
  "webpack-hmr",
  "__webpack_hmr",
  "sockjs-node",
  "_next/static",
  ".hot-update.",
  "__nextjs_original-stack-frame",
  "on-demand-entries-ping",
];

export function isSystemUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  for (const p of SYSTEM_URL_PATTERNS) {
    if (url.indexOf(p) !== -1) return true;
  }
  return false;
}

/**
 * Serialize any request body type into something JSON-safe.
 * FormData → plain object (File/Blob entries shown as metadata strings).
 * ArrayBuffer / Blob → "[binary data: N bytes]".
 * URLSearchParams → decoded key=value string.
 * String → JSON.parse attempt, fallback to raw string.
 * Everything else → returned as-is (safeSerialize handles the rest).
 */
export function parseRequestBody(body: unknown): unknown {
  if (body == null) return body;

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const result: Record<string, unknown> = {};
    body.forEach((value, key) => {
      if (typeof File !== "undefined" && value instanceof File) {
        result[key] = `[File: ${value.name} | ${value.type || "application/octet-stream"} | ${value.size} bytes]`;
      } else if (typeof Blob !== "undefined" && value instanceof Blob) {
        result[key] = `[Blob: ${value.type || "application/octet-stream"} | ${value.size} bytes]`;
      } else {
        result[key] = value;
      }
    });
    return result;
  }

  if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
    return `[binary data: ${body.byteLength} bytes]`;
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return `[Blob: ${body.type || "application/octet-stream"} | ${body.size} bytes]`;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return body; }
  }

  return body;
}
