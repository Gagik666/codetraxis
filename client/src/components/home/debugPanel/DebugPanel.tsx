import { useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../../../redux/Store";
import {
  clearEvents,
  setFilter,
  selectFilter,
  selectAllEvents,
} from "../../../redux/debugSlice/DebugSlice";
import { useAppSelector } from "../../../hooks/redux/useRedux";
import { FILTERS, applyFilter, getFilterCount } from "./utils/filters";
import { TimelineItem } from "./components/TimelineItem/TimelineItem";
import { EmptyState } from "./components/EmptyState/EmptyState";
import { TypesPanel } from "./components/TypesPanel/TypesPanel";
import styles from "./DebugPanel.module.css";

export const DebugPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const filter = useAppSelector(selectFilter);
  const allEvents = useAppSelector(selectAllEvents);

  const events = applyFilter(allEvents, filter);

  const [openId, setOpenId] = useState<string | null>(null);
  const [typesOpen, setTypesOpen] = useState(false);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Timeline</span>
        <div className={styles.filterBar}>
          {FILTERS.map((f) => {
            const count = getFilterCount(allEvents, f.key);
            return (
              <button
                key={f.key}
                className={`${styles.filterBtn} ${filter === f.key ? styles.filterBtnActive : ""}`}
                onClick={() => {
                  dispatch(setFilter(f.key));
                  setOpenId(null);
                }}
              >
                {f.label}
                {count > 0 && (
                  <span
                    className={`${styles.filterCount} ${filter === f.key ? styles.filterCountActive : ""}`}
                  >
                    {count > 999 ? "999+" : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className={styles.headerActions}>
          <button
            className={`${styles.iconBtn} ${styles.typesBtn} ${typesOpen ? styles.typesBtnActive : ""}`}
            title="Open Types panel"
            onClick={() => setTypesOpen((v) => !v)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </button>
          <button
            className={styles.iconBtn}
            title="Clear"
            onClick={() => {
              dispatch(clearEvents());
              setOpenId(null);
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>
        </div>
      </div>

      <div className={styles.timeline}>
        {events.length === 0 ? (
          <EmptyState />
        ) : (
          events.map((event, i) => (
            <TimelineItem
              key={event.id}
              event={event}
              prevTs={events[i + 1]?.timestamp}
              isOpen={openId === event.id}
              onToggle={() =>
                setOpenId((prev) => (prev === event.id ? null : event.id))
              }
            />
          ))
        )}
      </div>

      {typesOpen &&
        createPortal(
          <TypesPanel
            initialTab="custom"
            onClose={() => setTypesOpen(false)}
          />,
          document.body,
        )}
    </div>
  );
};
