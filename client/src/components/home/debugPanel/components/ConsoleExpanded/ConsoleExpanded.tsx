import type { ConsoleEvent } from "../../../../../redux/debugSlice/types";
import { JsonOrText } from "../JsonOrText/JsonOrText";
import styles from "./ConsoleExpanded.module.css";

export const ConsoleExpanded = ({ event }: { event: ConsoleEvent }) => (
  <div className={styles.expanded}>
    {event.args.map((arg, i) => (
      <div key={i} className={styles.argRow}>
        <span className={styles.argIdx}>{i}</span>
        <div className={styles.argVal}>
          <JsonOrText value={arg} />
        </div>
      </div>
    ))}
  </div>
);
