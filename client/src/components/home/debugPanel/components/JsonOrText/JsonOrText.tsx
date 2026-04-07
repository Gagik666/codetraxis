import JsonView from "@uiw/react-json-view";
import { darkTheme } from "@uiw/react-json-view/dark";
import type React from "react";
import { tryParseJson, isHttpUrl } from "../../utils/parsers";
import { UrlActions } from "../UrlActions/UrlActions";
import styles from "./JsonOrText.module.css";

export const JsonOrText = ({ value }: { value: unknown }) => {
  const parsed = tryParseJson(value);
  if (parsed) {
    return (
      <JsonView
        value={parsed}
        style={
          {
            ...darkTheme,
            background: "transparent",
            fontSize: 14,
            fontFamily: "inherit",
            lineHeight: 1.7,
            "--w-rjv-color": "#a7a7a7",
            "--w-rjv-key-string": "#7587a6",
            "--w-rjv-type-string-color": "#8f9d6a",
            "--w-rjv-type-int-color": "#cda869",
            "--w-rjv-type-float-color": "#cda869",
            "--w-rjv-type-boolean-color": "#cda869",
            "--w-rjv-type-null-color": "#cf6a4c",
            "--w-rjv-curlybraces-color": "#838184",
            "--w-rjv-brackets-color": "#838184",
            "--w-rjv-colon-color": "#838184",
            "--w-rjv-copied-color": "#8f9d6a",
            "--w-rjv-copied-success-color": "#8f9d6a",
            "--w-rjv-background-color": "transparent",
          } as React.CSSProperties
        }
        collapsed={1}
        displayDataTypes={false}
        displayObjectSize
        enableClipboard
        indentWidth={20}
      >
        <JsonView.String
          render={(props, { type, value }) => {
            if (type === "value" && isHttpUrl(value)) {
              const { children, ...rest } = props;
              return (
                <span
                  {...rest}
                  style={{
                    ...rest.style,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    flexWrap: "wrap",
                  }}
                >
                  {children}
                  <UrlActions url={value} />
                </span>
              );
            }
          }}
        />
      </JsonView>
    );
  }
  return <pre className={styles.pre}>{String(value ?? "—")}</pre>;
};
