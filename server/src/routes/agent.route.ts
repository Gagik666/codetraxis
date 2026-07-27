import { Router } from "express";
import { installAgent, removeAgent } from "../utils/agent/agentInstaller";
import { PROJECT_ID } from "../index";

const router = Router();

/**
 * POST /api/agent/install
 * Устанавливает агент в target-проект.
 */
router.post("/install", async (req, res) => {
  const targetDir = process.env.WORKING_DIR || process.cwd();

  const result = await installAgent(targetDir, PROJECT_ID);

  // Всегда возвращаем 200 — клиент проверяет result.success сам.
  // 400 приводит к тому, что axios бросает исключение и result.error теряется.
  res.json(result);
});

/**
 * GET /api/agent/config
 * Возвращает targetDir который сервер использует для поиска entry-файла.
 * Полезно для отладки.
 */
router.get("/config", (_req, res) => {
  res.json({
    targetDir: process.env.WORKING_DIR || process.cwd(),
    workingDir: process.env.WORKING_DIR ?? null,
    cwd: process.cwd(),
  });
});

/**
 * GET /api/agent/status
 * Проверяет, установлен ли агент.
 */
router.get("/status", async (req, res) => {
  const { findEntryFile } = await import("../utils/agent/agentInstaller");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const targetDir = process.env.WORKING_DIR || process.cwd();
  const entryFile = await findEntryFile(targetDir);

  if (!entryFile) {
    res.json({ installed: false });
    return;
  }

  try {
    const source = await fs.readFile(entryFile, "utf-8");
    const installed = source.includes("./codetraxisAgent");
    res.json({ installed, entryFile: installed ? entryFile : undefined });
  } catch {
    res.json({ installed: false });
  }
});

/**
 * DELETE /api/agent/uninstall
 * Удаляет агент из target-проекта: убирает строку импорта и удаляет codetraxisAgent.ts.
 */
router.delete("/uninstall", async (_req, res) => {
  const targetDir = process.env.WORKING_DIR || process.cwd();
  const result = await removeAgent(targetDir);
  res.json(result);
});

export default router;
