import type { DebugEvent, NetworkEvent, ConsoleEvent } from "../../../../../redux/debugSlice/types";
import { formatTime, formatDelta } from "../../utils/formatters";
import { getTitleColor, getTitle, getPreview } from "../../utils/colors";
import { NetworkExpanded } from "../NetworkExpanded/NetworkExpanded";
import { ConsoleExpanded } from "../ConsoleExpanded/ConsoleExpanded";
import styles from "./TimelineItem.module.css";

export const TimelineItem = ({
  event,
  prevTs,
  isOpen,
  onToggle,
}: {
  event: DebugEvent;
  prevTs?: number;
  isOpen: boolean;
  onToggle: () => void;
}) => {
  const title = getTitle(event);
  const preview = getPreview(event);
  const titleClr = getTitleColor(event);
  const delta = prevTs != null ? formatDelta(event.timestamp - prevTs) : null;

  return (
    <div className={`${styles.item} ${isOpen ? styles.itemOpen : ""}`}>
      <div className={styles.itemHeader} onClick={onToggle}>
        <span className={styles.timestamp}>{formatTime(event.timestamp)}</span>
        <span className={styles.delta}>{delta ?? ""}</span>
        <span className={styles.titleBadge} style={{ color: titleClr }}>
          {title}
        </span>
        {!isOpen && <span className={styles.preview}>{preview}</span>}
        <span className={styles.spacer} />
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {isOpen && (
        <>
          {event.type === "network" && (
            <NetworkExpanded event={event as NetworkEvent} />
          )}
          {event.type === "console" && (
            <ConsoleExpanded event={event as ConsoleEvent} />
          )}
        </>
      )}
    </div>
  );
};
