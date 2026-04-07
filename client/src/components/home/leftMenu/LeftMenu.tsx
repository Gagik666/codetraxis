import { FileIcon } from "../../../assets/icons/leftMenuIcons/FileIcon";
import { DebugIcon } from "../../../assets/icons/leftMenuIcons/DebugIcon";
import { COLORS } from "../../../constants/colors/colors";
import { useAppSelector } from "../../../hooks/redux/useRedux";
import { selectAgentStatus } from "../../../redux/debugSlice/DebugSlice";
import styles from "./LeftMenu.module.css";

export type LeftMenuMode = "files" | "debug";

interface LeftMenuProps {
  mode: LeftMenuMode;
  onModeChange: (mode: LeftMenuMode) => void;
}

export const LeftMenu = ({ mode, onModeChange }: LeftMenuProps) => {
  const agentStatus = useAppSelector(selectAgentStatus);

  return (
    <div
      className={styles.container}
      style={{
        backgroundColor: COLORS.boxBackgroundDark,
        borderRightColor: COLORS.borderColor,
      }}
    >
      <div
        className={styles.iconContainer}
        style={{ opacity: mode === "files" ? 1 : 0.5 }}
        onClick={() => onModeChange("files")}
        title="Files"
      >
        <FileIcon color={COLORS.iconActiveColor} />
      </div>

      {agentStatus === "installed" && (
        <div
          className={styles.iconContainer}
          style={{ opacity: mode === "debug" ? 1 : 0.5 }}
          onClick={() => onModeChange("debug")}
          title="Debug"
        >
          <DebugIcon color={COLORS.iconActiveColor} size="24px" />
        </div>
      )}
    </div>
  );
};
