import { useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { COLORS } from "../../../constants/colors/colors";
import { useAppSelector } from "../../../hooks/redux/useRedux";
import { selectFile, selectFileLoading, clearFile } from "../../../redux/fileSlice/FileSlice";
import type { AppDispatch } from "../../../redux/Store";
import { CodePane } from "./codePane/CodePane";
import { PreviewPane } from "./previewPane/PreviewPane";
import { ViewModeSwitcher } from "./viewModeSwitcher/ViewModeSwitcher";
import { getLanguageFromPath } from "./utils/fileTypeUtils";
import type { ViewMode } from "./utils/fileTypeUtils";
import styles from "./FileViewer.module.css";

export const FileViewer = () => {
  const dispatch = useDispatch<AppDispatch>();
  const file = useAppSelector(selectFile);
  const loading = useAppSelector(selectFileLoading);
  const [mode, setMode] = useState<ViewMode>("code");

  const language = useMemo(
    () => (file ? getLanguageFromPath(file.path) : "plaintext"),
    [file]
  );

  if (loading) {
    return (
      <div className={styles.loading} style={{ color: COLORS.secondaryText }}>
        Загрузка...
      </div>
    );
  }

  if (!file) {
    return (
      <div className={styles.empty} style={{ color: COLORS.secondaryText }}>
        Выберите файл для просмотра
      </div>
    );
  }

  const fileName = file.path.split("/").pop() ?? file.path;
  const fileDirPath = file.path.split("/").slice(0, -1).join("/");

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div
        className={styles.header}
        style={{
          backgroundColor: COLORS.boxBackgroundDark,
          borderBottomColor: COLORS.borderColor,
          color: COLORS.secondaryText,
        }}
      >
        <div className={styles.headerLeft}>
          <span className={styles.fileName}>{fileName}</span>
          {fileDirPath && (
            <span className={styles.filePath}>{fileDirPath}</span>
          )}
          <button
            type="button"
            className={styles.closeBtn}
            title="Закрыть файл"
            onClick={() => dispatch(clearFile())}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>
        </div>

        <ViewModeSwitcher mode={mode} onChange={setMode} />
      </div>

      {/* ── Panels ── */}
      {mode === "code" && (
        <div className={styles.pane}>
          <CodePane
            filePath={file.path}
            content={file.content}
            language={language}
          />
        </div>
      )}

      {mode === "preview" && (
        <div className={styles.pane}>
          <PreviewPane filePath={file.path} source={file.content} />
        </div>
      )}

      {mode === "split" && (
        <div className={styles.splitPane}>
          <div className={styles.splitCode}>
            <CodePane
              filePath={file.path}
              content={file.content}
              language={language}
              compact
            />
          </div>
          <div className={styles.splitPreview}>
            <PreviewPane filePath={file.path} source={file.content} />
          </div>
        </div>
      )}
    </div>
  );
};