/**
 * codetraxis agent — XHR interceptor.
 * Patches XMLHttpRequest.prototype so existing references (e.g. axios
 * internals captured at import time) are also intercepted.
 * Works in browser and React Native (which ships its own XHR polyfill).
 */
import type { TreeViewerBridge } from "../shared";

const INSTALLED_KEY = "__tv_xhr_installed__";

export function setupXhrInterceptor(bridge: TreeViewerBridge): void {
  if (typeof XMLHttpRequest === "undefined") return;
  const g = globalThis as Record<string, any>;
  if (g[INSTALLED_KEY]) return;
  g[INSTALLED_KEY] = true;

  try {
    const proto = XMLHttpRequest.prototype;

    const _origOpen = proto.open;
    proto.open = function(this: XMLHttpRequest, method: string, url: string, ...rest: unknown[]) {
      (this as any).__tv_method     = method.toUpperCase();
      (this as any).__tv_url        = String(url);
      (this as any).__tv_reqHeaders = undefined;
      return (_origOpen as Function).apply(this, [method, url, ...rest]);
    };

    const _origSetHeader = proto.setRequestHeader;
    proto.setRequestHeader = function(this: XMLHttpRequest, name: string, value: string) {
      if (!(this as any).__tv_reqHeaders) (this as any).__tv_reqHeaders = {} as Record<string, string>;
      (this as any).__tv_reqHeaders[name] = value;
      return _origSetHeader.apply(this, [name, value]);
    };

    const _origSend = proto.send;
    proto.send = function(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const id         = bridge.uid();
      const method     = (this as any).__tv_method ?? "GET";
      const url        = (this as any).__tv_url    ?? "";
      const reqHeaders = (this as any).__tv_reqHeaders as Record<string, string> | undefined;
      const start      = Date.now();

      let requestBody: string | undefined;
      if (body != null) {
        try {
          requestBody =
            typeof body === "string"       ? bridge.truncate(body)
            : body instanceof URLSearchParams ? bridge.truncate(body.toString())
            : "[binary]";
        } catch { /* ignore */ }
      }

      bridge.send({ id, type: "network", transport: "xhr", method, url,
        requestBody, requestHeaders: reqHeaders, state: "pending", timestamp: start });

      this.addEventListener("load", () => {
        let responseBody: string | undefined;
        try { responseBody = bridge.truncate(this.responseText); } catch { /* binary */ }

        let responseHeaders: Record<string, string> | undefined;
        try {
          const raw = this.getAllResponseHeaders();
          if (raw) {
            responseHeaders = {};
            raw.trim().split(/\r?\n/).forEach(line => {
              const idx = line.indexOf(": ");
              if (idx > 0) responseHeaders![line.slice(0, idx).toLowerCase()] = line.slice(idx + 2);
            });
          }
        } catch { /* ignore */ }

        bridge.send({ id, type: "network", transport: "xhr", method, url,
          status: this.status, requestBody, requestHeaders: reqHeaders,
          responseBody, responseHeaders,
          state: this.status >= 200 && this.status < 400 ? "success" : "error",
          duration: Date.now() - start, timestamp: start });
      });

      this.addEventListener("error", () => {
        bridge.send({ id, type: "network", transport: "xhr", method, url,
          requestBody, requestHeaders: reqHeaders,
          state: "error", duration: Date.now() - start, timestamp: start });
      });

      return _origSend.apply(this, [body]);
    };
  } catch { /* not available */ }
}
