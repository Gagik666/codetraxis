export type ViewMode = "code" | "preview" | "split";

export type PreviewKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "inline-svg"  // raw SVG-текст в file.content (.svg или любой файл с <svg>)
  | "component"   // js/jsx/ts/tsx SVG-компонент или Lottie JSON
  | "none";

// ─── Monaco language ──────────────────────────────────────────────────────────

export const getLanguageFromPath = (filePath: string): string => {
  const ext = filePath.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "scss":
      return "scss";
    case "less":
      return "less";
    case "html":
      return "html";
    case "md":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";
    case "xml":
    case "svg":
      return "xml";
    case "sh":
    case "bash":
    case "zsh":
      return "shell";
    case "py":
      return "python";
    case "go":
      return "go";
    case "rs":
      return "rust";
    case "java":
      return "java";
    case "c":
    case "h":
      return "c";
    case "cpp":
    case "hpp":
      return "cpp";
    case "toml":
      return "ini";
    case "graphql":
    case "gql":
      return "graphql";
    case "prisma":
      return "prisma";
    case "sql":
      return "sql";
    case "dockerfile":
      return "dockerfile";
    default:
      return "plaintext";
  }
};

// ─── Preview type ─────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif",
  // svg намеренно убран — обрабатывается через inline-svg когда content уже есть
]);
const SVG_EXTS   = new Set(["svg"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "ogg", "mov"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac"]);
const COMPONENT_EXTS = new Set(["js", "jsx", "ts", "tsx", "json"]);

/** Быстрая проверка: является ли строка raw SVG-разметкой.
 *  Обрабатывает trailing ";" — артефакт JSX/TS файлов вида "<svg>...</svg>;"
 */
export const isRawSvgContent = (source: string): boolean => {
  // убираем trailing ";" перед проверкой
  const t = source.trim().replace(/;$/, "").trimEnd();
  return (
    t.startsWith("<svg") ||
    t.startsWith("<?xml") ||
    (t.includes("<svg") && t.includes("</svg>"))
  );
};

/**
 * Определяет тип preview по расширению файла и опционально по содержимому.
 * source передаётся когда контент уже загружен (для inline-svg и component).
 */
export const getPreviewKind = (filePath: string, source?: string): PreviewKind => {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext) return "none";

  // .svg + есть контент → inline-svg (Blob URL, не нужен /api/file/raw)
  if (SVG_EXTS.has(ext) && source) return "inline-svg";
  // .svg без контента (редкий случай) → image через URL
  if (SVG_EXTS.has(ext)) return "image";

  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (COMPONENT_EXTS.has(ext)) return "component";

  // Любое другое расширение, но содержимое — raw SVG
  if (source && isRawSvgContent(source)) return "inline-svg";

  return "none";
};

// ─── Raw URL builder ──────────────────────────────────────────────────────────

export const getRawFileUrl = (filePath: string): string =>
  `/api/file/raw?path=${encodeURIComponent(filePath)}`;
