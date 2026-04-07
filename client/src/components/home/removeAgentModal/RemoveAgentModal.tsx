import { useState } from "react";
import styles from "./RemoveAgentModal.module.css";

interface RemoveAgentModalProps {
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const RemoveAgentModal = ({ onClose, onConfirm }: RemoveAgentModalProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Removal failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </div>
          <div>
            <div className={styles.title}>Remove Debug Agent</div>
            <div className={styles.subtitle}>This action cannot be undone</div>
          </div>
        </div>

        <div className={styles.body}>
          The agent import line and the{" "}
          <code className={styles.code}>codetraxisAgent/</code>{" "}
          folder will be permanently removed from your project.
          Debug interception will stop immediately.
        </div>

        {error && (
          <div className={styles.error}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className={styles.btnRemove} onClick={handleConfirm} disabled={loading}>
            {loading ? "Removing…" : "Remove Agent"}
          </button>
        </div>

      </div>
    </div>
  );
};
