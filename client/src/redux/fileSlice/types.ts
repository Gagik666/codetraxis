import type { IFileContent } from "../../axios/tree/treeService";

export interface IFileState {
    selectedFile: IFileContent | null;
    loading: boolean;
}
