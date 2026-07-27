import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../redux/Store";
import { addEvent, setConnectionStatus } from "../redux/debugSlice/DebugSlice";
import type { DebugEvent } from "../redux/debugSlice/types";
import { smartAxios } from "../axios/axios";

/**
 * Подключается к ws://host:port/debug?projectId=xyz и добавляет входящие события в Redux.
 * Автоматически переподключается при разрыве.
 * Активен только когда агент установлен.
 */
export const useDebugSocket = (enabled: boolean) => {
  const dispatch = useDispatch<AppDispatch>();
  const wsRef    = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const retryCountRef = useRef(0);

  // Fetch projectId from server once
  useEffect(() => {
    if (!enabled) return;

    smartAxios.get<{ projectId: string }>("/api/project-id")
      .then(res => setProjectId(res.data.projectId))
      .catch(() => {
        // If projectId endpoint fails, retry after 3s
        setTimeout(() => setProjectId(null), 3000);
      });
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !projectId) {
      dispatch(setConnectionStatus("disconnected"));
      return;
    }

    const connect = () => {
      const isReconnect = retryCountRef.current > 0;
      dispatch(setConnectionStatus(isReconnect ? "reconnecting" : "connecting"));

      // Use current page's port instead of hardcoded 3333
      const port = window.location.port || '3333';
      const url = `ws://${window.location.hostname}:${port}/debug?projectId=${projectId}`;
      const ws  = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCountRef.current = 0;
        dispatch(setConnectionStatus("connected"));
      };

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as DebugEvent;
          dispatch(addEvent(event));
        } catch {
          // невалидный JSON — игнорируем
        }
      };

      ws.onclose = () => {
        dispatch(setConnectionStatus("disconnected"));
        retryCountRef.current++;
        // Exponential backoff: 1s, 2s, 4s, max 10s
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 10000);
        timerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        dispatch(setConnectionStatus("disconnected"));
      };
    };

    connect();

    return () => {
      wsRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
      dispatch(setConnectionStatus("disconnected"));
      retryCountRef.current = 0;
    };
  }, [enabled, projectId, dispatch]);
};
