import type { ReactElement } from "react";
import type { ViewMode } from "../utils/fileTypeUtils";
import styles from "./ViewModeSwitcher.module.css";

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const CodeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const PreviewIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const SplitIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="12" y1="3" x2="12" y2="21" />
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

interface IViewModeSwitcherProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: { value: ViewMode; label: string; Icon: () => ReactElement }[] = [
  { value: "code",    label: "Code",    Icon: CodeIcon    },
  { value: "preview", label: "Preview", Icon: PreviewIcon },
  { value: "split",   label: "Split",   Icon: SplitIcon   },
];

export const ViewModeSwitcher = ({ mode, onChange }: IViewModeSwitcherProps) => {
  return (
    <div className={styles.switcher}>
      {MODES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          title={label}
          className={`${styles.btn} ${mode === value ? styles.btnActive : ""}`}
          onClick={() => onChange(value)}
        >
          <Icon />
          <span className={styles.label}>{label}</span>
        </button>
      ))}
    </div>
  );
};
