/**
 * Определяет, можно ли превьюить js/jsx/ts/tsx файл как визуальный компонент.
 *
 * Поддерживаемые kind:
 *  "rn-svg-component"  — React-компонент с import из react-native-svg
 *  "dom-svg-component" — React-компонент с нативными <svg> тегами
 *  "inline-svg"        — raw SVG-разметка внутри .js/.ts/.tsx без React-обёртки
 *  "lottie"            — JSON-анимация Lottie
 *  "none"              — не умеем превьюить
 */

export type ComponentKind =
  | "rn-svg-component"
  | "dom-svg-component"
  | "inline-svg"
  | "lottie"
  | "none";

const COMPONENT_EXTS = new Set(["js", "jsx", "ts", "tsx"]);

/** export default ... или export const/function PascalCase */
const hasComponentExport = (source: string): boolean =>
  /export\s+default\s+\w/.test(source) ||
  /export\s+(const|function|class)\s+[A-Z]\w*/.test(source);

/** import ... from "react-native-svg" */
const hasRNSvgImport = (source: string): boolean =>
  /from\s+["']react-native-svg["']/.test(source);

/** Использует нативные <svg> или <SVG> теги */
const hasDomSvgTag = (source: string): boolean =>
  /<svg[\s>]/i.test(source);

/** Файл — это raw SVG-разметка (не React-компонент) */
const isRawSvg = (source: string): boolean => {
  const t = source.trim().replace(/;$/, "").trimEnd();
  return (
    t.startsWith("<svg") ||
    t.startsWith("<?xml") ||
    (t.includes("<svg") && t.includes("</svg>"))
  );
};

export const detectComponentKind = (
  filePath: string,
  source: string
): ComponentKind => {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  // ── Lottie JSON ──────────────────────────────────────────────────────────
  if (ext === "json") {
    try {
      const parsed = JSON.parse(source);
      if (typeof parsed === "object" && parsed !== null && "v" in parsed && "layers" in parsed) {
        return "lottie";
      }
    } catch {
      // not valid JSON
    }
    return "none";
  }

  if (!COMPONENT_EXTS.has(ext)) return "none";

  // ── react-native-svg компонент ───────────────────────────────────────────
  // Проверяем первым — специфичнее чем dom-svg
  if (hasRNSvgImport(source) && hasComponentExport(source)) {
    return "rn-svg-component";
  }

  // ── DOM svg компонент ────────────────────────────────────────────────────
  if (hasDomSvgTag(source) && hasComponentExport(source)) {
    return "dom-svg-component";
  }

  // ── Raw SVG разметка без React-обёртки ───────────────────────────────────
  if (isRawSvg(source)) {
    return "inline-svg";
  }

  return "none";
};
