/* eslint-disable no-undef */
/**
 * codetraxis agent — fetch interceptor.
 */
// Keep imports below to preserve ESLint directive above
import type { TreeViewerBridge } from "../shared";
import { parseRequestBody } from "../shared";

const INSTALLED_KEY = "__tv_fetch_installed__";

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const result: Record<string, string> = {};
  try {
    if (headers instanceof Headers) {
      headers.forEach((v, k) => { result[k] = v; });
    } else if (Array.isArray(headers)) {
      (headers as [string, string][]).forEach(([k, v]) => { result[k] = v; });
    } else {
      Object.assign(result, headers as Record<string, string>);
    }
    return result;
  } catch { return undefined; }
}

export function setupFetchInterceptor(bridge: TreeViewerBridge): void {
  const g = globalThis as Record<string, any>;
  if (g[INSTALLED_KEY]) return;
  g[INSTALLED_KEY] = true;

  const originalFetch =
    typeof globalThis.fetch === "function"
      ? globalThis.fetch.bind(globalThis)
      : null;
  if (!originalFetch) return;

  globalThis.fetch = async function tvFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === "string" ? input
      : input instanceof URL   ? input.href
      : (input as Request).url;

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const id    = bridge.uid();
    const start = Date.now();

    const requestHeaders = normalizeHeaders(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );

    let requestBody: unknown;
    const rawBody = init?.body;
    if (rawBody != null) {
      try {
        requestBody = bridge.safeSerialize(parseRequestBody(rawBody));
      } catch { requestBody = "[unserializable-body]"; }
    }

    bridge.send({ id, type: "network", transport: "fetch", method, url,
      requestHeaders, requestBody, state: "pending", timestamp: start });

    try {
      const response = await originalFetch(input, init);

      let responseHeaders: Record<string, string> | undefined;
      try {
        responseHeaders = {};
        response.headers.forEach((v, k) => { responseHeaders![k] = v; });
      } catch { /* ignore */ }

      let responseBody: string | undefined;
      try { responseBody = bridge.truncate(await response.clone().text()); }
      catch { responseBody = "[binary]"; }

      bridge.send({ id, type: "network", transport: "fetch", method, url,
        status: response.status, requestHeaders, requestBody,
        responseHeaders, responseBody,
        state: response.ok ? "success" : "error",
        duration: Date.now() - start, timestamp: start });

      return response;
    } catch (error) {
      bridge.send({ id, type: "network", transport: "fetch", method, url,
        requestHeaders, requestBody, state: "error",
        duration: Date.now() - start, timestamp: start,
        error: bridge.safeSerialize(error) });
      throw error;
    }
  };
}
