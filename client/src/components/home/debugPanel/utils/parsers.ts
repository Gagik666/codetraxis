export function tryParseJson(v: unknown): object | null {
  if (typeof v === "object" && v !== null) return v as object;
  if (typeof v !== "string") return null;
  try {
    const p = JSON.parse(v);
    return typeof p === "object" && p !== null ? p : null;
  } catch {
    return null;
  }
}

export function isHttpUrl(str: unknown): str is string {
  if (typeof str !== "string") return false;
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isHtmlBody(body: unknown): boolean {
  if (typeof body !== "string") return false;
  const trimmed = body.trimStart();
  return (
    /^<!doctype\s+html/i.test(trimmed) ||
    /^<html[\s>]/i.test(trimmed) ||
    /^<\?xml/i.test(trimmed)
  );
}
