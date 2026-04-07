import type { ErrorEvent } from "../../../../../redux/debugSlice/types";
import styles from "./ErrorExpanded.module.css";

export const ErrorExpanded = ({ event }: { event: ErrorEvent }) => (
  <div className={styles.expanded}>
    {event.source && (
      <div className={styles.metaRow} style={{ marginBottom: 12 }}>
        <span className={styles.metaItem}>
          <span className={styles.metaLabel}>Source</span>
          <span>{event.source}</span>
        </span>
      </div>
    )}
    {event.stack && <pre className={styles.stackTrace}>{event.stack}</pre>}
  </div>
);
