import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../redux/Store";
import { addEvent } from "../redux/debugSlice/DebugSlice";
import type { DebugEvent } from "../redux/debugSlice/types";

/**
 * Подключается к ws://host:port/debug и добавляет входящие события в Redux.
 * Автоматически переподключается при разрыве.
 * Активен только когда агент установлен.
 */
export const useDebugSocket = (enabled: boolean) => {
  const dispatch = useDispatch<AppDispatch>();
  const wsRef    = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const connect = () => {
      const url = `ws://${window.location.hostname}:3333/debug`;
      const ws  = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as DebugEvent;
          dispatch(addEvent(event));
        } catch {
          // невалидный JSON — игнорируем
        }
      };

      ws.onclose = () => {
        // Переподключаемся через 3 сек
        timerRef.current = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      wsRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, dispatch]);
};
