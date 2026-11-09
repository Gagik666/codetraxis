import path from "node:path";
import fs from "node:fs/promises";
import { parse } from "@babel/parser";
import * as t from "@babel/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ProjectKind =
  | "vite-react"
  | "cra-react"
  | "webpack-react"
  | "nextjs"
  | "expo"
  | "react-native"
  | "plain-web"
  | "unknown";

export interface BootstrapFile {
  file: string;
  reason: string;
  confidence: number; // 0–1
}

export type InstallStrategy =
  | { strategy: "inject-import"; targetFile: string; reason: string; confidence: number }
  | { strategy: "patch-html";    htmlFile: string;   scriptSrc: string; reason: string; confidence: number }
  | { strategy: "manual";        reason: string };

export interface InstallResult {
  success: boolean;
  alreadyInstalled: boolean;
  entryFile?: string;
  agentFile?: string;
  projectKind?: ProjectKind;
  strategy?: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as Record<string, unknown>;
  } catch { return null; }
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — detect project kind
// ─────────────────────────────────────────────────────────────────────────────

export async function detectProjectKind(targetDir: string): Promise<ProjectKind> {
  const pkg = await readJson(path.join(targetDir, "package.json"));
  if (!pkg) return "unknown";

  const deps = {
    ...((pkg.dependencies ?? {}) as Record<string, string>),
    ...((pkg.devDependencies ?? {}) as Record<string, string>),
  };

  if (deps["next"]) return "nextjs";
  if (deps["expo"] || deps["@expo/cli"] || deps["expo-router"]) return "expo";
  if (deps["react-native"] && !deps["expo"]) return "react-native";
  // react-scripts takes priority over vite (project may have both)
  if (deps["react-scripts"]) return "cra-react";
  if (deps["vite"] || deps["@vitejs/plugin-react"] || deps["@vitejs/plugin-react-swc"]) return "vite-react";
  if (deps["webpack"] || deps["@webpack-cli/generators"]) return "webpack-react";
  if (await fileExists(path.join(targetDir, "index.html")) && !deps["react"]) return "plain-web";
  if (deps["react"]) return "webpack-react";
  return "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — semantic bootstrap scan
// ─────────────────────────────────────────────────────────────────────────────

const WEB_BOOTSTRAP_PATTERNS = [
  /createRoot\s*\(/,
  /ReactDOM\.render\s*\(/,
  /hydrateRoot\s*\(/,
];

const RN_BOOTSTRAP_PATTERNS = [
  /registerRootComponent\s*\(/,
  /AppRegistry\.registerComponent\s*\(/,
  /AppRegistry\.registerHeadlessTask\s*\(/,
];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".expo", "coverage", "__tests__"]);

async function scanDirForPattern(
  dir: string,
  patterns: RegExp[],
  maxDepth = 3,
  _depth = 0,
): Promise<BootstrapFile | null> {
  if (_depth > maxDepth) return null;
  let entries: import("node:fs").Dirent[];
  try { entries = await fs.readdir(dir, { withFileTypes: true }) as import("node:fs").Dirent[]; } catch { return null; }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const found = await scanDirForPattern(full, patterns, maxDepth, _depth + 1);
      if (found) return found;
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.(test|spec|stories)\.(tsx?|jsx?)$/.test(entry.name)) {
      let source: string;
      try { source = await fs.readFile(full, "utf-8"); } catch { continue; }
      for (const pattern of patterns) {
        if (pattern.test(source)) {
          return { file: full, reason: `matches ${pattern}`, confidence: 0.9 };
        }
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — per-framework adapters
// ─────────────────────────────────────────────────────────────────────────────

async function resolveVitePlan(targetDir: string): Promise<InstallStrategy> {
  // 1. Try to find <script type="module" src="..."> in index.html
  for (const htmlPath of ["index.html", "public/index.html"]) {
    const htmlFile = path.join(targetDir, htmlPath);
    if (!(await fileExists(htmlFile))) continue;

    const html = await fs.readFile(htmlFile, "utf-8");
    const match =
      html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i) ??
      html.match(/<script[^>]+src=["']([^"']+)["'][^>]+type=["']module["']/i);

    if (match) {
      const scriptFile = path.join(targetDir, match[1].replace(/^\//, ""));
      if (await fileExists(scriptFile)) {
        return { strategy: "inject-import", targetFile: scriptFile, confidence: 0.95,
          reason: `Vite: index.html <script type="module" src="${match[1]}">` };
      }
    }
  }

  // 2. Semantic scan — look for createRoot / ReactDOM.render in JS/JSX/TS/TSX
  const found = await scanDirForPattern(targetDir, WEB_BOOTSTRAP_PATTERNS);
  if (found) return { strategy: "inject-import", targetFile: found.file, confidence: found.confidence,
    reason: `Vite semantic: ${found.reason}` };

  // 3. Well-known candidate filenames
  const found2 = await resolveCandidateFallback(targetDir);
  if (found2.strategy === "inject-import") return { ...found2, reason: `Vite candidate: ${found2.reason}` };

  // 4. Last resort — patch index.html if it exists
  for (const htmlPath of ["index.html", "public/index.html"]) {
    const htmlFile = path.join(targetDir, htmlPath);
    if (await fileExists(htmlFile)) {
      return { strategy: "patch-html", htmlFile, scriptSrc: "/codetraxisAgent.js",
        confidence: 0.5, reason: "Vite: index.html found, no JS entry detected" };
    }
  }

  return { strategy: "manual", reason: "Vite project: no entry file found" };
}

async function resolveNextjsPlan(targetDir: string): Promise<InstallStrategy> {
  const candidates = [
    "src/app/layout.tsx", "src/app/layout.jsx",
    "app/layout.tsx",     "app/layout.jsx",
    "src/pages/_app.tsx", "src/pages/_app.jsx",
    "pages/_app.tsx",     "pages/_app.jsx",
  ];
  for (const c of candidates) {
    const full = path.join(targetDir, c);
    if (await fileExists(full)) {
      return { strategy: "inject-import", targetFile: full, confidence: 0.9, reason: `Next.js: found ${c}` };
    }
  }
  return { strategy: "manual", reason: "Next.js: no _app / layout file found" };
}

async function resolveExpoPlan(targetDir: string): Promise<InstallStrategy> {
  const pkg = await readJson(path.join(targetDir, "package.json"));
  const mainField = pkg?.main && typeof pkg.main === "string" ? pkg.main : null;

  // ── 1. expo-router: "main" === "expo-router/entry" or expo-router dep ────
  //    Entry point is the root layout: app/_layout.tsx (or app/_layout.jsx, etc.)
  const isExpoRouter =
    mainField === "expo-router/entry" ||
    !!(pkg?.dependencies as Record<string, string> | undefined)?.["expo-router"] ||
    !!(pkg?.devDependencies as Record<string, string> | undefined)?.["expo-router"];

  if (isExpoRouter) {
    const routerLayouts = [
      "app/_layout.tsx", "app/_layout.jsx", "app/_layout.ts", "app/_layout.js",
      "src/app/_layout.tsx", "src/app/_layout.jsx",
    ];
    for (const c of routerLayouts) {
      const full = path.join(targetDir, c);
      if (await fileExists(full)) {
        return { strategy: "inject-import", targetFile: full, confidence: 0.95,
          reason: `Expo Router: found ${c}` };
      }
    }
    // expo-router detected but no _layout — fall through to other methods
  }

  // ── 2. package.json "main" — file path (not a node module) ───────────────
  if (mainField && !mainField.includes("/node_modules") && !mainField.startsWith("@") && !mainField.includes("expo-router")) {
    const mainFile = path.join(targetDir, mainField);
    if (await fileExists(mainFile)) {
      return { strategy: "inject-import", targetFile: mainFile, confidence: 0.95,
        reason: `Expo: package.json "main": "${mainField}"` };
    }
    // Try resolving without/with extension
    const base = mainFile.replace(/\.[jt]sx?$/, "");
    for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
      const candidate = base + ext;
      if (await fileExists(candidate)) {
        return { strategy: "inject-import", targetFile: candidate, confidence: 0.9,
          reason: `Expo: package.json "main" resolved to ${path.basename(candidate)}` };
      }
    }
  }

  // ── 3. app.json / app.config.js: expo.entryPoint ─────────────────────────
  for (const cfgName of ["app.json", "app.config.json"]) {
    const appJson = await readJson(path.join(targetDir, cfgName));
    if (appJson) {
      const expo = (appJson.expo ?? appJson) as Record<string, unknown>;
      if (typeof expo.entryPoint === "string") {
        const ep = path.join(targetDir, expo.entryPoint);
        if (await fileExists(ep)) {
          return { strategy: "inject-import", targetFile: ep, confidence: 0.9,
            reason: `Expo: ${cfgName} "entryPoint": "${expo.entryPoint}"` };
        }
      }
    }
  }

  // ── 4. Semantic scan: registerRootComponent / AppRegistry ─────────────────
  const found = await scanDirForPattern(targetDir, RN_BOOTSTRAP_PATTERNS);
  if (found) return { strategy: "inject-import", targetFile: found.file, confidence: found.confidence,
    reason: `Expo semantic: ${found.reason}` };

  // ── 5. Well-known root-level entry candidates for bare Expo projects ──────
  const EXPO_ROOT_CANDIDATES = [
    "index.ts", "index.tsx", "index.js", "index.jsx",
    "App.tsx",  "App.jsx",   "App.ts",   "App.js",
  ];
  for (const c of EXPO_ROOT_CANDIDATES) {
    const full = path.join(targetDir, c);
    if (await fileExists(full)) {
      return { strategy: "inject-import", targetFile: full, confidence: 0.6,
        reason: `Expo root fallback: found ${c}` };
    }
  }

  return { strategy: "manual", reason: "Expo: no entry file found. Add import \"./codetraxisAgent\" manually to your root component or index file." };
}

async function resolveReactNativePlan(targetDir: string): Promise<InstallStrategy> {
  const pkg = await readJson(path.join(targetDir, "package.json"));
  const mainField = pkg?.main && typeof pkg.main === "string" ? pkg.main : null;

  if (mainField && !mainField.includes("expo-router")) {
    const mainFile = path.join(targetDir, mainField);
    if (await fileExists(mainFile)) {
      return { strategy: "inject-import", targetFile: mainFile, confidence: 0.95,
        reason: `React Native: package.json "main": "${mainField}"` };
    }
    const base = mainFile.replace(/\.[jt]sx?$/, "");
    for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
      const candidate = base + ext;
      if (await fileExists(candidate)) {
        return { strategy: "inject-import", targetFile: candidate, confidence: 0.9,
          reason: `React Native: package.json "main" resolved to ${path.basename(candidate)}` };
      }
    }
  }

  const found = await scanDirForPattern(targetDir, RN_BOOTSTRAP_PATTERNS);
  if (found) return { strategy: "inject-import", targetFile: found.file, confidence: found.confidence,
    reason: `React Native semantic: ${found.reason}` };

  // Root-level candidates
  for (const c of ["index.ts", "index.tsx", "index.js", "index.jsx", "App.tsx", "App.jsx"]) {
    const full = path.join(targetDir, c);
    if (await fileExists(full)) {
      return { strategy: "inject-import", targetFile: full, confidence: 0.6,
        reason: `React Native root fallback: found ${c}` };
    }
  }

  return resolveCandidateFallback(targetDir);
}

async function resolveCraPlan(targetDir: string): Promise<InstallStrategy> {
  const found = await scanDirForPattern(targetDir, WEB_BOOTSTRAP_PATTERNS);
  if (found) return { strategy: "inject-import", targetFile: found.file, confidence: found.confidence,
    reason: `CRA: ${found.reason}` };

  const htmlFile = path.join(targetDir, "public", "index.html");
  if (await fileExists(htmlFile)) {
    return { strategy: "patch-html", htmlFile, scriptSrc: "/codetraxisAgent.js",
      confidence: 0.5, reason: "CRA: public/index.html" };
  }

  return { strategy: "manual", reason: "CRA: no bootstrap file found" };
}

async function resolveGenericReactPlan(targetDir: string): Promise<InstallStrategy> {
  const found = await scanDirForPattern(targetDir, [...WEB_BOOTSTRAP_PATTERNS, ...RN_BOOTSTRAP_PATTERNS]);
  if (found) return { strategy: "inject-import", targetFile: found.file, confidence: found.confidence,
    reason: `Generic React: ${found.reason}` };

  return resolveCandidateFallback(targetDir);
}

// Last resort — classic name list
const ENTRY_CANDIDATES = [
  "src/main.tsx", "src/main.jsx", "src/main.ts", "src/main.js",
  "src/index.tsx", "src/index.jsx", "src/index.ts", "src/index.js",
  "src/App.tsx",   "src/App.jsx",
  "main.tsx",      "main.jsx",    "main.ts",    "main.js",
  "index.tsx",     "index.jsx",   "index.ts",   "index.js",
  "App.tsx",       "App.jsx",
];

async function resolveCandidateFallback(targetDir: string): Promise<InstallStrategy> {
  for (const candidate of ENTRY_CANDIDATES) {
    const full = path.join(targetDir, candidate);
    if (await fileExists(full)) {
      return { strategy: "inject-import", targetFile: full, confidence: 0.4, reason: `Fallback candidate: ${candidate}` };
    }
  }
  return { strategy: "manual", reason: "No entry file found by any method" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — build install plan
// ─────────────────────────────────────────────────────────────────────────────

export async function buildInstallPlan(targetDir: string): Promise<{ kind: ProjectKind; plan: InstallStrategy }> {
  const kind = await detectProjectKind(targetDir);

  let plan: InstallStrategy;
  switch (kind) {
    case "vite-react":    plan = await resolveVitePlan(targetDir);        break;
    case "nextjs":        plan = await resolveNextjsPlan(targetDir);      break;
    case "expo":          plan = await resolveExpoPlan(targetDir);        break;
    case "react-native":  plan = await resolveReactNativePlan(targetDir); break;
    case "cra-react":
    case "webpack-react": plan = await resolveCraPlan(targetDir);         break;
    default:              plan = await resolveGenericReactPlan(targetDir);break;
  }

  return { kind, plan };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — AST-based import injection
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_IMPORT_MARKER = "./codetraxisAgent";

function injectImportAst(source: string, importPath: string): string {
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx", "decorators-legacy", "classProperties"],
      errorRecovery: true,
    });
  } catch {
    return injectImportLineBased(source, importPath);
  }

  const importLine = `import "${importPath}"; // codetraxis agent\n`;

  // Find end position of the last ImportDeclaration
  let lastImportEnd = -1;
  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node) && node.end != null) {
      lastImportEnd = node.end;
    }
  }

  if (lastImportEnd < 0) return importLine + source;
  return source.slice(0, lastImportEnd) + "\n" + importLine + source.slice(lastImportEnd);
}

function injectImportLineBased(source: string, importPath: string): string {
  const lines = source.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(import\s|export\s+\*|\/\/\s*@ts-nocheck)/.test(lines[i])
      || /^\s*const\s+\w+\s*=\s*require\(/.test(lines[i])) {
      lastImportIdx = i;
    }
  }
  const importLine = `import "${importPath}"; // codetraxis agent`;
  if (lastImportIdx >= 0) {
    lines.splice(lastImportIdx + 1, 0, importLine);
  } else {
    lines.unshift(importLine);
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5b — Next.js integration (browser-only boundary)
//
// A bare `import "./codetraxisAgent"` in app/layout.tsx runs ONLY on the server
// (Server Component) and never reaches the browser, so nothing is intercepted.
// We resolve one of three browser-safe strategies:
//   • instrumentation    — Next ≥ 15.3: instrumentation-client.{ts,js} (client-only hook)
//   • layout-client      — App Router < 15.3: "use client" wrapper rendered in <body>
//   • pages-import       — Pages Router < 15.3: guarded import in pages/_app
// ─────────────────────────────────────────────────────────────────────────────

type NextMode = "instrumentation" | "layout-client" | "pages-import";

interface NextPlan {
  mode: NextMode;
  agentParentDir: string; // where codetraxisAgent/ folder is written
  targetFile: string;     // file created / modified
  isTs: boolean;
}

async function getNextVersion(targetDir: string): Promise<[number, number]> {
  const pkg = await readJson(path.join(targetDir, "package.json"));
  const deps = { ...((pkg?.dependencies ?? {}) as Record<string, string>),
                 ...((pkg?.devDependencies ?? {}) as Record<string, string>) };
  const raw = deps["next"];
  if (!raw) return [0, 0];
  const m = raw.match(/(\d+)\.(\d+)/);
  if (!m) return [999, 999]; // "latest" / "canary" → assume newest
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

const NEXT_APP_LAYOUTS = [
  "src/app/layout.tsx", "src/app/layout.jsx", "src/app/layout.js",
  "app/layout.tsx",     "app/layout.jsx",     "app/layout.js",
];
const NEXT_PAGES_APPS = [
  "src/pages/_app.tsx", "src/pages/_app.jsx", "src/pages/_app.js",
  "pages/_app.tsx",     "pages/_app.jsx",     "pages/_app.js",
];

async function resolveNextPlan(targetDir: string): Promise<NextPlan | null> {
  const isTs = await fileExists(path.join(targetDir, "tsconfig.json"));
  const [major, minor] = await getNextVersion(targetDir);
  const useInstrumentation = major > 15 || (major === 15 && minor >= 3);

  let layout: string | null = null;
  for (const c of NEXT_APP_LAYOUTS) {
    if (await fileExists(path.join(targetDir, c))) { layout = c; break; }
  }
  let pagesApp: string | null = null;
  for (const c of NEXT_PAGES_APPS) {
    if (await fileExists(path.join(targetDir, c))) { pagesApp = c; break; }
  }

  // Place the agent folder / instrumentation file at src/ or project root.
  const anchor = layout ?? pagesApp ?? "";
  const usesSrc = anchor.startsWith("src/") ||
    (!anchor && await fileExists(path.join(targetDir, "src")));
  const base = usesSrc ? path.join(targetDir, "src") : targetDir;

  if (useInstrumentation) {
    const ext = isTs ? "ts" : "js";
    return { mode: "instrumentation", agentParentDir: base,
      targetFile: path.join(base, `instrumentation-client.${ext}`), isTs };
  }
  if (layout) {
    return { mode: "layout-client", agentParentDir: base,
      targetFile: path.join(targetDir, layout), isTs };
  }
  if (pagesApp) {
    return { mode: "pages-import", agentParentDir: base,
      targetFile: path.join(targetDir, pagesApp), isTs };
  }
  return null;
}

/** Relative POSIX import specifier from `fromFile`'s dir to `toTarget`. */
function relImport(fromFile: string, toTarget: string): string {
  let rel = path.relative(path.dirname(fromFile), toTarget);
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel.split(path.sep).join("/");
}

/** AST-safe injection of a full import line (default/named/side-effect). */
function injectImportLine(source: string, importLine: string): string {
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx", "decorators-legacy", "classProperties"],
      errorRecovery: true,
    });
  } catch {
    return injectImportLineFallback(source, importLine);
  }
  let lastImportEnd = -1;
  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node) && node.end != null) lastImportEnd = node.end;
  }
  if (lastImportEnd < 0) return injectImportLineFallback(source, importLine);
  return source.slice(0, lastImportEnd) + "\n" + importLine + source.slice(lastImportEnd);
}

function injectImportLineFallback(source: string, importLine: string): string {
  const lines = source.split("\n");
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(import\s|export\s+\*)/.test(lines[i])
      || /^\s*const\s+\w+\s*=\s*require\(/.test(lines[i])) {
      idx = i;
    } else if (idx === -1 && /^\s*["']use client["'];?/.test(lines[i])) {
      idx = i; // insert right after a leading "use client" directive
    }
  }
  if (idx >= 0) lines.splice(idx + 1, 0, importLine);
  else lines.unshift(importLine);
  return lines.join("\n");
}

/** Insert a JSX child right after the opening <body> tag. Returns null if none. */
function injectBodyChild(source: string, jsx: string): string | null {
  const re = /<body(\s[^>]*)?>/;
  if (!re.test(source)) return null;
  return source.replace(re, (m) => `${m}\n        ${jsx}`);
}

function buildNextClientWrapper(): string {
  return `"use client";
// codetraxis agent — client boundary (browser-only). Auto-generated, do not edit.
import { useEffect } from "react";

export default function CodetraxisAgent() {
  useEffect(() => {
    import("./index");
  }, []);
  return null;
}
`;
}

async function installNextAgent(targetDir: string, projectId: string): Promise<InstallResult> {
  const plan = await resolveNextPlan(targetDir);
  if (!plan) {
    return { success: false, alreadyInstalled: false, projectKind: "nextjs", strategy: "manual",
      error: "Next.js: no app/layout or pages/_app found. Add a browser entry manually." };
  }

  const port = process.env.PORT ?? "3333";
  await writeAgentFiles(plan.agentParentDir, port, projectId, "nextjs");
  const agentFolder = path.join(plan.agentParentDir, "codetraxisAgent");

  // ── instrumentation-client.{ts,js} — Next ≥ 15.3 (both routers) ─────────────
  if (plan.mode === "instrumentation") {
    const importPath = relImport(plan.targetFile, agentFolder);
    const importLine = `import "${importPath}"; // codetraxis agent`;
    let alreadyInstalled = false;

    if (await fileExists(plan.targetFile)) {
      const src = await fs.readFile(plan.targetFile, "utf-8");
      alreadyInstalled = src.includes("codetraxisAgent");
      if (!alreadyInstalled) {
        await fs.writeFile(plan.targetFile, injectImportLine(src, importLine), "utf-8");
      }
    } else {
      await fs.writeFile(plan.targetFile, importLine + "\n", "utf-8");
    }
    return { success: true, alreadyInstalled, entryFile: plan.targetFile,
      agentFile: path.join(agentFolder, "index.js"), projectKind: "nextjs", strategy: "nextjs-instrumentation" };
  }

  // ── pages/_app — Pages Router < 15.3 (agent self-guards against SSR) ─────────
  if (plan.mode === "pages-import") {
    const importPath = relImport(plan.targetFile, agentFolder);
    const src = await fs.readFile(plan.targetFile, "utf-8");
    const alreadyInstalled = src.includes("codetraxisAgent");
    if (!alreadyInstalled) {
      await fs.writeFile(plan.targetFile,
        injectImportLine(src, `import "${importPath}"; // codetraxis agent`), "utf-8");
    }
    return { success: true, alreadyInstalled, entryFile: plan.targetFile,
      agentFile: path.join(agentFolder, "index.js"), projectKind: "nextjs", strategy: "nextjs-pages" };
  }

  // ── layout.tsx — App Router < 15.3 → "use client" wrapper in <body> ─────────
  const wrapperExt = plan.targetFile.endsWith(".tsx") ? "tsx"
    : plan.targetFile.endsWith(".jsx") ? "jsx"
    : plan.isTs ? "tsx" : "jsx";
  const wrapperFile = path.join(agentFolder, `CodetraxisAgent.${wrapperExt}`);
  await fs.writeFile(wrapperFile, buildNextClientWrapper(), "utf-8");

  const src = await fs.readFile(plan.targetFile, "utf-8");
  const alreadyInstalled = src.includes("CodetraxisAgent") || src.includes("codetraxisAgent");
  if (!alreadyInstalled) {
    const importPath = relImport(plan.targetFile, wrapperFile).replace(/\.(tsx|jsx)$/, "");
    const out = injectImportLine(src, `import CodetraxisAgent from "${importPath}"; // codetraxis agent`);
    const withChild = injectBodyChild(out, "<CodetraxisAgent />");
    if (withChild === null) {
      return { success: false, alreadyInstalled: false, projectKind: "nextjs", strategy: "manual",
        error: `Next.js: no <body> in ${path.basename(plan.targetFile)}. Render <CodetraxisAgent /> manually.` };
    }
    await fs.writeFile(plan.targetFile, withChild, "utf-8");
  }
  return { success: true, alreadyInstalled, entryFile: plan.targetFile,
    agentFile: wrapperFile, projectKind: "nextjs", strategy: "nextjs-layout-client" };
}

async function removeNextAgent(targetDir: string): Promise<RemoveResult> {
  const plan = await resolveNextPlan(targetDir);
  if (!plan) return { success: false, error: "Next.js: entry not found" };

  const agentFolder = path.join(plan.agentParentDir, "codetraxisAgent");
  let deletedAgentFile: string | undefined;
  if (await fileExists(agentFolder)) {
    await fs.rm(agentFolder, { recursive: true, force: true });
    deletedAgentFile = agentFolder;
  }

  if (await fileExists(plan.targetFile)) {
    const src = await fs.readFile(plan.targetFile, "utf-8");
    if (/codetraxisAgent|CodetraxisAgent/.test(src)) {
      // Drop our import lines only (side-effect import or default import),
      // then strip the rendered <CodetraxisAgent /> element WITHOUT touching
      // siblings on the same line (e.g. {children}).
      const out = src.split("\n")
        .filter(l => !/(^|\W)codetraxisAgent/.test(l) && !/import\s+CodetraxisAgent\b/.test(l))
        .join("\n")
        .replace(/\s*<CodetraxisAgent\s*\/>/g, "");
      // A file we created solely for the agent becomes empty (comments only) → delete it.
      if (plan.mode === "instrumentation" && out.replace(/\/\/[^\n]*/g, "").trim() === "") {
        await fs.unlink(plan.targetFile);
      } else {
        await fs.writeFile(plan.targetFile, out, "utf-8");
      }
    }
  }
  return { success: true, entryFile: plan.targetFile, agentFile: deletedAgentFile };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — apply plan (main export)
// ─────────────────────────────────────────────────────────────────────────────

export async function installAgent(targetDir: string, projectId: string): Promise<InstallResult> {
  try {
    // Next.js needs a browser-only client boundary — handled separately.
    if (await detectProjectKind(targetDir) === "nextjs") {
      return await installNextAgent(targetDir, projectId);
    }

    const { kind, plan } = await buildInstallPlan(targetDir);

    if (plan.strategy === "manual") {
      return { success: false, alreadyInstalled: false, projectKind: kind, strategy: "manual", error: plan.reason };
    }

    if (plan.strategy === "patch-html") {
      const publicDir  = path.dirname(plan.htmlFile);
      const bundleFile = path.join(publicDir, "codetraxisAgent.js");
      const port       = process.env.PORT ?? "3333";

      // Check if already installed
      const htmlSource     = await fs.readFile(plan.htmlFile, "utf-8");
      const alreadyInstalled = htmlSource.includes("codetraxisAgent.js");

      // Always overwrite the bundle so it stays up-to-date
      await fs.writeFile(bundleFile, await buildHtmlAgentBundle(port, projectId), "utf-8");

      // Patch index.html only if not already patched
      if (!alreadyInstalled) {
        await fs.writeFile(plan.htmlFile, patchHtmlFile(htmlSource, plan.scriptSrc), "utf-8");
      }

      return {
        success: true,
        alreadyInstalled,
        entryFile: plan.htmlFile,
        agentFile: bundleFile,
        projectKind: kind,
        strategy: "patch-html",
      };
    }

    // strategy === "inject-import"
    const targetFile = plan.targetFile;

    // Place the agent file at the project root (or src/ if entry is under src/).
    // Never place it inside app/ (expo-router would try to route it).
    const relToRoot  = path.relative(targetDir, path.dirname(targetFile));
    const agentDir   = relToRoot.startsWith("app") || relToRoot.startsWith("src/app")
      // expo-router: entry is in app/ — put agent at project root instead
      ? targetDir
      : path.dirname(targetFile);

    const agentFile  = path.join(agentDir, "codetraxisAgent", "index.js");

    // Import path from the entry file to the agent folder's index
    let agentImportPath = AGENT_IMPORT_MARKER; // default: "./codetraxisAgent"
    if (agentDir !== path.dirname(targetFile)) {
      // entry is in app/, agent is at root → relative path from entry to root
      const rel = path.relative(path.dirname(targetFile), agentDir);
      agentImportPath = (rel.startsWith(".") ? rel : "./" + rel) + "/codetraxisAgent";
    }

    const entrySource = await fs.readFile(targetFile, "utf-8");
    const alreadyInstalled = entrySource.includes("codetraxisAgent");

    // Always overwrite the agent folder so the latest version is always present.
    await writeAgentFiles(agentDir, process.env.PORT ?? "3333", projectId, kind);

    // Only inject the import if it's not there yet.
    if (!alreadyInstalled) {
      await fs.writeFile(targetFile, injectImportAst(entrySource, agentImportPath), "utf-8");
    }

    return { success: true, alreadyInstalled, entryFile: targetFile, agentFile, projectKind: kind, strategy: plan.strategy };

  } catch (err) {
    return { success: false, alreadyInstalled: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public helper used by status route
// ─────────────────────────────────────────────────────────────────────────────

export async function findEntryFile(targetDir: string): Promise<string | null> {
  if (await detectProjectKind(targetDir) === "nextjs") {
    return (await resolveNextPlan(targetDir))?.targetFile ?? null;
  }
  const { plan } = await buildInstallPlan(targetDir);
  if (plan.strategy === "inject-import") return plan.targetFile;
  if (plan.strategy === "patch-html")    return plan.htmlFile;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// removeAgent — удаляет агент из проекта
// ─────────────────────────────────────────────────────────────────────────────

export interface RemoveResult {
  success: boolean;
  entryFile?: string;
  agentFile?: string;
  error?: string;
}

export async function removeAgent(targetDir: string): Promise<RemoveResult> {
  try {
    if (await detectProjectKind(targetDir) === "nextjs") {
      return await removeNextAgent(targetDir);
    }

    const { plan } = await buildInstallPlan(targetDir);

    // ── patch-html case ───────────────────────────────────────────────────────
    if (plan.strategy === "patch-html") {
      const publicDir  = path.dirname(plan.htmlFile);
      const bundleFile = path.join(publicDir, "codetraxisAgent.js");

      // Remove <script> tag from index.html
      const htmlSource = await fs.readFile(plan.htmlFile, "utf-8");
      if (htmlSource.includes("codetraxisAgent.js")) {
        const cleaned = htmlSource
          .split("\n")
          .filter(line => !line.includes("codetraxisAgent.js"))
          .join("\n");
        await fs.writeFile(plan.htmlFile, cleaned, "utf-8");
      }

      // Remove the bundle file
      if (await fileExists(bundleFile)) {
        await fs.unlink(bundleFile);
      }

      return { success: true, entryFile: plan.htmlFile, agentFile: bundleFile };
    }

    // ── inject-import case ────────────────────────────────────────────────────
    const entryFile = plan.strategy === "inject-import" ? plan.targetFile : null;

    if (!entryFile) {
      return { success: false, error: "Entry file not found" };
    }

    const source = await fs.readFile(entryFile, "utf-8");

    if (!source.includes("codetraxisAgent")) {
      return { success: false, error: "Agent import not found in entry file" };
    }

    // Удаляем строку импорта агента
    const cleaned = source
      .split("\n")
      .filter(line => !line.includes("codetraxisAgent"))
      .join("\n");

    await fs.writeFile(entryFile, cleaned, "utf-8");

    // Ищем папку агента (может быть в той же папке что entry, или в корне проекта)
    const agentDirCandidates = [
      path.join(path.dirname(entryFile), "codetraxisAgent"),
      path.join(targetDir, "codetraxisAgent"),
    ];

    let deletedAgentFile: string | undefined;
    for (const candidate of agentDirCandidates) {
      if (await fileExists(candidate)) {
        await fs.rm(candidate, { recursive: true, force: true });
        deletedAgentFile = candidate;
        break;
      }
    }

    // Обратная совместимость: старый монолитный файл codetraxisAgent.ts
    if (!deletedAgentFile) {
      const legacyCandidates = [
        path.join(path.dirname(entryFile), "codetraxisAgent.ts"),
        path.join(targetDir, "codetraxisAgent.ts"),
      ];
      for (const candidate of legacyCandidates) {
        if (await fileExists(candidate)) {
          await fs.unlink(candidate);
          deletedAgentFile = candidate;
          break;
        }
      }
    }

    return { success: true, entryFile, agentFile: deletedAgentFile };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent source location
//
// In production: __dirname = server/dist/utils/agent/
//                pkg root  = ../../../../   → codetraxisAgent-dist/ at root
// In dev (ts-node): __dirname = server/src/utils/agent/
//                   pkg root  = ../../../../   → codetraxisAgent-dist/ at root (if built)
//                   fallback to codetraxisAgent/ for hot reload
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_SRC_DIR = path.resolve(__dirname, "../../../../codetraxisAgent-dist");

// ─── Read agent source file and apply substitutions ──────────────────────────
// Agent files are pre-compiled from TypeScript to clean JavaScript via tsc.

async function readAgentFile(
  relativePath: string,
  port: string,
  projectId: string,
): Promise<string> {
  // codetraxisAgent-dist/ contains .js files compiled from .ts sources
  const jsPath = relativePath.replace(/\.ts$/, ".js");
  const fullPath = path.join(AGENT_SRC_DIR, jsPath);
  let src = await fs.readFile(fullPath, "utf-8");
  src = src.split("__PORT__").join(port);
  src = src.split("__PROJECT_ID__").join(projectId);
  return src;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent source — modular architecture
//
// Reads from codetraxisAgent/ at package root and writes to target project:
//   shared.ts/js
//   interceptors/consoleInterceptor.ts/js
//   interceptors/fetchInterceptor.ts/js
//   interceptors/xhrInterceptor.ts/js
//   index.ts/js   (with __PORT__ and __XHR_LINE__ substituted)
// ─────────────────────────────────────────────────────────────────────────────

async function writeAgentFiles(
  agentParentDir: string,
  serverPort: string,
  projectId: string,
  kind: ProjectKind,
): Promise<void> {
  const agentDir        = path.join(agentParentDir, "codetraxisAgent");
  const interceptorsDir = path.join(agentDir, "interceptors");
  const isRn            = kind === "expo" || kind === "react-native";

  // Always wipe the old agent folder first so stale .ts/.js files don't coexist
  await fs.rm(agentDir, { recursive: true, force: true });
  await fs.mkdir(interceptorsDir, { recursive: true });

  // shared
  await fs.writeFile(
    path.join(agentDir, "shared.js"),
    await readAgentFile("shared.ts", serverPort, projectId),
    "utf-8",
  );

  // interceptors
  await fs.writeFile(
    path.join(interceptorsDir, "consoleInterceptor.js"),
    await readAgentFile("interceptors/consoleInterceptor.ts", serverPort, projectId),
    "utf-8",
  );
  await fs.writeFile(
    path.join(interceptorsDir, "fetchInterceptor.js"),
    await readAgentFile("interceptors/fetchInterceptor.ts", serverPort, projectId),
    "utf-8",
  );
  await fs.writeFile(
    path.join(interceptorsDir, "xhrInterceptor.js"),
    await readAgentFile("interceptors/xhrInterceptor.ts", serverPort, projectId),
    "utf-8",
  );

  // index — substitute __XHR_LINE__ based on project kind
  const xhrLine = isRn
    ? "setupXhrInterceptor(treeViewerBridge); // React Native uses XHR under the hood"
    : "setupXhrInterceptor(treeViewerBridge);";

  let indexSrc = await readAgentFile("index.ts", serverPort, projectId);
  indexSrc = indexSrc.split("__XHR_LINE__").join(xhrLine);

  await fs.writeFile(path.join(agentDir, "index.js"), indexSrc, "utf-8");

  // Add .eslintrc.js to suppress globalThis warnings in older projects
  await fs.writeFile(
    path.join(agentDir, ".eslintrc.js"),
    `module.exports = { env: { es2020: true } };\n`,
    "utf-8",
  );
}


/** Insert <script src="..."> just before </body> (or </head> as fallback). */
function patchHtmlFile(html: string, scriptSrc: string): string {
  const tag = `<script src="${scriptSrc}"></script>`;
  if (html.includes(tag)) return html; // idempotent
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `  ${tag}\n</body>`);
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
  }
  // No recognisable tags — just append
  return html + `\n${tag}\n`;
}


/** Build a self-contained IIFE bundle for plain-HTML projects by reading agent sources from disk. */
async function buildHtmlAgentBundle(serverPort: string, projectId: string): Promise<string> {
  const read = (rel: string) => readAgentFile(rel, serverPort, projectId);

  const shared  = await read("shared.ts");
  const console_ = await read("interceptors/consoleInterceptor.ts");
  const fetch_   = await read("interceptors/fetchInterceptor.ts");
  const xhr_     = await read("interceptors/xhrInterceptor.ts");

  // Convert ESM exports to local variable assignments for IIFE context
  const strip = (src: string) =>
    src
      .replace(/^export\s+function\s+/gm, "function ")
      .replace(/^export\s+(const|let|var)\s+/gm, "$1 ")
      .replace(/^import[^\n]+\n/gm, "")
      .replace(/^export\s+\{\s*\};\s*$/gm, "");

  return `/**
 * codetraxis debug agent — standalone bundle (auto-generated, do not edit).
 * Injected into public/index.html via <script src="/codetraxisAgent.js">.
 */
(function () {
  'use strict';

${strip(shared)}
${strip(console_)}
${strip(fetch_)}
${strip(xhr_)}

  const _bridge = createTreeViewerBridge("${serverPort}", "${projectId}");
  setupConsoleInterceptor(_bridge);
  setupFetchInterceptor(_bridge);
  setupXhrInterceptor(_bridge);
})();
`;
}

export {};
