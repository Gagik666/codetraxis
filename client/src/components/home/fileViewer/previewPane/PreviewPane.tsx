import { getPreviewKind, getRawFileUrl } from "../utils/fileTypeUtils";
import { ComponentPreview } from "../componentPreview/ComponentPreview";
import { InlineSvgPreview } from "../inlineSvgPreview/InlineSvgPreview";
import styles from "./PreviewPane.module.css";

interface IPreviewPaneProps {
  filePath: string;
  /** Текстовое содержимое файла */
  source?: string;
}

export const PreviewPane = ({ filePath, source = "" }: IPreviewPaneProps) => {
  // Передаём source — чтобы .svg и любой raw SVG-текст попал в "inline-svg"
  const kind = getPreviewKind(filePath, source);
  const url = getRawFileUrl(filePath);

  if (kind === "inline-svg") {
    return <InlineSvgPreview content={source} alt={filePath} />;
  }

  if (kind === "image") {
    return (
      <div className={styles.center}>
        <img src={url} alt={filePath} className={styles.image} />
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div className={styles.center}>
        <video src={url} controls className={styles.media} />
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <div className={styles.center}>
        <audio src={url} controls className={styles.audio} />
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <iframe
        src={url}
        title={filePath}
        className={styles.frame}
      />
    );
  }

  if (kind === "component") {
    return <ComponentPreview filePath={filePath} source={source} />;
  }

  // kind === "none"
  return (
    <div className={styles.unavailable}>
      Preview недоступен для этого типа файла
    </div>
  );
};
