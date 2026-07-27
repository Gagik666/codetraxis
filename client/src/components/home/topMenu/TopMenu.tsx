import { COLORS } from "../../../constants/colors/colors";
import { useAppSelector } from "../../../hooks/redux/useRedux";
import { selectAppTree } from "../../../redux/treeSlice/TreeSlice";
import { selectAgentStatus, selectConnectionStatus } from "../../../redux/debugSlice/DebugSlice";
import styles from "./TopMenu.module.css";

interface TopMenuProps {
  onAddAgent: () => void;
  onRemoveAgent: () => void;
}

export const TopMenu = ({ onAddAgent, onRemoveAgent }: TopMenuProps) => {
  const appTree     = useAppSelector(selectAppTree);
  const agentStatus = useAppSelector(selectAgentStatus);
  const connectionStatus = useAppSelector(selectConnectionStatus);

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case "connected":
        return "●";
      case "connecting":
      case "reconnecting":
        return "◐";
      case "disconnected":
        return "○";
      default:
        return "○";
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "#4ade80";
      case "connecting":
        return "#fbbf24";
      case "reconnecting":
        return "#fb923c";
      case "disconnected":
        return "#ef4444";
      default:
        return "#64748b";
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case "connected":
        return "Agent";
      case "connecting":
        return "Connecting...";
      case "reconnecting":
        return "Reconnecting...";
      case "disconnected":
        return "Disconnected";
      default:
        return "Agent";
    }
  };

  return (
    <div
      style={{
        backgroundColor: COLORS.boxBackgroundDark,
        borderBottomColor: COLORS.borderColor,
      }}
      className={styles.container}
    >
      <p
        style={{
          color: COLORS.secondaryText,
          backgroundColor: COLORS.boxBackgroundLight,
        }}
        className={styles.title}
      >
        {appTree ? appTree.app.name : "Loading..."}
      </p>

      {agentStatus !== "installed" && (
        <button
          className={styles.addAgentBtn}
          onClick={onAddAgent}
          title="Установить Debug Agent в целевой проект"
        >
          {agentStatus === "installing" ? "Установка..." : "+ Add Agent"}
        </button>
      )}

      {agentStatus === "installed" && (
        <div className={styles.agentActive}>
          <div className={styles.statusBadge}>
            <span
              className={styles.statusIcon}
              style={{ color: getStatusColor() }}
            >
              {getStatusIcon()}
            </span>
            <span className={styles.statusText}>{getStatusText()}</span>
          </div>
          <button
            className={styles.removeAgentBtn}
            onClick={onRemoveAgent}
            title="Удалить Debug Agent из проекта"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};
