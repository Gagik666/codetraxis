/**
 * Строит полный HTML-документ для srcdoc iframe.
 *
 * Runtime внутри iframe:
 *  - React + ReactDOM (из esm.sh CDN)
 *  - react-native-svg shim (Svg, Path, Rect, Circle, G, Defs, LinearGradient,
 *    RadialGradient, Stop, ClipPath, Mask, Use, Symbol, Text, TSpan, Image,
 *    Line, Polyline, Polygon, Ellipse, ForeignObject)
 *  - lottie-web (для Lottie JSON)
 *
 * Стратегия resolve импортов (CommonJS после Babel):
 *   require("react")            → глобальный React
 *   require("react-native-svg") → глобальный RNSvg shim
 *   все остальные require()     → {} (silently ignored)
 *
 * Ключевое решение для изоляции:
 *   Transpiled код передаётся как JSON-строка и выполняется через
 *   new Function(...) чтобы "use strict" и var-объявления Babel не
 *   конфликтовали с объявлениями в ES-модульном скопе iframe.
 */

export type IframePayload =
  | { type: "svg-component"; transpiledCode: string; filePath: string }
  | { type: "lottie"; animationData: string };

export const buildIframeHtml = (payload: IframePayload): string => {
  const body =
    payload.type === "svg-component"
      ? buildSvgComponentBody(payload.transpiledCode, payload.filePath)
      : buildLottieBody(payload.animationData);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: #1a1a1a;
  }
  svg { max-width: 100%; max-height: 100%; }
  .error {
    color: #f87171; font-family: monospace; font-size: 12px;
    padding: 16px; white-space: pre-wrap; word-break: break-word;
  }
</style>
</head>
<body>
<div id="root"></div>
${body}
</body>
</html>`;
};

// ─── SVG Component ────────────────────────────────────────────────────────────

const buildSvgComponentBody = (transpiledCode: string, filePath: string): string => {
  // JSON.stringify экранирует код и путь как безопасные строковые литералы
  const codeAsJsonString     = JSON.stringify(transpiledCode);
  const filePathAsJsonString = JSON.stringify(filePath);

  return `
<script type="module">
// ── Debug channel → родительское окно ────────────────────────────────────────
const sendDebug = (payload) =>
  window.parent.postMessage({ type: "codetraxis-preview-debug", payload }, "*");

// ── 1. React runtime ─────────────────────────────────────────────────────────
import ReactModule from "https://esm.sh/react@19?dev";
import { createRoot } from "https://esm.sh/react-dom@19/client?dev";

// ── 2. react-native-svg shim ─────────────────────────────────────────────────
// __esModule: true обязателен — без него _interopRequireWildcard обернёт
// весь объект, и _reactNativeSvg.default станет объектом вместо функции.
const makeSvgEl = (tag) => ({ children, ...props }) =>
  ReactModule.createElement(tag, props, children);

const RNSvg = {
  __esModule: true,
  default:         makeSvgEl("svg"),
  Svg:             makeSvgEl("svg"),
  Path:            makeSvgEl("path"),
  Rect:            makeSvgEl("rect"),
  Circle:          makeSvgEl("circle"),
  Ellipse:         makeSvgEl("ellipse"),
  Line:            makeSvgEl("line"),
  Polyline:        makeSvgEl("polyline"),
  Polygon:         makeSvgEl("polygon"),
  G:               makeSvgEl("g"),
  Defs:            makeSvgEl("defs"),
  Use:             makeSvgEl("use"),
  Symbol:          makeSvgEl("symbol"),
  Text:            makeSvgEl("text"),
  TSpan:           makeSvgEl("tspan"),
  Image:           makeSvgEl("image"),
  ClipPath:        makeSvgEl("clipPath"),
  Mask:            makeSvgEl("mask"),
  Stop:            makeSvgEl("stop"),
  LinearGradient:  makeSvgEl("linearGradient"),
  RadialGradient:  makeSvgEl("radialGradient"),
  ForeignObject:   makeSvgEl("foreignObject"),
  SvgProps: {},
  SvgXmlProps: {},
};

// ── 3. CommonJS shim ─────────────────────────────────────────────────────────
const _require = (mod) => {
  if (mod === "react")            return ReactModule;
  if (mod === "react-native-svg") return RNSvg;
  return {};
};
const _module = { exports: {} };

// ── 4. Выполнение transpiled кода через new Function ─────────────────────────
// new Function изолирует "use strict" и var-объявления Babel от ES-модульного скопа.
// React передаётся явно для Babel classic JSX runtime.
const _code     = ${codeAsJsonString};
const _filePath = ${filePathAsJsonString};

sendDebug({ step: "transpile-start", filePath: _filePath });

try {
  new Function("require", "module", "exports", "React", _code)(
    _require, _module, _module.exports, ReactModule
  );
} catch (err) {
  sendDebug({ step: "eval-error", message: String(err) });
  createRoot(document.getElementById("root")).render(
    ReactModule.createElement("div", { className: "error" },
      "Ошибка выполнения:\\n" + String(err))
  );
  throw err;
}

sendDebug({ step: "module-evaluated", exportKeys: Object.keys(_module.exports) });

// ── 5. Выбор компонента для рендера ──────────────────────────────────────────
// Приоритет: default export → экспорт с именем файла → первый PascalCase export
const mod = _module.exports;

const baseName = _filePath.split("/").pop()?.replace(/\\.[^.]+$/, "") ?? "";

const Component =
  (mod.__esModule && typeof mod.default === "function" ? mod.default : null) ??
  (baseName && typeof mod[baseName] === "function" ? mod[baseName] : null) ??
  Object.entries(mod).find(
    ([key, v]) => key !== "__esModule" && typeof v === "function" && /^[A-Z]/.test(key)
  )?.[1] ??
  null;

sendDebug({
  step: "component-picked",
  selectedName: typeof Component === "function" ? (Component.name || baseName) : null,
  selectedType: typeof Component,
});

// ── 6. Рендер ────────────────────────────────────────────────────────────────
const root = createRoot(document.getElementById("root"));

if (typeof Component === "function") {
  try {
    root.render(ReactModule.createElement(Component));
    sendDebug({ step: "render-success" });
  } catch (err) {
    sendDebug({ step: "render-error", message: String(err) });
    root.render(
      ReactModule.createElement("div", { className: "error" },
        "Ошибка рендера:\\n" + String(err))
    );
  }
} else {
  sendDebug({ step: "render-error", message: "No component found" });
  root.render(
    ReactModule.createElement("div", { className: "error" },
      "Не удалось найти React-компонент для рендера.\\n" +
      "Убедись что файл содержит export default или export const ComponentName."
    )
  );
}
</script>`;
};

// ─── Lottie ───────────────────────────────────────────────────────────────────

const buildLottieBody = (animationData: string): string => `
<script type="module">
import React from "https://esm.sh/react@19?dev";
import { createRoot } from "https://esm.sh/react-dom@19/client?dev";
import Lottie from "https://esm.sh/lottie-react@2?dev";

const data = ${animationData};

const App = () =>
  React.createElement(Lottie, {
    animationData: data,
    loop: true,
    autoplay: true,
    style: { width: "80%", maxWidth: 480 },
  });

createRoot(document.getElementById("root")).render(React.createElement(App));
</script>`;

