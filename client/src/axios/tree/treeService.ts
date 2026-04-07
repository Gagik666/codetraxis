import { smartAxios } from "../axios";
import { TREE_ENDPOINTS } from "./treeEndpoints";
import type { ITreeModel } from "./treeModel";

export interface IFileContent {
    path: string;
    content: string;
}

export const getAppTree = () => {
    return smartAxios.get<ITreeModel>(TREE_ENDPOINTS.getAppTree);
};

export const getFileContent = (filePath: string) => {
    return smartAxios.get<IFileContent>(TREE_ENDPOINTS.getFile, {
        params: { path: filePath },
    });
};