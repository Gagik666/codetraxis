import { execSync } from "node:child_process";

export type GitStatus =
  | "modified"   // изменён (unstaged)
  | "added"      // staged новый файл
  | "deleted"    // удалён
  | "renamed"    // переименован
  | "untracked"  // не отслеживается
  | "conflicted" // конфликт слияния
  | "clean";     // без изменений

// Результат: map { "src/App.tsx": "modified" }
export type GitStatusMap = Record<string, GitStatus>;

// Разбор одной строки porcelain v1: "XY path"
const parseCode = (xy: string): GitStatus => {
  const x = xy[0]; // staged
  const y = xy[1]; // unstaged

  if (x === "?" && y === "?") return "untracked";
  if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D"))
    return "conflicted";
  if (x === "R" || y === "R") return "renamed";
  if (x === "A") return "added";
  if (x === "D" || y === "D") return "deleted";
  if (x === "M" || y === "M") return "modified";

  return "clean";
};

export const getGitStatusMap = (rootDir: string): GitStatusMap => {
  try {
    // Проверяем что это git-репозиторий
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: rootDir,
      stdio: "ignore",
    });

    const output = execSync("git status --porcelain -u", {
      cwd: rootDir,
      encoding: "utf-8",
    });

    const map: GitStatusMap = {};

    output
      .split("\n")
      .filter(Boolean)
      .forEach((line) => {
        const xy = line.slice(0, 2);
        // Порcelain: "XY path" или "XY oldpath -> newpath"
        const rawPath = line.slice(3).trim();
        // Обрабатываем rename: "old -> new"
        const filePath = rawPath.includes(" -> ")
          ? rawPath.split(" -> ")[1]
          : rawPath;

        const status = parseCode(xy);
        if (status !== "clean") {
          map[filePath.replace(/\\/g, "/")] = status;
        }
      });

    return map;
  } catch {
    // Не git-репозиторий или git не установлен — возвращаем пустой map
    return {};
  }
};
