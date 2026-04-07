import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { COLORS } from "../../constants/colors/colors";
import styles from "./Home.module.css";
import type { AppDispatch } from "../../redux/Store";
import { TopMenu } from "../../components/home/topMenu/TopMenu";
import { getAppTreeThunk } from "../../redux/treeSlice/asyncthunk";
import { LeftMenu } from "../../components/home/leftMenu/LeftMenu";
import type { LeftMenuMode } from "../../components/home/leftMenu/LeftMenu";
import { LeftContentTree } from "../../components/home/leftContentTree/LeftContentTree";
import { useProjectWatcher } from "../../hooks/useProjectWatcher";
import { FileViewer } from "../../components/home/fileViewer/FileViewer";
import { DebugPanel } from "../../components/home/debugPanel/DebugPanel";
import { AddAgentModal } from "../../components/home/addAgentModal/AddAgentModal";
import { RemoveAgentModal } from "../../components/home/removeAgentModal/RemoveAgentModal";
import { useDebugSocket } from "../../hooks/useDebugSocket";
import { selectAgentStatus, setAgentStatus, setInstalledInFile, clearEvents } from "../../redux/debugSlice/DebugSlice";
import { useAppSelector } from "../../hooks/redux/useRedux";
import { agentApi } from "../../axios/agent/agentApi";

export const Home = () => {
  const dispatch    = useDispatch<AppDispatch>();
  const agentStatus = useAppSelector(selectAgentStatus);

  const [showModal, setShowModal]             = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [leftMode, setLeftMode]               = useState<LeftMenuMode>("files");

  // Первоначальная загрузка дерева
  useEffect(() => {
    dispatch(getAppTreeThunk());
  }, [dispatch]);

  // Восстановление статуса агента после перезагрузки страницы
  useEffect(() => {
    agentApi.status().then(result => {
      if (result.installed) {
        dispatch(setInstalledInFile(result.entryFile ?? "unknown"));
      }
    }).catch(() => { /* сервер недоступен — оставляем not-installed */ });
  }, [dispatch]);

  // Live watcher — автоматически обновляет дерево при изменениях в проекте
  useProjectWatcher();

  // Debug WebSocket — подключается только когда агент установлен
  useDebugSocket(agentStatus === "installed");

  const handleRemoveAgent = async () => {
    try {
      const result = await agentApi.uninstall();
      if (result.success) {
        dispatch(setAgentStatus("not-installed"));
        dispatch(clearEvents());
        setLeftMode("files");
      } else {
        throw new Error(result.error ?? "Ошибка при удалении агента");
      }
    } catch (e) {
      throw e; // пробрасываем в модалку чтобы она показала ошибку
    }
  };

  return (
    <div
      className={styles.container}
      style={{ backgroundColor: COLORS.background }}
    >
      <TopMenu onAddAgent={() => setShowModal(true)} onRemoveAgent={() => setShowRemoveModal(true)} />

      <div className={styles.content}>
        <LeftMenu mode={leftMode} onModeChange={setLeftMode} />

        {leftMode === "files" ? (
          <>
            <LeftContentTree />
            <FileViewer />
          </>
        ) : (
          <DebugPanel />
        )}
      </div>

      {showModal && (
        <AddAgentModal
          onClose={() => setShowModal(false)}
          onInstalled={() => {
            setShowModal(false);
            setLeftMode("debug");
          }}
        />
      )}

      {showRemoveModal && (
        <RemoveAgentModal
          onClose={() => setShowRemoveModal(false)}
          onConfirm={handleRemoveAgent}
        />
      )}
    </div>
  );
};
