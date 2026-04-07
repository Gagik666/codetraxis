import styles from "./HeadersTable.module.css";

export const HeadersTable = ({
  headers,
}: {
  headers?: Record<string, string>;
}) => {
  if (!headers || Object.keys(headers).length === 0)
    return <span className={styles.noData}>No headers captured</span>;
  return (
    <table className={styles.headersTable}>
      <tbody>
        {Object.entries(headers).map(([k, v]) => (
          <tr key={k}>
            <td className={styles.headerKey}>{k}</td>
            <td className={styles.headerVal}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
