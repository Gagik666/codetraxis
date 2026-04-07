import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../redux/Store";
import { getAppTreeThunk } from "../redux/treeSlice/asyncthunk";
import { getFileContentThunk } from "../redux/fileSlice/asyncthunk";
import { useAppSelector } from "./redux/useRedux";
import { selectFile } from "../redux/fileSlice/FileSlice";

type ProjectEvent =
  | { type: "connected" }
  | { type: "tree_changed" }
  | { type: "file_changed"; path: string };

const WS_URL = `ws://localhost:3333/ws`;
const RECONNECT_MS = 3000;

export const useProjectWatcher = () => {
  const dispatch = useDispatch<AppDispatch>();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Храним текущий открытый файл в ref — чтобы не пересоздавать WebSocket
  // при каждом изменении selectedFile
  const selectedFile = useAppSelector(selectFile);
  const selectedFileRef = useRef(selectedFile);
  selectedFileRef.current = selectedFile;

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("🔌 WebSocket connected");
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data: ProjectEvent = JSON.parse(event.data as string);

          if (data.type === "connected") {
            console.log("✅ Watcher ready");
          }

          if (data.type === "tree_changed") {
            console.log("🌳 Tree changed — refetching...");
            dispatch(getAppTreeThunk());
          }

          if (data.type === "file_changed") {
            console.log(`📝 File changed: ${data.path}`);
            // Если этот файл сейчас открыт — обновляем его содержимое
            if (selectedFileRef.current?.path === data.path) {
              console.log(`🔄 Reloading open file: ${data.path}`);
              dispatch(getFileContentThunk(data.path));
            }
          }
        } catch (err) {
          console.error("WebSocket parse error:", err);
        }
      };

      ws.onclose = () => {
        console.warn(`⚠️ WebSocket disconnected — reconnecting in ${RECONNECT_MS}ms...`);
        reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
      };

      ws.onerror = (err) => {
        console.error("❌ WebSocket error:", err);
        ws.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [dispatch]);
};
