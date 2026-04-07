import { loadGitignore } from "../file/gitignoreLoader";
import path from "node:path";

/**
 * Возвращает функцию-фильтр для chokidar, учитывающую .gitignore и ALWAYS_IGNORE.
 * @param rootDir Корень проекта
 */
export function makeGitignoreWatcher(rootDir: string) {
  const ig = loadGitignore(rootDir);
  return (filePath: string): boolean => {
    // относительный путь от корня проекта
    const relative = path.relative(rootDir, filePath).replace(/\\/g, "/");
    if (!relative) return false; // Корень проекта не игнорируем!
    return ig.ignores(relative);
  };
}
