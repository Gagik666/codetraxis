import styles from "./EmptyState.module.css";

export const EmptyState = () => (
  <div className={styles.emptyState}>
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={styles.emptyIcon}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
    <p className={styles.emptyTitle}>No Activity</p>
    <p className={styles.emptySubtitle}>
      Once your app connects and starts sending events, they will appear here.
    </p>
  </div>
);
