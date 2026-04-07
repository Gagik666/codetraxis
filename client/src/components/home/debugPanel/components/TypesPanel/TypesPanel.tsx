import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { generateTypes } from "../../utils/generateTypes";
import styles from "./TypesPanel.module.css";

interface TypesPanelProps {
  code?: string;
  initialTab?: PanelTab;
  onClose: () => void;
}

type PanelTab = "generated" | "custom";

const MONACO_OPTIONS = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13,
  lineHeight: 22,
  fontFamily: '"Fira Code", "SF Mono", "Consolas", monospace',
  fontLigatures: true,
  readOnly: false,
  wordWrap: "on" as const,
  padding: { top: 16, bottom: 16 },
  lineNumbers: "off" as const,
  folding: true,
  glyphMargin: false,
  renderLineHighlight: "none" as const,
  scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
  overviewRulerLanes: 0,
} as const;

export const TypesPanel = ({ code = "", initialTab = "generated", onClose }: TypesPanelProps) => {
  const [activeTab, setActiveTab] = useState<PanelTab>(initialTab);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(480);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelRef.current?.offsetWidth ?? panelWidth;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const newWidth = Math.min(Math.max(startWidth + delta, 280), window.innerWidth * 0.9);
      setPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Generated tab: editable Monaco value
  const [generatedValue, setGeneratedValue] = useState(code);

  // Custom JSON tab state
  const [customJson, setCustomJson] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [customResult, setCustomResult] = useState<string | null>(null);

  // Sync generated value when code prop changes
  useEffect(() => {
    setGeneratedValue(code);
  }, [code]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const activeCode = activeTab === "generated" ? generatedValue : (customResult ?? "");

  const handleCopy = () => {
    if (!activeCode) return;
    navigator.clipboard.writeText(activeCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleGenerate = () => {
    setCustomError(null);
    setCustomResult(null);
    let parsed: unknown;
    try {
      // Normalize Python-style literals → JSON before parsing
      const normalized = customJson
        .trim()
        .replace(/:\s*True\b/g, ": true")
        .replace(/:\s*False\b/g, ": false")
        .replace(/:\s*None\b/g, ": null")
        .replace(/,\s*True\b/g, ", true")
        .replace(/,\s*False\b/g, ", false")
        .replace(/,\s*None\b/g, ", null")
        .replace(/\[\s*True\b/g, "[ true")
        .replace(/\[\s*False\b/g, "[ false")
        .replace(/\[\s*None\b/g, "[ null");
      parsed = JSON.parse(normalized);
    } catch {
      setCustomError("Invalid JSON — please check the syntax");
      return;
    }
    setCustomResult(generateTypes(parsed, "Root"));
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} ref={panelRef} style={{ width: panelWidth }}>
        {/* Resize handle */}
        <div className={styles.resizeHandle} onMouseDown={handleResizeMouseDown} />
        <div className={styles.header}>
          <span className={styles.title}>
            TS Types
            <span className={styles.titleBadge}>.ts</span>
          </span>
          <div className={styles.headerActions}>
            {/* Copy button — only when there's output */}
            {activeCode && (
              <button
                className={`${styles.iconBtn} ${copied ? styles.copyDone : ""}`}
                onClick={handleCopy}
                title="Copy types"
              >
                {copied ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            )}
            {/* Close button */}
            <button
              className={`${styles.iconBtn} ${styles.iconBtnClose}`}
              onClick={onClose}
              title="Close (Esc)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs — hide Generated tab when panel was opened in custom-only mode */}
        <div className={styles.tabs}>
          {initialTab !== "custom" && (
            <button
              className={`${styles.tab} ${activeTab === "generated" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("generated")}
            >
              Generated
            </button>
          )}
          <button
            className={`${styles.tab} ${activeTab === "custom" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("custom")}
          >
            Custom JSON
          </button>
        </div>

        {/* Body */}
        {activeTab === "generated" ? (
          <div className={styles.editorWrap}>
            <Editor
              language="typescript"
              value={generatedValue}
              theme="vs-dark"
              options={MONACO_OPTIONS}
              onChange={(val) => setGeneratedValue(val ?? "")}
            />
          </div>
        ) : (
          <div className={styles.customTab}>
            {/* JSON input editor */}
            <div className={styles.customSection}>
              <p className={styles.customSectionLabel}>JSON input</p>
              <div className={styles.customEditorWrap}>
                <Editor
                  language="json"
                  value={customJson}
                  theme="vs-dark"
                  options={MONACO_OPTIONS}
                  onChange={(val) => {
                    setCustomJson(val ?? "");
                    setCustomError(null);
                  }}
                />
              </div>
              {customError && (
                <p className={styles.customError}>{customError}</p>
              )}
              <div className={styles.customActions}>
                <button className={styles.genBtn} onClick={handleGenerate}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  Generate types
                </button>
              </div>
            </div>

            {/* Result editor — shown only after generation */}
            {customResult !== null && (
              <div className={styles.customSection}>
                <p className={styles.customSectionLabel}>Result</p>
                <div className={styles.customEditorWrap}>
                  <Editor
                    language="typescript"
                    value={customResult}
                    theme="vs-dark"
                    options={MONACO_OPTIONS}
                    onChange={(val) => setCustomResult(val ?? "")}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
