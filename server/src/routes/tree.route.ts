// server/src/routes/tree.route.ts

import { Router } from "express";
import { buildTree } from "../utils/file/buildTree";

const router = Router();

router.get("/", (_req, res) => {
  // WORKING_DIR передаётся из bin/cli.js через env при запуске сервера
  const targetDir = process.env.WORKING_DIR || process.cwd();
  const tree = buildTree(targetDir);
  res.json(tree);
});

export default router;