import type { DebugEvent, NetworkEvent } from "../../../../redux/debugSlice/types";
import type { DebugFilter } from "../../../../redux/debugSlice/types";
import type { NetTab } from "./types";
import { tryParseJson } from "./parsers";

export const FILTERS: { key: DebugFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "network", label: "Network" },
  { key: "console", label: "Console" },
];

export const NET_TABS: { key: NetTab; label: string }[] = [
  { key: "response", label: "Response" },
  { key: "responseHeaders", label: "Res Headers" },
  { key: "request", label: "Request" },
  { key: "requestHeaders", label: "Req Headers" },
];

export function applyFilter(
  events: DebugEvent[],
  filter: DebugFilter,
): DebugEvent[] {
  if (filter === "all")     return events;
  if (filter === "console") return events.filter((e) => e.type === "console");
  if (filter === "network") return events.filter((e) => e.type === "network");
  return events;
}

export function getFilterCount(
  events: DebugEvent[],
  key: DebugFilter,
): number {
  return applyFilter(events, key).length;
}

export function getBodyToCopy(
  event: NetworkEvent,
  tab: NetTab,
): string | null {
  if (tab === "response") {
    if (!event.responseBody) return null;
    const parsed = tryParseJson(event.responseBody);
    return parsed
      ? JSON.stringify(parsed, null, 2)
      : String(event.responseBody);
  }
  if (tab === "request") {
    if (!event.requestBody) return null;
    const parsed = tryParseJson(event.requestBody);
    return parsed
      ? JSON.stringify(parsed, null, 2)
      : String(event.requestBody);
  }
  if (tab === "responseHeaders") {
    const h = (
      event as NetworkEvent & { responseHeaders?: Record<string, string> }
    ).responseHeaders;
    return h ? JSON.stringify(h, null, 2) : null;
  }
  if (tab === "requestHeaders") {
    const h = (
      event as NetworkEvent & { requestHeaders?: Record<string, string> }
    ).requestHeaders;
    return h ? JSON.stringify(h, null, 2) : null;
  }
  return null;
}
