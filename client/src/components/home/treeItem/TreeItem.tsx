import type { CSSProperties } from "react";
import { useState } from "react";
import type { TGitStatus, TTreeNode } from "../../../axios/tree/treeModel";
import styles from "./TreeItem.module.css";

interface ITreeItemProps extends TTreeNode {
  depth?: number;
  selectedPath?: string;
  onFileClick?: (node: TTreeNode) => void;
}

// Короткий лейбл для бейджа
const GIT_LABEL: Record<TGitStatus, string> = {
  modified:   "M",
  untracked:  "U",
  added:      "A",
  deleted:    "D",
  renamed:    "R",
  conflicted: "!",
  clean:      "",
};

// CSS-класс для имени файла
const GIT_NAME_CLASS: Record<TGitStatus, string> = {
  modified:   styles.nameModified,
  untracked:  styles.nameUntracked,
  added:      styles.nameAdded,
  deleted:    styles.nameDeleted,
  renamed:    styles.nameRenamed,
  conflicted: styles.nameConflicted,
  clean:      "",
};

// CSS-класс для бейджа
const GIT_BADGE_CLASS: Record<TGitStatus, string> = {
  modified:   styles.modified,
  untracked:  styles.untracked,
  added:      styles.added,
  deleted:    styles.deleted,
  renamed:    styles.renamed,
  conflicted: styles.conflicted,
  clean:      "",
};

export const TreeItem = ({
  name,
  path,
  type,
  gitStatus,
  children,
  depth = 0,
  selectedPath,
  onFileClick,
}: ITreeItemProps) => {
  const [open, setOpen] = useState(false);
  const isFolder = type === "folder";
  const hasChildren = (children?.length ?? 0) > 0;
  const isSelected = !isFolder && path === selectedPath;

  const handleClick = () => {
    if (isFolder) {
      if (hasChildren) setOpen((prev) => !prev);
      return;
    }
    onFileClick?.({ name, path, type, gitStatus, children });
  };

  const rowStyle = { ["--depth" as any]: depth } as CSSProperties;

  const rowClass = [
    styles.row,
    isSelected ? styles.rowSelected : "",
  ].filter(Boolean).join(" ");

  const nameClass = gitStatus && gitStatus !== "clean"
    ? `${styles.name} ${GIT_NAME_CLASS[gitStatus]}`
    : styles.name;

  const badgeLabel = gitStatus ? GIT_LABEL[gitStatus] : "";
  const badgeClass = gitStatus && gitStatus !== "clean"
    ? `${styles.gitBadge} ${GIT_BADGE_CLASS[gitStatus]}`
    : "";

  return (
    <div className={styles.item}>
      <div className={rowClass} style={rowStyle} onClick={handleClick}>
        <span className={styles.caret}>
          {isFolder ? (open ? "▾" : "▸") : ""}
        </span>
        <span className={styles.icon}>{isFolder ? "📂" : "📄"}</span>
        <span className={nameClass}>{name}</span>
        {badgeLabel && (
          <span className={badgeClass}>{badgeLabel}</span>
        )}
      </div>
      {isFolder && open && hasChildren ? (
        <div className={styles.children}>
          {children!.map((child) => (
            <TreeItem
              key={child.path}
              depth={depth + 1}
              selectedPath={selectedPath}
              onFileClick={onFileClick}
              {...child}
            />
          ))}
        </div>
      ) : null}
      {isFolder && open && !hasChildren ? (
        <div className={styles.emptyFolder} style={rowStyle}>
          Пусто
        </div>
      ) : null}
    </div>
  );
};
