import fs from "node:fs";
import path from "node:path";
import { loadGitignore } from "./gitignoreLoader";
import { getGitStatusMap, type GitStatus, type GitStatusMap } from "../git/getGitStatus";

export type TreeNode = {
    name: string;
    path: string;       // относительный путь от корня проекта
    type: "folder" | "file";
    gitStatus?: GitStatus;
    children?: TreeNode[];
};

export type FileTree = {
    app: {
        name: string;
        rootPath: string;
    };
    tree: TreeNode[];
};

// Агрегируем git-статус папки по дочерним элементам:
// если внутри есть изменения — папка тоже подсвечивается
const FOLDER_STATUS_PRIORITY: GitStatus[] = [
    "conflicted",
    "deleted",
    "modified",
    "added",
    "renamed",
    "untracked",
];

const aggregateFolderStatus = (children: TreeNode[]): GitStatus | undefined => {
    for (const status of FOLDER_STATUS_PRIORITY) {
        if (hasStatus(children, status)) return status;
    }
    return undefined;
};

const hasStatus = (nodes: TreeNode[], status: GitStatus): boolean => {
    return nodes.some(
        (n) =>
            n.gitStatus === status ||
            (n.children && hasStatus(n.children, status))
    );
};

const buildNodes = (
    dir: string,
    rootDir: string,
    ig: ReturnType<typeof loadGitignore>,
    statusMap: GitStatusMap
): TreeNode[] => {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    return items
        .filter((item) => {
            const fullPath = path.join(dir, item.name);
            const relativePath = path
                .relative(rootDir, fullPath)
                .replace(/\\/g, "/");
            return !ig.ignores(relativePath);
        })
        .map((item) => {
            const fullPath = path.join(dir, item.name);
            const relativePath = path
                .relative(rootDir, fullPath)
                .replace(/\\/g, "/");

            if (item.isDirectory()) {
                const children = buildNodes(fullPath, rootDir, ig, statusMap);
                const gitStatus = aggregateFolderStatus(children);
                return {
                    name: item.name,
                    path: relativePath,
                    type: "folder",
                    ...(gitStatus ? { gitStatus } : {}),
                    children,
                };
            }

            const gitStatus = statusMap[relativePath];
            return {
                name: item.name,
                path: relativePath,
                type: "file",
                ...(gitStatus ? { gitStatus } : {}),
            };
        });
};

export const buildTree = (targetDir?: string): FileTree => {
    const workingDir = path.resolve(targetDir || process.cwd());
    const ig = loadGitignore(workingDir);
    const statusMap = getGitStatusMap(workingDir);

    return {
        app: {
            name: path.basename(workingDir),
            rootPath: workingDir,
        },
        tree: buildNodes(workingDir, workingDir, ig, statusMap),
    };
};