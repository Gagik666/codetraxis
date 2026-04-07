export type BgKey = "white" | "light" | "gray" | "dark" | "checker";

export interface BgOption {
  key: BgKey;
  label: string;
  /** CSS-класс из ComponentPreview.module.css / InlineSvgPreview.module.css */
  cssKey: string;
  /** Цвет для подстановки в iframe srcdoc. "checker" — особый случай */
  iframeColor: string;
}

export const BG_OPTIONS: BgOption[] = [
  { key: "white",   label: "Белый",    cssKey: "bgWhite",   iframeColor: "#ffffff" },
  { key: "light",   label: "Светлый",  cssKey: "bgLight",   iframeColor: "#f0f0f0" },
  { key: "gray",    label: "Серый",    cssKey: "bgGray",    iframeColor: "#808080" },
  { key: "dark",    label: "Тёмный",   cssKey: "bgDark",    iframeColor: "#1a1a1a" },
  { key: "checker", label: "Шахматка", cssKey: "bgChecker", iframeColor: "checker" },
];
