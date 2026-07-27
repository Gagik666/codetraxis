import { createSlice, createSelector, type PayloadAction } from "@reduxjs/toolkit";
import type { DebugEvent, DebugFilter, DebugState, AgentStatus, ConnectionStatus } from "./types";
import type { RootState } from "../Store";

const MAX_EVENTS = 500;

const initialState: DebugState = {
  agentStatus: "not-installed",
  agentError: null,
  connectionStatus: "disconnected",
  events: [],
  filter: "all",
  installedInFile: null,
};

const debugSlice = createSlice({
  name: "debug",
  initialState,
  reducers: {
    setAgentStatus(state, action: PayloadAction<AgentStatus>) {
      state.agentStatus = action.payload;
      if (action.payload !== "error") {
        state.agentError = null;
      }
    },
    setAgentError(state, action: PayloadAction<string>) {
      state.agentStatus = "error";
      state.agentError = action.payload;
    },
    setInstalledInFile(state, action: PayloadAction<string>) {
      state.installedInFile = action.payload;
      state.agentStatus = "installed";
    },
    setConnectionStatus(state, action: PayloadAction<ConnectionStatus>) {
      state.connectionStatus = action.payload;
    },
    addEvent(state, action: PayloadAction<DebugEvent>) {
      const incoming = action.payload;
      const existingIdx = state.events.findIndex((e) => e.id === incoming.id);
      if (existingIdx !== -1) {
        // Обновляем на месте (network: pending → success/error)
        state.events[existingIdx] = incoming;
      } else {
        // Новые события в начало; обрезаем до MAX_EVENTS
        state.events.unshift(incoming);
        if (state.events.length > MAX_EVENTS) {
          state.events.length = MAX_EVENTS;
        }
      }
    },
    clearEvents(state) {
      state.events = [];
    },
    setFilter(state, action: PayloadAction<DebugFilter>) {
      state.filter = action.payload;
    },
  },
});

export const {
  setAgentStatus,
  setAgentError,
  setInstalledInFile,
  setConnectionStatus,
  addEvent,
  clearEvents,
  setFilter,
} = debugSlice.actions;

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectAgentStatus      = (s: RootState) => s.debugReducer.agentStatus;
export const selectAgentError       = (s: RootState) => s.debugReducer.agentError;
export const selectConnectionStatus = (s: RootState) => s.debugReducer.connectionStatus;
export const selectAllEvents        = (s: RootState) => s.debugReducer.events;
export const selectFilter           = (s: RootState) => s.debugReducer.filter;
export const selectInstalledFile    = (s: RootState) => s.debugReducer.installedInFile;

export const selectFilteredEvents = createSelector(
  selectAllEvents,
  selectFilter,
  (events, filter) => {
    if (filter === "all")     return events;
    if (filter === "console") return events.filter((e: DebugEvent) => e.type === "console");
    if (filter === "network") return events.filter((e: DebugEvent) => e.type === "network");
    return events;
  }
);

export default debugSlice.reducer;
