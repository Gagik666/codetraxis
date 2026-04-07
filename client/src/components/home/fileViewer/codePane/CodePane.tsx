import Editor from "@monaco-editor/react";
import { COLORS } from "../../../../constants/colors/colors";
import styles from "./CodePane.module.css";

interface ICodePaneProps {
  filePath: string;
  content: string;
  language: string;
  /** В split-режиме minimap убирается чтобы не давить ширину */
  compact?: boolean;
}

export const CodePane = ({
  filePath,
  content,
  language,
  compact = false,
}: ICodePaneProps) => {
  return (
    <div className={styles.container}>
      <Editor
        path={filePath}
        language={language}
        value={content}
        theme="vs-dark"
        loading={
          <div className={styles.loading} style={{ color: COLORS.secondaryText }}>
            Загрузка редактора...
          </div>
        }
        options={{
          readOnly: true,
          minimap: { enabled: !compact },
          fontSize: 14,
          wordWrap: "on",
          automaticLayout: true,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          renderLineHighlight: "line",
          padding: { top: 12, bottom: 12 },
        }}
      />
    </div>
  );
};
