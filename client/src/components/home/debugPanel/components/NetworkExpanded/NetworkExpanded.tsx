import { useState } from "react";
import { createPortal } from "react-dom";
import type React from "react";
import type { NetworkEvent } from "../../../../../redux/debugSlice/types";
import type { NetTab, ResponseView } from "../../utils/types";
import { NET_TABS, getBodyToCopy } from "../../utils/filters";
import { getStatusColor } from "../../utils/colors";
import { isHtmlBody } from "../../utils/parsers";
import { tryParseJson } from "../../utils/parsers";
import { generateTypes } from "../../utils/generateTypes";
import { JsonOrText } from "../JsonOrText/JsonOrText";
import { HeadersTable } from "../HeadersTable/HeadersTable";
import { CopyButton } from "../CopyButton/CopyButton";
import { GenerateTypesButton } from "../GenerateTypesButton/GenerateTypesButton";
import { TypesPanel } from "../TypesPanel/TypesPanel";
import styles from "./NetworkExpanded.module.css";

export const NetworkExpanded = ({ event }: { event: NetworkEvent }) => {
  const defaultTab: NetTab = "response";
  const [tab, setTab] = useState<NetTab>(defaultTab);
  const [responseView, setResponseView] = useState<ResponseView>("code");
  const [typesCode, setTypesCode] = useState<string | null>(null);
  const copyText = getBodyToCopy(event, tab);

  // Determine the raw body for the current tab
  const currentBody = (() => {
    if (tab === "response") return event.responseBody;
    if (tab === "request") return event.requestBody;
    return null;
  })();
  const currentParsed = tryParseJson(currentBody);
  const canGenerateTypes = currentParsed !== null;

  const handleGenerateTypes = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentParsed) return;
    if (typesCode !== null) {
      // toggle off
      setTypesCode(null);
      return;
    }
    const rootName =
      tab === "response" ? "Response" : "RequestBody";
    setTypesCode(generateTypes(currentParsed, rootName));
  };

  const responseIsHtml = tab === "response" && isHtmlBody(event.responseBody);
  const htmlBody = String(event.responseBody ?? "");

  return (
    <div className={styles.expanded}>
      <div className={styles.expandedUrl}>{event.url}</div>
      <div className={styles.metaRow}>
        {event.status != null && (
          <span className={styles.metaItem}>
            <span className={styles.metaLabel}>Status</span>
            <span style={{ color: getStatusColor(event.status) }}>
              {event.status}
            </span>
          </span>
        )}
        {event.duration != null && (
          <span className={styles.metaItem}>
            <span className={styles.metaLabel}>Duration</span>
            <span>{event.duration.toFixed(0)} ms</span>
          </span>
        )}
        <span className={styles.metaItem}>
          <span className={styles.metaLabel}>Transport</span>
          <span>{event.transport.toUpperCase()}</span>
        </span>
      </div>
      <div className={styles.tabBar}>
        {NET_TABS.map((t) => (
          <button
            key={t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setTab(t.key);
            }}
          >
            {t.label}
          </button>
        ))}
        <span className={styles.tabBarSpacer} />
        {responseIsHtml && (
          <span className={styles.viewToggle}>
            <button
              className={`${styles.viewToggleBtn} ${responseView === "code" ? styles.viewToggleBtnActive : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setResponseView("code");
              }}
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
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              Code
            </button>
            <button
              className={`${styles.viewToggleBtn} ${responseView === "preview" ? styles.viewToggleBtnActive : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setResponseView("preview");
              }}
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
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
              </svg>
              Preview
            </button>
            <button
              className={styles.viewToggleBtn}
              onClick={(e) => {
                e.stopPropagation();
                window.open(event.url, "_blank", "noopener,noreferrer");
              }}
              title="Open URL in new tab"
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
              Open
            </button>
          </span>
        )}
        <CopyButton
          text={responseIsHtml && responseView === "preview" ? null : copyText}
        />
        <GenerateTypesButton
          disabled={!canGenerateTypes}
          active={typesCode !== null}
          onClick={handleGenerateTypes}
        />
      </div>
      <div className={styles.tabContent}>
        {tab === "response" && responseIsHtml && responseView === "preview" ? (
          <iframe
            srcDoc={htmlBody}
            title="HTML Preview"
            className={styles.htmlPreviewIframe}
            sandbox="allow-scripts allow-same-origin"
          />
        ) : tab === "response" ? (
          event.responseBody ? (
            <JsonOrText value={event.responseBody} />
          ) : (
            <span className={styles.noData}>No response body</span>
          )
        ) : null}
        {tab === "request" &&
          (event.requestBody ? (
            <JsonOrText value={event.requestBody} />
          ) : (
            <span className={styles.noData}>No request body</span>
          ))}
        {tab === "responseHeaders" && (
          <HeadersTable
            headers={
              (
                event as NetworkEvent & {
                  responseHeaders?: Record<string, string>;
                }
              ).responseHeaders
            }
          />
        )}
        {tab === "requestHeaders" && (
          <HeadersTable
            headers={
              (
                event as NetworkEvent & {
                  requestHeaders?: Record<string, string>;
                }
              ).requestHeaders
            }
          />
        )}
      </div>
      {typesCode !== null &&
        createPortal(
          <TypesPanel
            code={typesCode}
            onClose={() => setTypesCode(null)}
          />,
          document.body,
        )}
    </div>
  );
};
