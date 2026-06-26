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
// Step 6 — apply plan (main export)
// ─────────────────────────────────────────────────────────────────────────────

export async function installAgent(targetDir: string): Promise<InstallResult> {
  try {
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
      await fs.writeFile(bundleFile, buildHtmlAgentBundle(port), "utf-8");

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

    // Use .js extension for plain JS projects (webpack / CRA without TS)
    // so webpack can resolve ./codetraxisAgent without a TypeScript loader.
    const entryExt  = path.extname(targetFile); // .js | .jsx | .ts | .tsx
    const useJs     = entryExt === ".js" || entryExt === ".jsx";
    const agentIndexExt = useJs ? "js" : "ts";

    const agentFile  = path.join(agentDir, "codetraxisAgent", `index.${agentIndexExt}`);

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
    await writeAgentFiles(agentDir, process.env.PORT ?? "3333", kind, useJs);

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
// HTML patching helpers (for CRA / plain-web projects with public/index.html)
// ─────────────────────────────────────────────────────────────────────────────

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

/** Build a self-contained IIFE bundle (no import/export) for injection via <script>. */
function buildHtmlAgentBundle(serverPort: string): string {
  // We inline shared + interceptors as one IIFE so it works in any plain HTML page
  // without a bundler or module system.
  return `/**
 * codetraxis debug agent — standalone bundle (auto-generated, do not edit).
 * Injected into public/index.html via <script src="/codetraxisAgent.js">.
 */
(function () {
  'use strict';

  // ─── bridge ────────────────────────────────────────────────────────────────
  var PORT = '${serverPort}';
  var WS_URL = 'ws://localhost:' + PORT + '/agent';
  var MAX_LEN = 20000;
  var _ws = null;
  var _queue = [];
  var _reconnectTimer = null;

  function connect() {
    try {
      _ws = new WebSocket(WS_URL);
      _ws.onopen = function () {
        var q = _queue.splice(0);
        for (var i = 0; i < q.length; i++) _ws.send(q[i]);
      };
      _ws.onclose = function () {
        _ws = null;
        if (!_reconnectTimer) {
          _reconnectTimer = setTimeout(function () { _reconnectTimer = null; connect(); }, 3000);
        }
      };
      _ws.onerror = function () { /* suppress */ };
    } catch (e) { /* WebSocket not available */ }
  }

  connect();

  var _uid = 0;
  function uid() { return 'h' + (++_uid) + '_' + Date.now(); }

  function truncate(s) {
    if (typeof s !== 'string') return s;
    return s.length > MAX_LEN ? s.slice(0, MAX_LEN) + '…[truncated]' : s;
  }

  function safeSerialize(v) {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'string') return truncate(v);
    try { return truncate(JSON.stringify(v)); } catch { return '[unserializable]'; }
  }

  function send(msg) {
    try {
      var s = JSON.stringify(msg);
      if (_ws && _ws.readyState === 1 /* OPEN */) {
        _ws.send(s);
      } else {
        _queue.push(s);
      }
    } catch { /* ignore */ }
  }

  var bridge = { uid: uid, truncate: truncate, safeSerialize: safeSerialize, send: send };

  // ─── console interceptor ───────────────────────────────────────────────────
  var LEVELS = ['log', 'warn', 'error', 'info', 'debug'];
  LEVELS.forEach(function (level) {
    var orig = console[level].bind(console);
    console[level] = function () {
      orig.apply(console, arguments);
      try {
        var args = Array.prototype.slice.call(arguments);
        bridge.send({
          id: bridge.uid(), type: 'console', level: level, timestamp: Date.now(),
          args: args.map(function (a) { return bridge.safeSerialize(a); }),
        });
      } catch { /* ignore */ }
    };
  });

  // ─── fetch interceptor ─────────────────────────────────────────────────────
  if (typeof fetch !== 'undefined') {
    var _origFetch = fetch;
    fetch = function (input, init) {
      var id    = bridge.uid();
      var start = Date.now();
      var method  = (init && init.method ? init.method : 'GET').toUpperCase();
      var url     = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input.url || String(input));
      var reqBody = init && init.body != null ? bridge.truncate(String(init.body)) : undefined;
      var reqHeaders;
      try {
        if (init && init.headers) {
          reqHeaders = {};
          var h = new Headers(init.headers);
          h.forEach(function (v, k) { reqHeaders[k] = v; });
        }
      } catch { /* ignore */ }

      bridge.send({ id: id, type: 'network', transport: 'fetch', method: method, url: url,
        requestBody: reqBody, requestHeaders: reqHeaders, state: 'pending', timestamp: start });

      return _origFetch.call(this, input, init).then(function (response) {
        var cloned = response.clone();
        var resHeaders = {};
        try { response.headers.forEach(function (v, k) { resHeaders[k] = v; }); } catch { /* ignore */ }
        cloned.text().then(function (body) {
          bridge.send({ id: id, type: 'network', transport: 'fetch', method: method, url: url,
            status: response.status, requestBody: reqBody, requestHeaders: reqHeaders,
            responseBody: bridge.truncate(body), responseHeaders: resHeaders,
            state: response.ok ? 'success' : 'error',
            duration: Date.now() - start, timestamp: start });
        }).catch(function () {
          bridge.send({ id: id, type: 'network', transport: 'fetch', method: method, url: url,
            status: response.status, requestBody: reqBody, requestHeaders: reqHeaders,
            responseHeaders: resHeaders,
            state: response.ok ? 'success' : 'error',
            duration: Date.now() - start, timestamp: start });
        });
        return response;
      }).catch(function (err) {
        bridge.send({ id: id, type: 'network', transport: 'fetch', method: method, url: url,
          requestBody: reqBody, requestHeaders: reqHeaders,
          state: 'error', duration: Date.now() - start, timestamp: start });
        throw err;
      });
    };
  }

  // ─── XHR interceptor ──────────────────────────────────────────────────────
  try {
    var proto = XMLHttpRequest.prototype;
    var _origOpen = proto.open;
    proto.open = function (method, url) {
      this.__tv_method = method.toUpperCase();
      this.__tv_url    = String(url);
      return _origOpen.apply(this, arguments);
    };
    var _origSetHeader = proto.setRequestHeader;
    proto.setRequestHeader = function (name, value) {
      if (!this.__tv_reqHeaders) this.__tv_reqHeaders = {};
      this.__tv_reqHeaders[name] = value;
      return _origSetHeader.apply(this, arguments);
    };
    var _origSend = proto.send;
    proto.send = function (body) {
      var self     = this;
      var id       = bridge.uid();
      var method   = this.__tv_method  || 'GET';
      var url      = this.__tv_url     || '';
      var reqHeaders = this.__tv_reqHeaders;
      var start    = Date.now();
      var reqBody;
      if (body != null) {
        try {
          reqBody = typeof body === 'string' ? bridge.truncate(body)
            : body instanceof URLSearchParams ? bridge.truncate(body.toString())
            : '[binary]';
        } catch { /* ignore */ }
      }
      bridge.send({ id: id, type: 'network', transport: 'xhr', method: method, url: url,
        requestBody: reqBody, requestHeaders: reqHeaders, state: 'pending', timestamp: start });

      this.addEventListener('load', function () {
        var resBody, resHeaders;
        try { resBody = bridge.truncate(self.responseText); } catch { /* binary */ }
        try {
          var raw = self.getAllResponseHeaders();
          if (raw) {
            resHeaders = {};
            raw.trim().split(/\r?\n/).forEach(function (line) {
              var idx = line.indexOf(': ');
              if (idx > 0) resHeaders[line.slice(0, idx).toLowerCase()] = line.slice(idx + 2);
            });
          }
        } catch { /* ignore */ }
        bridge.send({ id: id, type: 'network', transport: 'xhr', method: method, url: url,
          status: self.status, requestBody: reqBody, requestHeaders: reqHeaders,
          responseBody: resBody, responseHeaders: resHeaders,
          state: self.status >= 200 && self.status < 400 ? 'success' : 'error',
          duration: Date.now() - start, timestamp: start });
      });
      this.addEventListener('error', function () {
        bridge.send({ id: id, type: 'network', transport: 'xhr', method: method, url: url,
          requestBody: reqBody, requestHeaders: reqHeaders,
          state: 'error', duration: Date.now() - start, timestamp: start });
      });
      return _origSend.apply(this, arguments);
    };
  } catch (e) { /* XHR not available */ }

})();
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent source — modular architecture
//
// Generates a codetraxisAgent/ folder with:
//   shared.ts                      — bridge (WS transport + helpers)
//   interceptors/consoleInterceptor.ts
//   interceptors/fetchInterceptor.ts
//   interceptors/xhrInterceptor.ts  — for React Native & raw XHR users
//   index.ts                        — wires everything together
// ─────────────────────────────────────────────────────────────────────────────

async function writeAgentFiles(agentParentDir: string, serverPort: string, kind: ProjectKind, useJs = false): Promise<void> {
  const agentDir         = path.join(agentParentDir, "codetraxisAgent");
  const interceptorsDir  = path.join(agentDir, "interceptors");
  const ext              = useJs ? "js" : "ts";

  // Always wipe the old agent folder first so stale .ts/.js files don't coexist
  await fs.rm(agentDir, { recursive: true, force: true });
  await fs.mkdir(interceptorsDir, { recursive: true });

  await fs.writeFile(path.join(agentDir,         `shared.${ext}`),               buildSharedSource(serverPort, useJs),              "utf-8");
  await fs.writeFile(path.join(interceptorsDir,  `consoleInterceptor.${ext}`),   buildConsoleInterceptorSource(useJs),             "utf-8");
  await fs.writeFile(path.join(interceptorsDir,  `fetchInterceptor.${ext}`),     buildFetchInterceptorSource(useJs),               "utf-8");
  await fs.writeFile(path.join(interceptorsDir,  `xhrInterceptor.${ext}`),       buildXhrInterceptorSource(useJs),                 "utf-8");
  await fs.writeFile(path.join(agentDir,         `index.${ext}`),                buildAgentIndexSource(kind, serverPort, useJs),   "utf-8");
}

// ─── Strip TypeScript annotations for plain JS projects ──────────────────────
// Removes: import type ..., : Type, <Type>, as Type, interface ..., export type ...
// Keeps the runtime logic intact so webpack/babel can process it without ts-loader.

function stripTypescript(src: string): string {
  return src
    // remove `import type { ... } from "..."` lines
    .replace(/^import type\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, "")
    // remove `export type ...` and `export interface ...` blocks (single or multi-line)
    .replace(/^export\s+(?:type|interface)\s+\w+[^{]*\{[^}]*\};?\s*$/gm, "")
    .replace(/^export\s+(?:type|interface)\s+[^=\n]+=[^;\n]+;?\s*$/gm, "")
    // remove `interface Foo { ... }` blocks
    .replace(/^interface\s+\w+[^{]*\{[\s\S]*?\}\s*$/gm, "")
    // remove inline type annotations: `: string`, `: boolean`, `: number`, `: void`, `: unknown`, `: any`, `: never`
    .replace(/:\s*(string|number|boolean|void|unknown|any|never|null|undefined)\b/g, "")
    // remove `: SomeInterface` / `: Record<...>` / `: Array<...>` etc. (complex types)
    .replace(/:\s*[A-Z][A-Za-z0-9_]*(?:<[^>]*>)?/g, "")
    // remove `as SomeType` casts
    .replace(/\bas\s+[A-Za-z][A-Za-z0-9_<>, |&[\]]*(?=\s*[),;\]}])/g, "")
    // remove `<Type>` generic parameters in function calls / declarations (simple)
    .replace(/<[A-Z][A-Za-z0-9_, ]*>/g, "")
    // clean up resulting double spaces / empty lines
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd() + "\n";
}

// ─── shared.ts / shared.js ───────────────────────────────────────────────────

function buildSharedSource(serverPort: string, useJs = false): string {
  if (useJs) {
    return `/**
 * codetraxis agent — shared bridge (auto-generated, do not edit).
 */

export function createTreeViewerBridge(serverPort) {
  const g = globalThis;

  const isWeb =
    typeof g.document !== "undefined" &&
    typeof g.addEventListener === "function";

  let ws = null;
  let wsReady = false;
  const queue = [];

  const getHost = () => {
    if (typeof g.__TREE_VIEWER_HOST__ === "string" && g.__TREE_VIEWER_HOST__) {
      return g.__TREE_VIEWER_HOST__;
    }
    if (isWeb && g.location?.hostname) return g.location.hostname;
    return "localhost";
  };

  const connect = () => {
    try {
      const WS = typeof WebSocket !== "undefined" ? WebSocket : g.WebSocket;
      if (!WS) return;

      ws = new WS(\`ws://\${getHost()}:${serverPort}/agent\`);
      ws.onopen  = () => {
        wsReady = true;
        while (queue.length > 0) {
          const item = queue.shift();
          if (item && ws) ws.send(item);
        }
      };
      ws.onclose = () => { wsReady = false; setTimeout(connect, 3000); };
      ws.onerror = () => { wsReady = false; };
    } catch { /* unavailable */ }
  };
  connect();

  const truncate = (value, max = 500000) =>
    value.length > max ? \`\${value.slice(0, max)}…[truncated]\` : value;

  const safeSerialize = (value, depth = 0) => {
    if (depth > 4)                   return "[depth limit]";
    if (value == null)               return value;
    if (typeof value === "function") return \`[Function: \${value.name || "anonymous"}]\`;
    if (typeof value === "symbol")   return value.toString();
    if (typeof value !== "object")   return value;
    if (value instanceof Error)      return { __error: true, name: value.name, message: value.message, stack: value.stack };
    if (Array.isArray(value))        return value.slice(0, 1000).map(i => safeSerialize(i, depth + 1));

    const seen = new WeakSet();
    const walk = (obj, d) => {
      if (seen.has(obj)) return "[circular]";
      seen.add(obj);
      const r = {};
      let n = 0;
      for (const k in obj) {
        if (n++ > 500) { r["..."] = "[truncated]"; break; }
        try { r[k] = safeSerialize(obj[k], d + 1); }
        catch { r[k] = "[unserializable]"; }
      }
      return r;
    };
    return walk(value, depth);
  };

  const uid = () =>
    \`\${Math.random().toString(36).slice(2)}\${Date.now().toString(36)}\`;

  const send = (event) => {
    try {
      const payload = JSON.stringify(event);
      if (wsReady && ws) { ws.send(payload); }
      else { queue.push(payload); if (queue.length > 200) queue.shift(); }
    } catch { /* ignore */ }
  };

  return { send, uid, safeSerialize, truncate, isWeb };
}
`;
  }

  return `/**
 * codetraxis agent — shared bridge (auto-generated, do not edit).
 */

export type TreeViewerEvent = Record<string, unknown>;

export interface TreeViewerBridge {
  send: (event: TreeViewerEvent) => void;
  uid: () => string;
  safeSerialize: (value: unknown, depth?: number) => unknown;
  truncate: (value: string, max?: number) => string;
  isWeb: boolean;
}

export function createTreeViewerBridge(serverPort: string): TreeViewerBridge {
  const g = globalThis as Record<string, any>;

  const isWeb: boolean =
    typeof g.document !== "undefined" &&
    typeof g.addEventListener === "function";

  let ws: WebSocket | null = null;
  let wsReady = false;
  const queue: string[] = [];

  const getHost = (): string => {
    if (typeof g.__TREE_VIEWER_HOST__ === "string" && g.__TREE_VIEWER_HOST__) {
      return g.__TREE_VIEWER_HOST__ as string;
    }
    if (isWeb && g.location?.hostname) return g.location.hostname as string;
    return "localhost";
  };

  const connect = () => {
    try {
      const WS =
        typeof WebSocket !== "undefined"
          ? WebSocket
          : (g.WebSocket as typeof WebSocket | undefined);
      if (!WS) return;

      ws = new WS(\`ws://\${getHost()}:${serverPort}/agent\`);
      ws.onopen  = () => {
        wsReady = true;
        while (queue.length > 0) {
          const item = queue.shift();
          if (item && ws) ws.send(item);
        }
      };
      ws.onclose = () => { wsReady = false; setTimeout(connect, 3000); };
      ws.onerror = () => { wsReady = false; };
    } catch { /* unavailable */ }
  };
  connect();

  const truncate = (value: string, max = 500000): string =>
    value.length > max ? \`\${value.slice(0, max)}…[truncated]\` : value;

  const safeSerialize = (value: unknown, depth = 0): unknown => {
    if (depth > 4)            return "[depth limit]";
    if (value == null)        return value;
    if (typeof value === "function") return \`[Function: \${(value as Function).name || "anonymous"}]\`;
    if (typeof value === "symbol")   return value.toString();
    if (typeof value !== "object")   return value;
    if (value instanceof Error) return { __error: true, name: value.name, message: value.message, stack: value.stack };
    if (Array.isArray(value))   return value.slice(0, 1000).map(i => safeSerialize(i, depth + 1));

    const seen = new WeakSet<object>();
    const walk = (obj: object, d: number): Record<string, unknown> | string => {
      if (seen.has(obj)) return "[circular]";
      seen.add(obj);
      const r: Record<string, unknown> = {};
      let n = 0;
      for (const k in obj as Record<string, unknown>) {
        if (n++ > 500) { r["..."] = "[truncated]"; break; }
        try { r[k] = safeSerialize((obj as Record<string, unknown>)[k], d + 1); }
        catch { r[k] = "[unserializable]"; }
      }
      return r;
    };
    return walk(value as object, depth);
  };

  const uid = () =>
    \`\${Math.random().toString(36).slice(2)}\${Date.now().toString(36)}\`;

  const send = (event: TreeViewerEvent) => {
    try {
      const payload = JSON.stringify(event);
      if (wsReady && ws) { ws.send(payload); }
      else { queue.push(payload); if (queue.length > 200) queue.shift(); }
    } catch { /* ignore */ }
  };

  return { send, uid, safeSerialize, truncate, isWeb };
}
`;
}

// ─── consoleInterceptor.ts / .js ─────────────────────────────────────────────

function buildConsoleInterceptorSource(useJs = false): string {
  if (useJs) {
    return `/**
 * codetraxis agent — console interceptor (auto-generated, do not edit).
 */

const INSTALLED_KEY = "__tv_console_installed__";

export function setupConsoleInterceptor(bridge) {
  const g = globalThis;
  if (g[INSTALLED_KEY]) return;
  g[INSTALLED_KEY] = true;

  const original = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
  };

  ["log", "info", "warn", "error"].forEach(level => {
    console[level] = (...args) => {
      original[level](...args);
      bridge.send({
        id: bridge.uid(),
        type: "console",
        level,
        args: args.map(a => bridge.safeSerialize(a)),
        timestamp: Date.now(),
      });
    };
  });
}
`;
  }

  return `/**
 * codetraxis agent — console interceptor (auto-generated, do not edit).
 */
import type { TreeViewerBridge } from "../shared";

const INSTALLED_KEY = "__tv_console_installed__";

export function setupConsoleInterceptor(bridge: TreeViewerBridge): void {
  const g = globalThis as Record<string, any>;
  if (g[INSTALLED_KEY]) return;
  g[INSTALLED_KEY] = true;

  const original = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
  };

  (["log", "info", "warn", "error"] as const).forEach(level => {
    // @ts-ignore
    console[level] = (...args: unknown[]) => {
      original[level](...args);
      bridge.send({
        id: bridge.uid(),
        type: "console",
        level,
        args: args.map(a => bridge.safeSerialize(a)),
        timestamp: Date.now(),
      });
    };
  });
}
`;
}

// ─── fetchInterceptor.ts / .js ───────────────────────────────────────────────

function buildFetchInterceptorSource(useJs = false): string {
  if (useJs) {
    return `/**
 * codetraxis agent — fetch interceptor (auto-generated, do not edit).
 */

const INSTALLED_KEY = "__tv_fetch_installed__";

function normalizeHeaders(headers) {
  if (!headers) return undefined;
  const result = {};
  try {
    if (headers instanceof Headers) {
      headers.forEach((v, k) => { result[k] = v; });
    } else if (Array.isArray(headers)) {
      headers.forEach(([k, v]) => { result[k] = v; });
    } else {
      Object.assign(result, headers);
    }
    return result;
  } catch { return undefined; }
}

export function setupFetchInterceptor(bridge) {
  const g = globalThis;
  if (g[INSTALLED_KEY]) return;
  g[INSTALLED_KEY] = true;

  const originalFetch =
    typeof globalThis.fetch === "function"
      ? globalThis.fetch.bind(globalThis)
      : null;
  if (!originalFetch) return;

  globalThis.fetch = async function tvFetch(input, init) {
    const url =
      typeof input === "string" ? input
      : input instanceof URL   ? input.href
      : input.url;

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const id    = bridge.uid();
    const start = Date.now();

    const requestHeaders = normalizeHeaders(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );

    let requestBody;
    const rawBody = init?.body;
    if (rawBody != null) {
      try {
        requestBody =
          typeof rawBody === "string"            ? bridge.truncate(rawBody)
          : rawBody instanceof URLSearchParams   ? bridge.truncate(rawBody.toString())
          : "[binary]";
      } catch { requestBody = "[unserializable-body]"; }
    }

    bridge.send({ id, type: "network", transport: "fetch", method, url,
      requestHeaders, requestBody, state: "pending", timestamp: start });

    try {
      const response = await originalFetch(input, init);

      let responseHeaders;
      try {
        responseHeaders = {};
        response.headers.forEach((v, k) => { responseHeaders[k] = v; });
      } catch { /* ignore */ }

      let responseBody;
      try { responseBody = bridge.truncate(await response.clone().text()); }
      catch { responseBody = "[binary]"; }

      bridge.send({ id, type: "network", transport: "fetch", method, url,
        status: response.status, requestHeaders, requestBody,
        responseHeaders, responseBody,
        state: response.ok ? "success" : "error",
        duration: Date.now() - start, timestamp: start });

      return response;
    } catch (error) {
      bridge.send({ id, type: "network", transport: "fetch", method, url,
        requestHeaders, requestBody, state: "error",
        duration: Date.now() - start, timestamp: start,
        error: bridge.safeSerialize(error) });
      throw error;
    }
  };
}
`;
  }

  return `/**
 * codetraxis agent — fetch interceptor (auto-generated, do not edit).
 */
import type { TreeViewerBridge } from "../shared";

const INSTALLED_KEY = "__tv_fetch_installed__";

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const result: Record<string, string> = {};
  try {
    if (headers instanceof Headers) {
      headers.forEach((v, k) => { result[k] = v; });
    } else if (Array.isArray(headers)) {
      (headers as [string, string][]).forEach(([k, v]) => { result[k] = v; });
    } else {
      Object.assign(result, headers as Record<string, string>);
    }
    return result;
  } catch { return undefined; }
}

export function setupFetchInterceptor(bridge: TreeViewerBridge): void {
  const g = globalThis as Record<string, any>;
  if (g[INSTALLED_KEY]) return;
  g[INSTALLED_KEY] = true;

  const originalFetch =
    typeof globalThis.fetch === "function"
      ? globalThis.fetch.bind(globalThis)
      : null;
  if (!originalFetch) return;

  globalThis.fetch = async function tvFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === "string" ? input
      : input instanceof URL   ? input.href
      : (input as Request).url;

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const id    = bridge.uid();
    const start = Date.now();

    const requestHeaders = normalizeHeaders(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );

    let requestBody: string | undefined;
    const rawBody = init?.body;
    if (rawBody != null) {
      try {
        requestBody =
          typeof rawBody === "string"       ? bridge.truncate(rawBody)
          : rawBody instanceof URLSearchParams ? bridge.truncate(rawBody.toString())
          : "[binary]";
      } catch { requestBody = "[unserializable-body]"; }
    }

    bridge.send({ id, type: "network", transport: "fetch", method, url,
      requestHeaders, requestBody, state: "pending", timestamp: start });

    try {
      const response = await originalFetch(input, init);

      let responseHeaders: Record<string, string> | undefined;
      try {
        responseHeaders = {};
        response.headers.forEach((v, k) => { responseHeaders![k] = v; });
      } catch { /* ignore */ }

      let responseBody: string | undefined;
      try { responseBody = bridge.truncate(await response.clone().text()); }
      catch { responseBody = "[binary]"; }

      bridge.send({ id, type: "network", transport: "fetch", method, url,
        status: response.status, requestHeaders, requestBody,
        responseHeaders, responseBody,
        state: response.ok ? "success" : "error",
        duration: Date.now() - start, timestamp: start });

      return response;
    } catch (error) {
      bridge.send({ id, type: "network", transport: "fetch", method, url,
        requestHeaders, requestBody, state: "error",
        duration: Date.now() - start, timestamp: start,
        error: bridge.safeSerialize(error) });
      throw error;
    }
  };
}
`;
}

// ─── xhrInterceptor.ts / .js ─────────────────────────────────────────────────

function buildXhrInterceptorSource(useJs = false): string {
  if (useJs) {
    return `/**
 * codetraxis agent — XHR interceptor (auto-generated, do not edit).
 */

const INSTALLED_KEY = "__tv_xhr_installed__";

export function setupXhrInterceptor(bridge) {
  if (typeof XMLHttpRequest === "undefined") return;
  const g = globalThis;
  if (g[INSTALLED_KEY]) return;
  g[INSTALLED_KEY] = true;

  try {
    const proto = XMLHttpRequest.prototype;

    const _origOpen = proto.open;
    proto.open = function(method, url, ...rest) {
      this.__tv_method     = method.toUpperCase();
      this.__tv_url        = String(url);
      this.__tv_reqHeaders = undefined;
      return _origOpen.apply(this, [method, url, ...rest]);
    };

    const _origSetHeader = proto.setRequestHeader;
    proto.setRequestHeader = function(name, value) {
      if (!this.__tv_reqHeaders) this.__tv_reqHeaders = {};
      this.__tv_reqHeaders[name] = value;
      return _origSetHeader.apply(this, [name, value]);
    };

    const _origSend = proto.send;
    proto.send = function(body) {
      const id         = bridge.uid();
      const method     = this.__tv_method ?? "GET";
      const url        = this.__tv_url    ?? "";
      const reqHeaders = this.__tv_reqHeaders;
      const start      = Date.now();

      let requestBody;
      if (body != null) {
        try {
          requestBody =
            typeof body === "string"          ? bridge.truncate(body)
            : body instanceof URLSearchParams ? bridge.truncate(body.toString())
            : "[binary]";
        } catch { /* ignore */ }
      }

      bridge.send({ id, type: "network", transport: "xhr", method, url,
        requestBody, requestHeaders: reqHeaders, state: "pending", timestamp: start });

      this.addEventListener("load", () => {
        let responseBody;
        try { responseBody = bridge.truncate(this.responseText); } catch { /* binary */ }

        let responseHeaders;
        try {
          const raw = this.getAllResponseHeaders();
          if (raw) {
            responseHeaders = {};
            raw.trim().split(/\\r?\\n/).forEach(line => {
              const idx = line.indexOf(": ");
              if (idx > 0) responseHeaders[line.slice(0, idx).toLowerCase()] = line.slice(idx + 2);
            });
          }
        } catch { /* ignore */ }

        bridge.send({ id, type: "network", transport: "xhr", method, url,
          status: this.status, requestBody, requestHeaders: reqHeaders,
          responseBody, responseHeaders,
          state: this.status >= 200 && this.status < 400 ? "success" : "error",
          duration: Date.now() - start, timestamp: start });
      });

      this.addEventListener("error", () => {
        bridge.send({ id, type: "network", transport: "xhr", method, url,
          requestBody, requestHeaders: reqHeaders,
          state: "error", duration: Date.now() - start, timestamp: start });
      });

      return _origSend.apply(this, [body]);
    };
  } catch { /* not available */ }
}
`;
  }

  return `/**
 * codetraxis agent — XHR interceptor (auto-generated, do not edit).
 * Patches XMLHttpRequest.prototype so existing references (e.g. axios
 * internals captured at import time) are also intercepted.
 * Works in browser and React Native (which ships its own XHR polyfill).
 */
import type { TreeViewerBridge } from "../shared";

const INSTALLED_KEY = "__tv_xhr_installed__";

export function setupXhrInterceptor(bridge: TreeViewerBridge): void {
  if (typeof XMLHttpRequest === "undefined") return;
  const g = globalThis as Record<string, any>;
  if (g[INSTALLED_KEY]) return;
  g[INSTALLED_KEY] = true;

  try {
    const proto = XMLHttpRequest.prototype;

    const _origOpen = proto.open;
    proto.open = function(this: XMLHttpRequest, method: string, url: string, ...rest: unknown[]) {
      (this as any).__tv_method     = method.toUpperCase();
      (this as any).__tv_url        = String(url);
      (this as any).__tv_reqHeaders = undefined;
      return (_origOpen as Function).apply(this, [method, url, ...rest]);
    };

    const _origSetHeader = proto.setRequestHeader;
    proto.setRequestHeader = function(this: XMLHttpRequest, name: string, value: string) {
      if (!(this as any).__tv_reqHeaders) (this as any).__tv_reqHeaders = {} as Record<string, string>;
      (this as any).__tv_reqHeaders[name] = value;
      return _origSetHeader.apply(this, [name, value]);
    };

    const _origSend = proto.send;
    proto.send = function(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const id         = bridge.uid();
      const method     = (this as any).__tv_method ?? "GET";
      const url        = (this as any).__tv_url    ?? "";
      const reqHeaders = (this as any).__tv_reqHeaders as Record<string, string> | undefined;
      const start      = Date.now();

      let requestBody: string | undefined;
      if (body != null) {
        try {
          requestBody =
            typeof body === "string"       ? bridge.truncate(body)
            : body instanceof URLSearchParams ? bridge.truncate(body.toString())
            : "[binary]";
        } catch { /* ignore */ }
      }

      bridge.send({ id, type: "network", transport: "xhr", method, url,
        requestBody, requestHeaders: reqHeaders, state: "pending", timestamp: start });

      this.addEventListener("load", () => {
        let responseBody: string | undefined;
        try { responseBody = bridge.truncate(this.responseText); } catch { /* binary */ }

        let responseHeaders: Record<string, string> | undefined;
        try {
          const raw = this.getAllResponseHeaders();
          if (raw) {
            responseHeaders = {};
            raw.trim().split(/\\r?\\n/).forEach(line => {
              const idx = line.indexOf(": ");
              if (idx > 0) responseHeaders![line.slice(0, idx).toLowerCase()] = line.slice(idx + 2);
            });
          }
        } catch { /* ignore */ }

        bridge.send({ id, type: "network", transport: "xhr", method, url,
          status: this.status, requestBody, requestHeaders: reqHeaders,
          responseBody, responseHeaders,
          state: this.status >= 200 && this.status < 400 ? "success" : "error",
          duration: Date.now() - start, timestamp: start });
      });

      this.addEventListener("error", () => {
        bridge.send({ id, type: "network", transport: "xhr", method, url,
          requestBody, requestHeaders: reqHeaders,
          state: "error", duration: Date.now() - start, timestamp: start });
      });

      return _origSend.apply(this, [body]);
    };
  } catch { /* not available */ }
}
`;
}

// ─── index.ts ─────────────────────────────────────────────────────────────────

function buildAgentIndexSource(kind: ProjectKind, serverPort: string, useJs = false): string {
  const isRn = kind === "expo" || kind === "react-native";
  if (useJs) {
    return `/**
 * codetraxis debug agent — entry point (auto-generated, do not edit).
 */
import { createTreeViewerBridge } from "./shared";
import { setupConsoleInterceptor } from "./interceptors/consoleInterceptor";
import { setupFetchInterceptor }   from "./interceptors/fetchInterceptor";
import { setupXhrInterceptor }     from "./interceptors/xhrInterceptor";

export const treeViewerBridge = createTreeViewerBridge("__PORT__");

setupConsoleInterceptor(treeViewerBridge);
setupFetchInterceptor(treeViewerBridge);
${isRn ? "setupXhrInterceptor(treeViewerBridge); // React Native uses XHR under the hood" : "setupXhrInterceptor(treeViewerBridge);"}

// ─── Auto-attach default axios instance ──────────────────────────────────────
try {
  const axiosModule = require("axios");
  const axiosInstance = axiosModule?.default ?? axiosModule;
  if (axiosInstance?.interceptors) {
    attachAxios(axiosInstance);
  }
} catch { /* axios not installed — skip */ }

// ─── attachAxios — for axios.create() instances ───────────────────────────────
// Usage: import { attachAxios } from "./codetraxisAgent";
//        attachAxios(myAxiosInstance);
export function attachAxios(instance) {
  if (!instance?.interceptors) return;

  const INSTALLED_KEY = "__tv_axios_installed__";
  if (instance[INSTALLED_KEY]) return;
  instance[INSTALLED_KEY] = true;

  const REQ_ID_KEY    = "__tv_req_id__";
  const REQ_START_KEY = "__tv_req_start__";

  const joinUrl = (base, url) => {
    if (!base) return url || "";
    if (!url)  return base;
    try { return new URL(url, base).toString(); } catch { return \`\${base}\${url}\`; }
  };

  const normalizeHeaders = (h) => {
    if (!h) return undefined;
    try {
      if (typeof h.toJSON === "function") return h.toJSON();
      return { ...h };
    } catch { return undefined; }
  };

  instance.interceptors.request.use(
    (config) => {
      const id    = treeViewerBridge.uid();
      const start = Date.now();
      config[REQ_ID_KEY]    = id;
      config[REQ_START_KEY] = start;
      treeViewerBridge.send({
        id, type: "network", transport: "axios",
        method: (config.method || "get").toUpperCase(),
        url: joinUrl(config.baseURL, config.url),
        requestHeaders: normalizeHeaders(config.headers),
        requestBody: treeViewerBridge.safeSerialize(config.data),
        state: "pending", timestamp: start,
      });
      return config;
    },
    (error) => {
      treeViewerBridge.send({
        id: treeViewerBridge.uid(), type: "network", transport: "axios",
        state: "error", timestamp: Date.now(),
        error: treeViewerBridge.safeSerialize(error),
      });
      return Promise.reject(error);
    },
  );

  instance.interceptors.response.use(
    (response) => {
      const id    = response.config[REQ_ID_KEY]    || treeViewerBridge.uid();
      const start = response.config[REQ_START_KEY] || Date.now();
      treeViewerBridge.send({
        id, type: "network", transport: "axios",
        method: (response.config.method || "get").toUpperCase(),
        url: joinUrl(response.config.baseURL, response.config.url),
        status: response.status,
        requestHeaders: normalizeHeaders(response.config.headers),
        requestBody: treeViewerBridge.safeSerialize(response.config.data),
        responseHeaders: normalizeHeaders(response.headers),
        responseBody: treeViewerBridge.safeSerialize(response.data),
        state: "success", duration: Date.now() - start, timestamp: start,
      });
      return response;
    },
    (error) => {
      const cfg   = error?.config || {};
      const id    = cfg[REQ_ID_KEY]    || treeViewerBridge.uid();
      const start = cfg[REQ_START_KEY] || Date.now();
      treeViewerBridge.send({
        id, type: "network", transport: "axios",
        method: (cfg.method || "get").toUpperCase(),
        url: joinUrl(cfg.baseURL, cfg.url),
        status: error?.response?.status,
        requestHeaders: normalizeHeaders(cfg.headers),
        requestBody: treeViewerBridge.safeSerialize(cfg.data),
        responseHeaders: normalizeHeaders(error?.response?.headers),
        responseBody: treeViewerBridge.safeSerialize(error?.response?.data),
        state: "error", duration: Date.now() - start, timestamp: start,
        error: treeViewerBridge.safeSerialize({ message: error?.message, code: error?.code, name: error?.name }),
      });
      return Promise.reject(error);
    },
  );
}

// ─── attachSocketIO — for socket.io-client instances ─────────────────────────
// Usage: import { attachSocketIO } from "./codetraxisAgent";
//        attachSocketIO(socket);
export function attachSocketIO(socket) {
  if (!socket) return;

  const INSTALLED_KEY = "__tv_sio_installed__";
  if (socket[INSTALLED_KEY]) return;
  socket[INSTALLED_KEY] = true;

  const url = socket.io?.uri ?? socket.nsp ?? "socket.io";

  socket.onAny((event, ...args) => {
    treeViewerBridge.send({
      id: treeViewerBridge.uid(),
      type: "network",
      transport: "websocket",
      url,
      method: "MESSAGE",
      responseBody: treeViewerBridge.truncate(
        JSON.stringify({ event, data: args.length === 1 ? args[0] : args }),
      ),
      state: "success",
      timestamp: Date.now(),
    });
  });

  const origEmit = socket.emit.bind(socket);
  socket.emit = (event, ...args) => {
    if (!["ping", "pong"].includes(event)) {
      treeViewerBridge.send({
        id: treeViewerBridge.uid(),
        type: "network",
        transport: "websocket",
        url,
        method: "SEND",
        requestBody: treeViewerBridge.truncate(
          JSON.stringify({ event, data: args[0] }),
        ),
        state: "success",
        timestamp: Date.now(),
      });
    }
    return origEmit(event, ...args);
  };
}
`.replace("__PORT__", serverPort);
  }
  return `/**
 * codetraxis debug agent — entry point (auto-generated, do not edit).
 */
import { createTreeViewerBridge } from "./shared";
import { setupConsoleInterceptor } from "./interceptors/consoleInterceptor";
import { setupFetchInterceptor }   from "./interceptors/fetchInterceptor";
import { setupXhrInterceptor }     from "./interceptors/xhrInterceptor";

export const treeViewerBridge = createTreeViewerBridge("__PORT__");

setupConsoleInterceptor(treeViewerBridge);
setupFetchInterceptor(treeViewerBridge);
${isRn ? "setupXhrInterceptor(treeViewerBridge); // React Native uses XHR under the hood" : "setupXhrInterceptor(treeViewerBridge);"}

// ─── Auto-attach default axios instance ──────────────────────────────────────
// If the project uses axios, we attach interceptors to the default instance.
// For axios.create() instances, call attachAxios(instance) manually.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const axiosModule = require("axios");
  const axiosInstance = axiosModule?.default ?? axiosModule;
  if (axiosInstance?.interceptors) {
    attachAxios(axiosInstance);
  }
} catch { /* axios not installed — skip */ }

// ─── attachAxios — for axios.create() instances ───────────────────────────────
// Usage: import { attachAxios } from "./codetraxisAgent";
//        attachAxios(myAxiosInstance);
export function attachAxios(instance: any): void {
  if (!instance?.interceptors) return;

  const INSTALLED_KEY = "__tv_axios_installed__";
  if (instance[INSTALLED_KEY]) return;
  instance[INSTALLED_KEY] = true;

  const REQ_ID_KEY    = "__tv_req_id__";
  const REQ_START_KEY = "__tv_req_start__";

  const joinUrl = (base?: string, url?: string) => {
    if (!base) return url || "";
    if (!url)  return base;
    try { return new URL(url, base).toString(); } catch { return \`\${base}\${url}\`; }
  };

  const normalizeHeaders = (h: unknown): Record<string, string> | undefined => {
    if (!h) return undefined;
    try {
      if (typeof (h as any).toJSON === "function") return (h as any).toJSON() as Record<string, string>;
      return { ...(h as Record<string, string>) };
    } catch { return undefined; }
  };

  instance.interceptors.request.use(
    (config: any) => {
      const id    = treeViewerBridge.uid();
      const start = Date.now();
      config[REQ_ID_KEY]    = id;
      config[REQ_START_KEY] = start;
      treeViewerBridge.send({
        id, type: "network", transport: "axios",
        method: (config.method || "get").toUpperCase(),
        url: joinUrl(config.baseURL, config.url),
        requestHeaders: normalizeHeaders(config.headers),
        requestBody: treeViewerBridge.safeSerialize(config.data),
        state: "pending", timestamp: start,
      });
      return config;
    },
    (error: any) => {
      treeViewerBridge.send({
        id: treeViewerBridge.uid(), type: "network", transport: "axios",
        state: "error", timestamp: Date.now(),
        error: treeViewerBridge.safeSerialize(error),
      });
      return Promise.reject(error);
    },
  );

  instance.interceptors.response.use(
    (response: any) => {
      const id    = response.config[REQ_ID_KEY]    || treeViewerBridge.uid();
      const start = response.config[REQ_START_KEY] || Date.now();
      treeViewerBridge.send({
        id, type: "network", transport: "axios",
        method: (response.config.method || "get").toUpperCase(),
        url: joinUrl(response.config.baseURL, response.config.url),
        status: response.status,
        requestHeaders: normalizeHeaders(response.config.headers),
        requestBody: treeViewerBridge.safeSerialize(response.config.data),
        responseHeaders: normalizeHeaders(response.headers),
        responseBody: treeViewerBridge.safeSerialize(response.data),
        state: "success", duration: Date.now() - start, timestamp: start,
      });
      return response;
    },
    (error: any) => {
      const cfg   = error?.config || {};
      const id    = cfg[REQ_ID_KEY]    || treeViewerBridge.uid();
      const start = cfg[REQ_START_KEY] || Date.now();
      treeViewerBridge.send({
        id, type: "network", transport: "axios",
        method: (cfg.method || "get").toUpperCase(),
        url: joinUrl(cfg.baseURL, cfg.url),
        status: error?.response?.status,
        requestHeaders: normalizeHeaders(cfg.headers),
        requestBody: treeViewerBridge.safeSerialize(cfg.data),
        responseHeaders: normalizeHeaders(error?.response?.headers),
        responseBody: treeViewerBridge.safeSerialize(error?.response?.data),
        state: "error", duration: Date.now() - start, timestamp: start,
        error: treeViewerBridge.safeSerialize({ message: error?.message, code: error?.code, name: error?.name }),
      });
      return Promise.reject(error);
    },
  );
}

// ─── attachSocketIO — for socket.io-client instances ─────────────────────────
// React Native uses socket.io which doesn't go through globalThis.WebSocket.
// Usage: import { attachSocketIO } from "./codetraxisAgent";
//        attachSocketIO(socket);  // call after getChatSocket() or io()
export function attachSocketIO(socket: any): void {
  if (!socket) return;

  const INSTALLED_KEY = "__tv_sio_installed__";
  if (socket[INSTALLED_KEY]) return;
  socket[INSTALLED_KEY] = true;

  const url: string = socket.io?.uri ?? socket.nsp ?? "socket.io";

  // ── Incoming events ──────────────────────────────────────────────────────
  socket.onAny((event: string, ...args: unknown[]) => {
    treeViewerBridge.send({
      id: treeViewerBridge.uid(),
      type: "network",
      transport: "websocket",
      url,
      method: "MESSAGE",
      responseBody: treeViewerBridge.truncate(
        JSON.stringify({ event, data: args.length === 1 ? args[0] : args }),
      ),
      state: "success",
      timestamp: Date.now(),
    });
  });

  // ── Outgoing events ──────────────────────────────────────────────────────
  const origEmit = socket.emit.bind(socket);
  socket.emit = (event: string, ...args: unknown[]) => {
    if (!["ping", "pong"].includes(event)) {
      treeViewerBridge.send({
        id: treeViewerBridge.uid(),
        type: "network",
        transport: "websocket",
        url,
        method: "SEND",
        requestBody: treeViewerBridge.truncate(
          JSON.stringify({ event, data: args[0] }),
        ),
        state: "success",
        timestamp: Date.now(),
      });
    }
    return origEmit(event, ...args);
  };
}

export {};
`.replace("__PORT__", serverPort);
}
