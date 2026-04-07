import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import treeRoute from './routes/tree.route';
import fileRoute from './routes/file.route';
import agentRoute from './routes/agent.route';
import { startWatcher } from './utils/watcher/watcherService';
import { setupDebugHub } from './utils/agent/debugHub';

dotenv.config({ quiet: true } as any);

const app = express();
const PORT = parseInt(process.env.PORT ?? '3333', 10);

app.use(cors({
    origin: (origin, cb) => {
        // Allow requests with no origin (curl, Postman, same-origin)
        // and only localhost / 127.0.0.1 browser origins
        if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            cb(null, true);
        } else {
            cb(new Error('CORS: external origin blocked'));
        }
    },
}));
app.use(express.json());

app.use("/api/tree", treeRoute);
app.use("/api/file", fileRoute);
app.use("/api/agent", agentRoute);

// ── Serve built client (production mode) ──────────────────────────────────────
// __dirname в CommonJS = server/dist, поэтому ../../client/dist
const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback — всё остальное отдаём index.html
    app.get('/{*path}', (_req, res) => {
        res.sendFile(path.join(clientDist, 'index.html'));
    });
}

// Создаём HTTP-сервер вручную чтобы подцепить WebSocket на тот же порт
const httpServer = http.createServer(app);

// Debug WebSocket hub (агент → /agent, viewer → /debug)
setupDebugHub(httpServer);

// Bind to localhost only — never expose to the network
const HOST = '127.0.0.1';

httpServer.listen(PORT, HOST, () => {
    const targetDir = process.env.WORKING_DIR || process.cwd();
    process.stdout.write(`ready on http://localhost:${PORT}\nWatching: ${targetDir}\n`);
    startWatcher(targetDir, httpServer);
});
