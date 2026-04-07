import { useEffect, useMemo, useState } from "react";
import { detectComponentKind } from "./utils/detectComponentKind";
import { transpileSource } from "./utils/transpile";
import { buildIframeHtml } from "./utils/buildIframeHtml";
import { InlineSvgPreview } from "../inlineSvgPreview/InlineSvgPreview";
import { BG_OPTIONS, type BgKey } from "./bgOptions";
import styles from "./ComponentPreview.module.css";

export type { BgKey };

interface IComponentPreviewProps {
  source: string;
  filePath: string;
}

/** Маппинг BgKey → CSS-класс из этого модуля */
const BG_CSS: Record<BgKey, string> = {
  white:   styles.bgWhite,
  light:   styles.bgLight,
  gray:    styles.bgGray,
  dark:    styles.bgDark,
  checker: styles.bgChecker,
};

export const ComponentPreview = ({ source, filePath }: IComponentPreviewProps) => {
  const [bg, setBg] = useState<BgKey>("checker");

  const kind = detectComponentKind(filePath, source);

  // useMemo всегда вызывается до любых return — соблюдение правил хуков
  const html = useMemo(() => {
    if (kind === "inline-svg" || kind === "none") return null;

    if (kind === "lottie") {
      return buildIframeHtml({ type: "lottie", animationData: source });
    }

    if (kind === "rn-svg-component" || kind === "dom-svg-component") {
      const result = transpileSource(source);
      if (!result.ok) {
        return buildErrorHtml(`Ошибка транспиляции:\n${result.error}`);
      }
      return buildIframeHtml({
        type: "svg-component",
        transpiledCode: result.code,
        filePath,
      });
    }

    return null;
  }, [source, kind, filePath]);

  // Слушаем postMessage debug-сообщения из iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "codetraxis-preview-debug") {
        console.log("[preview-debug]", event.data.payload);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Raw SVG внутри .tsx/.ts/.js — рендерим через Blob, не через iframe
  if (kind === "inline-svg") {
    return <InlineSvgPreview content={source} alt={filePath} bg={bg} onBgChange={setBg} />;
  }

  if (!html) {
    return (
      <div className={styles.unavailable}>
        Preview недоступен для этого типа файла
      </div>
    );
  }

  const activeBg = BG_OPTIONS.find((o) => o.key === bg)!;

  return (
    <div className={styles.wrapper}>
      <BgBar active={bg} onChange={setBg} />
      <iframe
        srcDoc={injectBgColor(html, activeBg.iframeColor)}
        sandbox="allow-scripts"
        className={styles.frame}
        title="Component Preview"
      />
    </div>
  );
};

// ─── helpers ─────────────────────────────────────────────────────────────────

const buildErrorHtml = (message: string): string => `<!DOCTYPE html>
<html><head>
<style>
  body { background:#1a1a1a; margin:0; padding:16px; }
  pre  { color:#f87171; font-family:monospace; font-size:12px;
         white-space:pre-wrap; word-break:break-word; }
</style>
</head><body><pre>${message.replace(/</g, "&lt;")}</pre></body></html>`;

/**
 * Заменяет цвет фона в уже сгенерированном HTML iframe.
 * Если выбрана шахматка — подставляем CSS gradient вместо solid color.
 */
const injectBgColor = (html: string, color: string): string => {
  const checkerCss = `
    background-color:#ffffff;
    background-image:
      linear-gradient(45deg,#c8c8c8 25%,transparent 25%),
      linear-gradient(-45deg,#c8c8c8 25%,transparent 25%),
      linear-gradient(45deg,transparent 75%,#c8c8c8 75%),
      linear-gradient(-45deg,transparent 75%,#c8c8c8 75%);
    background-size:16px 16px;
    background-position:0 0,0 8px,8px -8px,-8px 0;
  `.trim();

  const replacement =
    color === "checker"
      ? checkerCss
      : `background:${color};`;

  // Ищем строку `background: #...;` внутри html, body, #root блока и заменяем
  return html.replace(
    /html,\s*body,\s*#root\s*\{([^}]*)\}/,
    (match, inner) => match.replace(inner, inner.replace(/background[^;]*;/, replacement))
  );
};

// ─── BgBar ────────────────────────────────────────────────────────────────────

interface IBgBarProps {
  active: BgKey;
  onChange: (bg: BgKey) => void;
}

const BgBar = ({ active, onChange }: IBgBarProps) => (
  <div className={styles.bgBar}>
    <span className={styles.bgLabel}>Фон:</span>
    {BG_OPTIONS.map(({ key, label }) => (
      <button
        key={key}
        title={label}
        className={[
          styles.bgBtn,
          BG_CSS[key],
          active === key ? styles.bgBtnActive : "",
        ].join(" ")}
        onClick={() => onChange(key)}
      />
    ))}
  </div>
);
