#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  bold:   '\x1b[1m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  white:  '\x1b[97m',
  gray:   '\x1b[90m',
};

// ── Args ──────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const devMode   = args.includes('--dev');
const targetArg = args.find(a => !a.startsWith('-'));
const ROOT      = targetArg ? path.resolve(targetArg) : process.cwd();
const PORT      = parseInt(process.env.PORT || '3333', 10);

// ── Print header ──────────────────────────────────────────────────────────────
function printHeader(port) {
  const url     = `http://localhost:${port}`;
  const project = ROOT;
  const mode    = devMode ? 'development' : 'production';
  const W       = 52;
  const line    = '─'.repeat(W);

  process.stdout.write('\n');
  process.stdout.write(`  ${c.cyan}${c.bold}codetraxis${c.reset}  ${c.dim}v${getVersion()}${c.reset}\n`);
  process.stdout.write(`  ${c.gray}${line}${c.reset}\n`);
  process.stdout.write(`  ${c.dim}project ${c.reset}${c.white}${project}${c.reset}\n`);
  process.stdout.write(`  ${c.dim}url     ${c.reset}${c.cyan}${url}${c.reset}\n`);
  process.stdout.write(`  ${c.dim}mode    ${c.reset}${devMode ? c.yellow + mode : c.green + mode}${c.reset}\n`);
  process.stdout.write(`  ${c.gray}${line}${c.reset}\n`);
  process.stdout.write('\n');
}

function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    return pkg.version || '1.0.0';
  } catch { return '1.0.0'; }
}

// ── Find free port ────────────────────────────────────────────────────────────
async function getFreePort(preferred) {
  const { default: getPort } = await import('get-port');
  const free = await getPort({ port: preferred });
  if (free !== preferred) {
    process.stdout.write(
      `  ${c.yellow}⚠${c.reset}  port ${preferred} busy — using ${c.cyan}${free}${c.reset}\n\n`
    );
  }
  return free;
}

// ── Production ────────────────────────────────────────────────────────────────
async function startProd() {
  const distEntry = path.join(__dirname, '../server/dist/index.js');

  if (!fs.existsSync(distEntry)) {
    process.stdout.write(`  ${c.yellow}↳${c.reset}  no dist found — building...\n\n`);
    try {
      execSync('npm run build', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
      process.stdout.write('\n');
    } catch {
      process.stderr.write(`\n  ${c.red}✗${c.reset}  build failed\n\n`);
      process.exit(1);
    }
  }

  const port = await getFreePort(PORT);
  printHeader(port);

  const server = spawn('node', [distEntry], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WORKING_DIR: ROOT, PORT: String(port) },
  });

  // Forward server stdout — filter noise, format nicely
  let serverReady = false;
  let watchingShown = false;
  server.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      if (line.includes('[dotenv') || line.includes('tip:')) continue;
      if (line.includes('running on') || line.includes('ready on')) {
        if (!serverReady) {
          serverReady = true;
          process.stdout.write(`  ${c.green}✓${c.reset}  ${c.white}server ready${c.reset}  ${c.dim}→  opening browser${c.reset}\n`);
        }
        continue;
      }
      if (line.includes('Watching:')) {
        if (!watchingShown) {
          watchingShown = true;
          const dir = line.split('Watching:')[1]?.trim();
          process.stdout.write(`  ${c.green}✓${c.reset}  ${c.dim}watching${c.reset}  ${c.gray}${dir}${c.reset}\n`);
        }
        continue;
      }
      if (line.includes('WebSocket') || line.includes('Debug hub')) continue;
      process.stdout.write(`  ${c.dim}${line}${c.reset}\n`);
    }
  });

  server.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      if (line.includes('[dotenv')) continue;
      process.stderr.write(`  ${c.red}!${c.reset}  ${line}\n`);
    }
  });

  server.on('error', (err) => {
    process.stderr.write(`\n  ${c.red}✗${c.reset}  ${err.message}\n\n`);
    process.exit(1);
  });

  server.on('exit', (code) => {
    if (code !== 0) process.exit(code ?? 1);
  });

  setTimeout(async () => {
    const { default: open } = await import('open');
    open(`http://localhost:${port}`);
  }, 1200);

  process.on('SIGINT', () => {
    process.stdout.write(`\n  ${c.dim}shutting down...${c.reset}\n\n`);
    server.kill();
    process.exit(0);
  });
}

// ── Dev ───────────────────────────────────────────────────────────────────────
async function startDev() {
  const port = await getFreePort(PORT);
  printHeader(port);

  const serverPath = path.join(__dirname, '../server');
  const clientPath = path.join(__dirname, '../client');

  const server = spawn('npm', ['run', 'dev'], {
    cwd: serverPath, shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WORKING_DIR: ROOT, PORT: String(port) },
  });

  const client = spawn('npm', ['run', 'dev'], {
    cwd: clientPath, shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const prefix = (tag, col) => (data) => {
    data.toString().split('\n').filter(l => l.trim()).forEach(line => {
      if (line.includes('[dotenv')) return;
      process.stdout.write(`  ${col}${tag}${c.reset}  ${c.dim}${line}${c.reset}\n`);
    });
  };

  server.stdout.on('data', prefix('srv', c.green));
  server.stderr.on('data', prefix('srv', c.red));
  client.stdout.on('data', prefix('ui ', c.cyan));
  client.stderr.on('data', prefix('ui ', c.red));

  server.on('error', (err) => { process.stderr.write(`\n  ${c.red}✗  server: ${err.message}${c.reset}\n`); process.exit(1); });
  client.on('error', (err) => { process.stderr.write(`\n  ${c.red}✗  client: ${err.message}${c.reset}\n`); process.exit(1); });

  setTimeout(async () => {
    const { default: open } = await import('open');
    open('http://localhost:5173');
  }, 3500);

  process.on('SIGINT', () => {
    process.stdout.write(`\n  ${c.dim}shutting down...${c.reset}\n\n`);
    server.kill(); client.kill();
    process.exit(0);
  });
}

// ── Run ───────────────────────────────────────────────────────────────────────
if (devMode) {
  startDev().catch(err => { console.error(err); process.exit(1); });
} else {
  startProd().catch(err => { console.error(err); process.exit(1); });
}
