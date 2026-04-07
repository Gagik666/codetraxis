import type { MouseEvent as ReactMouseEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { COLORS } from "../../../constants/colors/colors";
import { useAppSelector } from "../../../hooks/redux/useRedux";
import { selectAppTree } from "../../../redux/treeSlice/TreeSlice";
import { selectFile } from "../../../redux/fileSlice/FileSlice";
import { getFileContentThunk } from "../../../redux/fileSlice/asyncthunk";
import type { AppDispatch } from "../../../redux/Store";
import { TreeItem } from "../treeItem/TreeItem";
import styles from "./LeftContentTree.module.css";

export const LeftContentTree = () => {
  const dispatch = useDispatch<AppDispatch>();
  const appTree = useAppSelector(selectAppTree);
  const selectedFile = useAppSelector(selectFile);
  const items = appTree?.tree ?? [];
  const [width, setWidth] = useState(200);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(200);

  const onMouseMove = (event: MouseEvent) => {
    if (!draggingRef.current) return;
    const delta = event.clientX - startXRef.current;
    const next = Math.max(140, Math.min(480, startWidthRef.current + delta));
    setWidth(next);
  };

  const stopDrag = () => {
    draggingRef.current = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", stopDrag);
  };

  const onDragStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    draggingRef.current = true;
    startXRef.current = event.clientX;
    startWidthRef.current = width;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopDrag);
  };

  const containerStyle = useMemo(
    () => ({
      width: `${width}px`,
      backgroundColor: COLORS.boxBackgroundDark,
      borderRightColor: COLORS.borderColor,
    }),
    [width]
  );

  return (
    <div className={styles.container} style={containerStyle}>
      {items.length === 0 ? (
        <div className={styles.empty}>Нет файлов</div>
      ) : (
        items.map((node) => (
          <TreeItem
            key={node.path}
            {...node}
            selectedPath={selectedFile?.path}
            onFileClick={(file) => {
              dispatch(getFileContentThunk(file.path));
            }}
          />
        ))
      )}
      <div className={styles.resizer} onMouseDown={onDragStart} />
    </div>
  );
};
