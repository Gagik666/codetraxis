// ─── Event types ────────────export type DebugEvent = ConsoleEvent | NetworkEvent;───────────────────────────────────────

export type ConsoleLevel = "log" | "info" | "warn" | "error";
export type NetworkTransport = "fetch" | "xhr" | "axios";
export type NetworkStatus = "pending" | "success" | "error";

export interface ConsoleEvent {
  id: string;
  type: "console";
  level: ConsoleLevel;
  args: unknown[];
  timestamp: number;
}

export interface NetworkEvent {
  id: string;
  type: "network";
  transport: NetworkTransport;
  method?: string;
  url: string;
  status?: number;
  statusText?: string;
  duration?: number;
  requestBody?: unknown;
  responseBody?: unknown;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  state: NetworkStatus;
  timestamp: number;
}

export interface ErrorEvent {
  id: string;
  type: "error";
  message: string;
  stack?: string;
  source?: string;
  timestamp: number;
}

export type DebugEvent = ConsoleEvent | NetworkEvent;

// ─── Filter ──────────────────────────────────────────────────────────────────

export type DebugFilter = "all" | "console" | "network";

// ─── Agent state ─────────────────────────────────────────────────────────────

export type AgentStatus =
  | "not-installed"
  | "installing"
  | "installed"
  | "error";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

// ─── Slice state ─────────────────────────────────────────────────────────────

export interface DebugState {
  agentStatus: AgentStatus;
  agentError: string | null;
  connectionStatus: ConnectionStatus;
  events: DebugEvent[];
  filter: DebugFilter;
  /** Файл куда был инжектирован import агента */
  installedInFile: string | null;
}
