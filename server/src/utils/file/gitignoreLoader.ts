import fs from "node:fs";
import path from "node:path";
import ignore from "ignore";

// Минимальный hardcode — скрывается всегда даже без .gitignore
const ALWAYS_IGNORE = ["node_modules", ".git"];

export const loadGitignore = (rootDir: string) => {
    const ig = ignore();

    // Всегда скрываем node_modules и .git
    ig.add(ALWAYS_IGNORE);

    // Читаем .gitignore из корня тестового проекта
    const gitignorePath = path.join(rootDir, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
        const raw = fs.readFileSync(gitignorePath, "utf-8");

        // Нормализуем паттерны: убираем trailing slash (node_modules/ → node_modules),
        // пропускаем комментарии и пустые строки, убираем отрицания (!) — они не нужны для скрытия
        const lines = raw
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith("#"))
            .map((line) => line.replace(/\/$/, "")); // убираем trailing slash

        ig.add(lines);
    }

    return ig;
};
