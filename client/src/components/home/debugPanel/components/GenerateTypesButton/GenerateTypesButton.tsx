import type React from "react";
import styles from "./GenerateTypesButton.module.css";

interface GenerateTypesButtonProps {
  disabled?: boolean;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
}

export const GenerateTypesButton = ({
  disabled,
  active,
  onClick,
}: GenerateTypesButtonProps) => {
  if (disabled) return null;

  return (
    <button
      className={[styles.genBtn, active ? styles.genBtnActive : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      title="Generate TypeScript types"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
      types
    </button>
  );
};
