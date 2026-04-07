import { smartAxios } from "../axios";

export interface InstallAgentResult {
  success: boolean;
  alreadyInstalled: boolean;
  entryFile?: string;
  agentFile?: string;
  error?: string;
}

export interface RemoveAgentResult {
  success: boolean;
  entryFile?: string;
  agentFile?: string;
  error?: string;
}

export interface AgentStatusResult {
  installed: boolean;
  entryFile?: string;
}

export const agentApi = {
  install: () =>
    smartAxios.post<InstallAgentResult>("/api/agent/install").then(r => r.data),

  uninstall: () =>
    smartAxios.delete<RemoveAgentResult>("/api/agent/uninstall").then(r => r.data),

  status: () =>
    smartAxios.get<AgentStatusResult>("/api/agent/status").then(r => r.data),
};
