/* eslint-disable no-undef */
/**
 * codetraxis debug agent — entry point.
 * __PORT__ is replaced at install time with the actual server port.
 * __PROJECT_ID__ is replaced at install time with the server's unique project ID.
 * __XHR_LINE__ is replaced with the appropriate XHR setup line (with/without comment).
 */
import { createTreeViewerBridge } from "./shared";
import { setupConsoleInterceptor } from "./interceptors/consoleInterceptor";
import { setupFetchInterceptor }   from "./interceptors/fetchInterceptor";
import { setupXhrInterceptor }     from "./interceptors/xhrInterceptor";

// ─── Optional require ─────────────────────────────────────────────────────────
// Resolves optional peer deps (axios / socket.io-client) at RUNTIME in Node /
// Metro (React Native). The require is called through an aliased variable so web
// bundlers (Turbopack / webpack) do NOT statically analyze it — otherwise they
// emit "Module not found" warnings for packages the app may not have installed.
// In the browser axios already flows through the XHR interceptor, so a failed
// resolve here is harmless.
function optionalRequire(name: string): any {
  try {
    const req: any = typeof require === "function"
      ? require
      : (globalThis as any).require;
    return typeof req === "function" ? req(name) : null;
  } catch {
    return null;
  }
}

// ─── Environment guard ───────────────────────────────────────────────────────
// The agent is a browser / React Native runtime tool. It must NOT execute in a
// Node.js server context (e.g. Next.js Server Components, SSR, route handlers),
// where it would patch server-side fetch/console and try to open a WebSocket
// from the server. We detect a real browser OR React Native, and skip Node.
const __ct_isReactNative =
  typeof navigator !== "undefined" && (navigator as any).product === "ReactNative";
const __ct_isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";
const __ct_isNodeServer =
  !__ct_isBrowser && !__ct_isReactNative &&
  typeof process !== "undefined" && !!(process as any).versions?.node;

export const treeViewerBridge = __ct_isNodeServer
  ? (null as unknown as ReturnType<typeof createTreeViewerBridge>)
  : createTreeViewerBridge("__PORT__", "__PROJECT_ID__");

if (treeViewerBridge) {
  setupConsoleInterceptor(treeViewerBridge);
  setupFetchInterceptor(treeViewerBridge);
  setupXhrInterceptor(treeViewerBridge);

  // ─── Auto-attach default axios instance ────────────────────────────────────
  // If the project uses axios, we attach interceptors to the default instance.
  // For axios.create() instances, call attachAxios(instance) manually.
  try {
    const axiosModule = optionalRequire("axios");
    const axiosInstance = axiosModule?.default ?? axiosModule;
    if (axiosInstance?.interceptors) {
      attachAxios(axiosInstance);
    }
  } catch { /* axios not installed — skip */ }
}

// ─── Auto-patch socket.io-client if present ──────────────────────────────────
// React Native often uses socket.io-client which doesn't go through globalThis.WebSocket.
// We patch Metro's module cache to intercept socket.io imports automatically.
if (treeViewerBridge) try {
  const g = globalThis as Record<string, any>;

  // Metro bundler stores modules in require.cache / metroRequire.cache
  // We patch cached socket.io-client exports directly
  if (typeof g.require === "function") {
    // Try to find socket.io-client in the module cache
    const cache = (g.require as any).cache || {};

    // Scan all cached modules for socket.io-client
    Object.keys(cache).forEach(moduleId => {
      try {
        const module = cache[moduleId];
        if (!module || typeof module !== "object") return;

        // Check if this looks like socket.io-client by inspecting exports
        const exports = module.exports || module;
        const ioFn = exports?.io || exports?.default;

        if (ioFn && typeof ioFn === "function" && !ioFn.__tv_patched__) {
          const originalIO = ioFn;
          const patchedIO = function(this: any, ...args: any[]): any {
            const socket = originalIO.apply(this, args);
            attachSocketIO(socket);
            return socket;
          };

          Object.setPrototypeOf(patchedIO, originalIO);
          Object.keys(originalIO).forEach(k => {
            try { (patchedIO as any)[k] = originalIO[k]; } catch {/* skip */}
          });
          (patchedIO as any).__tv_patched__ = true;

          if (exports.io) exports.io = patchedIO;
          if (exports.default) exports.default = patchedIO;
          if (module.exports) {
            if (module.exports.io) module.exports.io = patchedIO;
            if (module.exports.default) module.exports.default = patchedIO;
          }
        }
      } catch { /* skip this module */ }
    });
  }

  // Also try direct require as fallback (works if socket.io loads after agent)
  try {
    const sio = optionalRequire("socket.io-client");
    const ioFn = sio?.io || sio?.default;
    if (ioFn && typeof ioFn === "function" && !(ioFn as any).__tv_patched__) {
      const originalIO = ioFn;
      const patchedIO = function(this: any, ...args: any[]): any {
        const socket = originalIO.apply(this, args);
        attachSocketIO(socket);
        return socket;
      };
      Object.setPrototypeOf(patchedIO, originalIO);
      Object.keys(originalIO).forEach(k => {
        try { (patchedIO as any)[k] = originalIO[k]; } catch {/* skip */}
      });
      (patchedIO as any).__tv_patched__ = true;

      if (sio.io) sio.io = patchedIO;
      if (sio.default) sio.default = patchedIO;
    }
  } catch { /* socket.io not installed */ }
} catch { /* socket.io-client patching failed — skip */ }

