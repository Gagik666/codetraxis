export type TType = "folder" | "file";

export type TGitStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted"
  | "clean";

export type TTreeNode = {
    name: string;
    path: string;
    type: TType;
    gitStatus?: TGitStatus;
    children?: TTreeNode[];
};

export interface ITreeModel {
    app: {
        name: string;
        rootPath: string;
    };
    tree: TTreeNode[];
}
