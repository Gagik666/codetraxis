import { Router } from "express";
import fs from "node:fs";
import path from "node:path";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const resolveAndGuard = (
  targetDir: string,
  filePath: string
): { absolute: string } | { error: string; status: number } => {
  if (!filePath) return { error: "path query param is required", status: 400 };

  const absolute = path.resolve(targetDir, filePath);
  const root = path.resolve(targetDir);

  // path traversal guard
  if (!absolute.startsWith(root + path.sep) && absolute !== root) {
    return { error: "Access denied", status: 403 };
  }

  if (!fs.existsSync(absolute)) {
    return { error: "File not found", status: 404 };
  }

  return { absolute };
};

// ─── GET /api/file — JSON {path, content} ────────────────────────────────────

router.get("/", (req, res) => {
  const targetDir = process.env.WORKING_DIR || process.cwd();
  const filePath = req.query.path as string;

  const result = resolveAndGuard(targetDir, filePath);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  try {
    const content = fs.readFileSync(result.absolute, "utf-8");
    res.json({ path: filePath, content });
  } catch {
    res.status(500).json({ error: "Failed to read file" });
  }
});

// ─── GET /api/file/raw — raw bytes with correct Content-Type ─────────────────

router.get("/raw", (req, res) => {
  const targetDir = process.env.WORKING_DIR || process.cwd();
  const filePath = req.query.path as string;

  const result = resolveAndGuard(targetDir, filePath);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  // sendFile requires an absolute path and handles Content-Type automatically
  res.sendFile(result.absolute, (err) => {
    if (err) {
      res.status(500).json({ error: "Failed to send file" });
    }
  });
});

export default router;