// ─── attachAxios — for axios.create() instances ───────────────────────────────
// Usage: import { attachAxios } from "./codetraxisAgent";
//        attachAxios(myAxiosInstance);
export function attachAxios(instance: any): void {
  if (!treeViewerBridge || !instance?.interceptors) return;

  const INSTALLED_KEY = "__tv_axios_installed__";
  if (instance[INSTALLED_KEY]) return;
  instance[INSTALLED_KEY] = true;

  const REQ_ID_KEY    = "__tv_req_id__";
  const REQ_START_KEY = "__tv_req_start__";

  const joinUrl = (base?: string, url?: string) => {
    if (!base) return url || "";
    if (!url)  return base;
    try { return new URL(url, base).toString(); } catch { return `${base}${url}`; }
  };

  const normalizeHeaders = (h: unknown): Record<string, string> | undefined => {
    if (!h) return undefined;
    try {
      if (typeof (h as any).toJSON === "function") return (h as any).toJSON() as Record<string, string>;
      return { ...(h as Record<string, string>) };
    } catch { return undefined; }
  };

  instance.interceptors.request.use(
    (config: any) => {
      const id    = treeViewerBridge.uid();
      const start = Date.now();
      config[REQ_ID_KEY]    = id;
      config[REQ_START_KEY] = start;
      treeViewerBridge.send({
        id, type: "network", transport: "axios",
        method: (config.method || "get").toUpperCase(),
        url: joinUrl(config.baseURL, config.url),
        requestHeaders: normalizeHeaders(config.headers),
        requestBody: treeViewerBridge.safeSerialize(config.data),
        state: "pending", timestamp: start,
      });
      return config;
    },
    (error: any) => {
      treeViewerBridge.send({
        id: treeViewerBridge.uid(), type: "network", transport: "axios",
        state: "error", timestamp: Date.now(),
        error: treeViewerBridge.safeSerialize(error),
      });
      return Promise.reject(error);
    },
  );

  instance.interceptors.response.use(
    (response: any) => {
      const id    = response.config[REQ_ID_KEY]    || treeViewerBridge.uid();
      const start = response.config[REQ_START_KEY] || Date.now();
      treeViewerBridge.send({
        id, type: "network", transport: "axios",
        method: (response.config.method || "get").toUpperCase(),
        url: joinUrl(response.config.baseURL, response.config.url),
        status: response.status,
        requestHeaders: normalizeHeaders(response.config.headers),
        requestBody: treeViewerBridge.safeSerialize(response.config.data),
        responseHeaders: normalizeHeaders(response.headers),
        responseBody: treeViewerBridge.safeSerialize(response.data),
        state: "success", duration: Date.now() - start, timestamp: start,
      });
      return response;
    },
    (error: any) => {
      const cfg   = error?.config || {};
      const id    = cfg[REQ_ID_KEY]    || treeViewerBridge.uid();
      const start = cfg[REQ_START_KEY] || Date.now();
      treeViewerBridge.send({
        id, type: "network", transport: "axios",
        method: (cfg.method || "get").toUpperCase(),
        url: joinUrl(cfg.baseURL, cfg.url),
        status: error?.response?.status,
        requestHeaders: normalizeHeaders(cfg.headers),
        requestBody: treeViewerBridge.safeSerialize(cfg.data),
        responseHeaders: normalizeHeaders(error?.response?.headers),
        responseBody: treeViewerBridge.safeSerialize(error?.response?.data),
        state: "error", duration: Date.now() - start, timestamp: start,
        error: treeViewerBridge.safeSerialize({ message: error?.message, code: error?.code, name: error?.name }),
      });
      return Promise.reject(error);
    },
  );
}

// ─── attachSocketIO — for socket.io-client instances ─────────────────────────
// React Native uses socket.io which doesn't go through globalThis.WebSocket.
// Usage: import { attachSocketIO } from "./codetraxisAgent";
//        attachSocketIO(socket);  // call after getChatSocket() or io()
export function attachSocketIO(socket: any): void {
  if (!treeViewerBridge || !socket) return;

  const INSTALLED_KEY = "__tv_sio_installed__";
  if (socket[INSTALLED_KEY]) return;
  socket[INSTALLED_KEY] = true;

  const url: string = socket.io?.uri ?? socket.nsp ?? "socket.io";

  // ── Incoming events ──────────────────────────────────────────────────────
  socket.onAny((event: string, ...args: unknown[]) => {
    treeViewerBridge.send({
      id: treeViewerBridge.uid(),
      type: "network",
      transport: "websocket",
      url,
      method: "MESSAGE",
      responseBody: treeViewerBridge.truncate(
        JSON.stringify({ event, data: args.length === 1 ? args[0] : args }),
      ),
      state: "success",
      timestamp: Date.now(),
    });
  });

  // ── Outgoing events ──────────────────────────────────────────────────────
  const origEmit = socket.emit.bind(socket);
  socket.emit = (event: string, ...args: unknown[]) => {
    if (!["ping", "pong"].includes(event)) {
      treeViewerBridge.send({
        id: treeViewerBridge.uid(),
        type: "network",
        transport: "websocket",
        url,
        method: "SEND",
        requestBody: treeViewerBridge.truncate(
          JSON.stringify({ event, data: args[0] }),
        ),
        state: "success",
        timestamp: Date.now(),
      });
    }
    return origEmit(event, ...args);
  };
}

export {};
