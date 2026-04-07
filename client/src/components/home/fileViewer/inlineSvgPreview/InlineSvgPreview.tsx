import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import styles from "./InlineSvgPreview.module.css";
import { BG_OPTIONS, type BgKey } from "../componentPreview/bgOptions";

export interface IInlineSvgPreviewProps {
  /** Raw SVG-текст (содержимое файла) */
  content: string;
  alt?: string;
  bg?: BgKey;
  onBgChange?: Dispatch<SetStateAction<BgKey>>;
}

const BG_CLASS: Record<BgKey, string> = {
  white:   styles.bgWhite,
  light:   styles.bgLight,
  gray:    styles.bgGray,
  dark:    styles.bgDark,
  checker: styles.bgChecker,
};

/**
 * Нормализует SVG-строку перед рендером:
 *  - убирает trailing ";" (артефакт JSX/TS файлов где SVG — выражение)
 */
const normalizeSvg = (raw: string): string => {
  let s = raw.trim();
  if (s.endsWith(";")) s = s.slice(0, -1).trimEnd();
  return s;
};

/**
 * Рендерит raw SVG-разметку как картинку через Blob URL.
 */
export const InlineSvgPreview = ({
  content,
  alt = "svg preview",
  bg = "checker",
  onBgChange,
}: IInlineSvgPreviewProps) => {
  const [blobUrl, setBlobUrl] = useState<string>("");

  useEffect(() => {
    const normalized = normalizeSvg(content);
    const blob = new Blob([normalized], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [content]);

  if (!blobUrl) return null;

  return (
    <div className={styles.wrapper}>
      {onBgChange && (
        <div className={styles.bgBar}>
          <span className={styles.bgLabel}>Фон:</span>
          {BG_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              title={label}
              className={[
                styles.bgBtn,
                BG_CLASS[key],
                bg === key ? styles.bgBtnActive : "",
              ].join(" ")}
              onClick={() => onBgChange(key)}
            />
          ))}
        </div>
      )}
      <div className={[styles.center, BG_CLASS[bg]].join(" ")}>
        <img src={blobUrl} alt={alt} className={styles.image} />
      </div>
    </div>
  );
};
