import { useState } from "react";
import type React from "react";
import styles from "./UrlActions.module.css";

export const UrlActions = ({ url }: { url: string }) => {
  const isImg = /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(url);
  const [visible, setVisible] = useState(false);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVisible((v) => !v);
  };

  return (
    <span className={styles.urlInline}>
      <span className={styles.urlInlineBtns}>
        <button
          className={styles.urlInlineBtn}
          onClick={handleOpen}
          title="Open in new tab"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          open
        </button>
        <button
          className={`${styles.urlInlineBtn} ${visible ? styles.urlInlineBtnActive : ""}`}
          onClick={handleToggle}
          title={visible ? "Hide preview" : "Show preview"}
        >
          {visible ? (
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
          {visible ? "hide" : "show"}
        </button>
      </span>
      {visible &&
        (isImg ? (
          <img
            src={url}
            alt="preview"
            className={styles.urlPreviewImg}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <iframe
            src={url}
            title="preview"
            className={styles.urlPreviewIframe}
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        ))}
    </span>
  );
};
