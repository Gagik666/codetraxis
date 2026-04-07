/**
 * Generates TypeScript interface definitions from a JSON object.
 */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function toTypeName(key: string): string {
  // PascalCase from snake_case / camelCase / kebab-case
  return key
    .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

function isValidIdentifier(key: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
}

function quoteKey(key: string): string {
  return isValidIdentifier(key) ? key : JSON.stringify(key);
}

function inferType(
  value: JsonValue,
  key: string,
  interfaces: Map<string, string>,
  depth = 0,
): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number")
    return Number.isInteger(value) ? "number" : "number";
  if (typeof value === "string") return "string";

  if (Array.isArray(value)) {
    if (value.length === 0) return "unknown[]";
    // Sample first non-null element
    const sample = value.find((v) => v !== null) ?? value[0];
    const itemType = inferType(sample as JsonValue, key, interfaces, depth);
    return `${itemType}[]`;
  }

  if (typeof value === "object") {
    const interfaceName = toTypeName(key) + (depth > 0 ? `Item` : "");
    const lines: string[] = [];

    for (const [k, v] of Object.entries(value)) {
      const childName = toTypeName(k);
      const childType = inferType(
        v as JsonValue,
        childName,
        interfaces,
        depth + 1,
      );
      lines.push(`  ${quoteKey(k)}: ${childType};`);
    }

    const body = `interface ${interfaceName} {\n${lines.join("\n")}\n}`;
    interfaces.set(interfaceName, body);
    return interfaceName;
  }

  return "unknown";
}

export function generateTypes(json: unknown, rootName = "Root"): string {
  if (typeof json !== "object" || json === null) {
    return `// Not a JSON object or array`;
  }

  const interfaces = new Map<string, string>();

  if (Array.isArray(json)) {
    const sample = (json as JsonValue[]).find((v) => v !== null) ?? json[0];
    if (typeof sample === "object" && sample !== null && !Array.isArray(sample)) {
      inferType(sample as JsonValue, rootName, interfaces, 0);
      // rename root interface
      const rootBody = interfaces.get(rootName);
      if (rootBody) {
        interfaces.set(rootName, rootBody);
      }
    } else {
      return `type ${rootName} = ${inferType(json as JsonValue, rootName, interfaces, 0)};`;
    }
  } else {
    inferType(json as JsonValue, rootName, interfaces, 0);
  }

  // Output deepest (most nested) interfaces first, root last
  const ordered = Array.from(interfaces.values()).reverse();
  return ordered.join("\n\n");
}
