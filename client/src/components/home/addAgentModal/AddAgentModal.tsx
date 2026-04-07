import { useState } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../../../redux/Store";
import {
  setAgentStatus,
  setAgentError,
  setInstalledInFile,
} from "../../../redux/debugSlice/DebugSlice";
import { agentApi } from "../../../axios/agent/agentApi";
import styles from "./AddAgentModal.module.css";

interface IAddAgentModalProps {
  onClose: () => void;
  onInstalled: () => void;
}

const FEATURES = [
  { label: "console.log / info / warn / error",    color: "#4a9eff" },
  { label: "fetch  (web & React Native)",           color: "#34d399" },
  { label: "XMLHttpRequest",                        color: "#34d399" },
  { label: "axios  (via XHR / fetch interception)", color: "#34d399" },
];

export const AddAgentModal = ({ onClose, onInstalled }: IAddAgentModalProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    dispatch(setAgentStatus("installing"));

    try {
      const result = await agentApi.install();

      if (!result.success) {
        setError(result.error ?? "Installation failed");
        dispatch(setAgentError(result.error ?? "Installation failed"));
        return;
      }

      dispatch(setInstalledInFile(result.entryFile ?? "unknown"));
      onInstalled();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setError(msg);
      dispatch(setAgentError(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="#4a9eff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <div className={styles.title}>Install Debug Agent</div>
            <div className={styles.subtitle}>Auto-injected into your project entry file</div>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.sectionLabel}>Intercepts</div>
          <ul className={styles.featureList}>
            {FEATURES.map(f => (
              <li key={f.label} className={styles.featureItem}>
                <span className={styles.dot} style={{ background: f.color }} />
                <span>{f.label}</span>
              </li>
            ))}
          </ul>

          <div className={styles.note}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>
              Adds{" "}
              <code className={styles.noteCode}>import "./codetraxisAgent"</code>
              {" "}to your entry file. Works with React (web) and React Native / Expo.
            </span>
          </div>
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
          <button className={styles.btnConfirm} onClick={handleConfirm} disabled={loading}>
            {loading ? "Installing…" : "Install Agent"}
          </button>
        </div>

      </div>
    </div>
  );
};
