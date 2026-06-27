/**
 * codetraxis agent — console interceptor.
 */
import type { TreeViewerBridge } from "../shared";

const INSTALLED_KEY = "__tv_console_installed__";

export function setupConsoleInterceptor(bridge: TreeViewerBridge): void {
  const g = globalThis as Record<string, any>;
  if (g[INSTALLED_KEY]) return;
  g[INSTALLED_KEY] = true;

  const original = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
  };

  (["log", "info", "warn", "error"] as const).forEach(level => {
    // @ts-ignore
    console[level] = (...args: unknown[]) => {
      original[level](...args);
      bridge.send({
        id: bridge.uid(),
        type: "console",
        level,
        args: args.map(a => bridge.safeSerialize(a)),
        timestamp: Date.now(),
      });
    };
  });
}
