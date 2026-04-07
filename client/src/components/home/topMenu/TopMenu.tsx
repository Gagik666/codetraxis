import { COLORS } from "../../../constants/colors/colors";
import { useAppSelector } from "../../../hooks/redux/useRedux";
import { selectAppTree } from "../../../redux/treeSlice/TreeSlice";
import { selectAgentStatus } from "../../../redux/debugSlice/DebugSlice";
import styles from "./TopMenu.module.css";

interface TopMenuProps {
  onAddAgent: () => void;
  onRemoveAgent: () => void;
}

export const TopMenu = ({ onAddAgent, onRemoveAgent }: TopMenuProps) => {
  const appTree     = useAppSelector(selectAppTree);
  const agentStatus = useAppSelector(selectAgentStatus);

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
          <span className={styles.agentBadge}>🟢 Agent active</span>
          <button
            className={styles.removeAgentBtn}
            onClick={onRemoveAgent}
            title="Удалить Debug Agent из проекта"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
};
