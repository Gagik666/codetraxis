import type { DebugEvent } from "../../../../redux/debugSlice/types";
import { formatArgs, getPathname } from "./formatters";

export function getMethodColor(method = "", isError = false): string {
  return (
    (
      {
        GET: isError ? "#f00" : "#cf6a4c",
        POST: isError ? "#f00" : "#8f9d6a",
        PUT: isError ? "#f00" : "#cda869",
        PATCH: isError ? "#f00" : "#9b859d",
        DELETE: isError ? "#f00" : "#cf6a4c",
      } as Record<string, string>
    )[method.toUpperCase()] ?? "#838184"
  );
}

export function getStatusColor(status?: number): string {
  if (!status) return "#838184";
  if (status >= 200 && status < 300) return "#8f9d6a";
  if (status >= 400) return "#f00";
  return "#cda869";
}

export function getTitleColor(event: DebugEvent): string {
  if (event.type === "console") {
    if (event.level === "warn") return "#cda869";
    if (event.level === "error") return "#f00";
    return "#7587a6";
  }
  if (event.type === "network") {
    return getMethodColor(
      event.method,
      event.status != null && event.status >= 400,
    );
  }
  return "#7587a6";
}

export function getTitle(event: DebugEvent): string {
  if (event.type === "console") return event.level.toUpperCase();
  if (event.type === "network") {
    const status = event.status ? ` (${event.status})` : "";
    return `${event.method ?? "NET"}${status}`;
  }
  return "EVENT";
}

export function getPreview(event: DebugEvent): string {
  if (event.type === "console") return formatArgs(event.args).slice(0, 200);
  if (event.type === "network") {
    return getPathname(event.url);
  }
  return "";
}
