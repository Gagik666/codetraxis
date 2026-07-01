#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const c = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  bold:    '\x1b[1m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  white:   '\x1b[97m',
  gray:    '\x1b[90m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  // Neon/futuristic colors
  neonCyan:    '\x1b[96m',
  neonMagenta: '\x1b[95m',
  neonGreen:   '\x1b[92m',
  neonPurple:  '\x1b[38;5;141m',
  neonPink:    '\x1b[38;5;213m',
  neonBlue:    '\x1b[38;5;117m',
  deepPurple:  '\x1b[38;5;93m',
  electricBlue:'\x1b[38;5;81m',
  bg: {
    cyan:   '\x1b[46m',
    green:  '\x1b[42m',
    blue:   '\x1b[44m',
    magenta:'\x1b[45m',
  }
};

const gradient = (text) => {
  const colors = [c.cyan, c.blue, c.magenta];
  return text.split('').map((ch, i) =>
    colors[i % colors.length] + ch
  ).join('') + c.reset;
};

const neonGradient = (line, idx) => {
  // Holographic gradient: cyan → purple → magenta → blue
  const colors = [
    c.neonCyan + c.bold,
    c.electricBlue + c.bold,
    c.neonPurple + c.bold,
    c.neonMagenta + c.bold,
    c.neonPink + c.bold,
    c.neonBlue + c.bold
  ];
  return colors[idx % colors.length] + line + c.reset;
};

const box = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  dot: '●', arrow: '➜', check: '✓', cross: '✗',
  rocket: '🚀', folder: '📁', link: '🔗', eye: '👁️'
};

const spinner = {
  frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  current: 0,
  get() {
    this.current = (this.current + 1) % this.frames.length;
    return this.frames[this.current];
  }
};

// ── Args ──────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const devMode   = args.includes('--dev');
const showHelp  = args.includes('--help') || args.includes('-h');
const targetArg = args.find(a => !a.startsWith('-'));
const ROOT      = targetArg ? path.resolve(targetArg) : process.cwd();
const PORT      = parseInt(process.env.PORT || '3333', 10);

// ── Validate target dir ───────────────────────────────────────────────────────
if (showHelp) {
  process.stdout.write([
    '',
    `  ${c.cyan}${c.bold}codetraxis${c.reset}  — live file tree, code viewer & debug panel`,
    '',
    `  ${c.bold}Usage${c.reset}`,
    `    codetraxis [path]          start for the given project directory`,
    `    codetraxis .               start for the current directory`,
    `    codetraxis --dev           start in development mode`,
    `    codetraxis --help          show this help`,
    '',
    `  ${c.bold}Env vars${c.reset}`,
    `    PORT=4444 codetraxis .     override default port (3333)`,
    '',
    `  ${c.bold}Examples${c.reset}`,
    `    npx codetraxis .`,
    `    npx codetraxis ~/projects/my-app`,
    `    PORT=4000 codetraxis .`,
    '',
  ].join('\n') + '\n');
  process.exit(0);
}

if (!fs.existsSync(ROOT)) {
  process.stderr.write(`\n  ${c.red}✗${c.reset}  Directory not found: ${ROOT}\n\n`);
  process.exit(1);
}

// ── Print header ──────────────────────────────────────────────────────────────
function printHeader(port) {
  const url     = `http://localhost:${port}`;
  const project = path.basename(ROOT);
  const mode    = devMode ? 'development' : 'production';
  const version = getVersion();

  const termWidth = process.stdout.columns || 80;

  // Compact logo for narrow terminals
  const logoCompact = [
    '   ██████╗ ████████╗██╗  ██╗',
    '  ██╔════╝╚══██╔══╝╚██╗██╔╝',
    '  ██║        ██║    ╚███╔╝ ',
    '  ██║        ██║    ██╔██╗ ',
    '  ╚██████╗   ██║   ██╔╝ ██╗',
    '   ╚═════╝   ╚═╝   ╚═╝  ╚═╝',
    '',
    '  CODETRAXIS'
  ];

  // Full logo for wide terminals
  const logoFull = [
    '   ██████╗ ██████╗ ██████╗ ███████╗████████╗██████╗  █████╗ ██╗  ██╗██╗███████╗',
    '  ██╔════╝██╔═══██╗██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗╚██╗██╔╝██║██╔════╝',
    '  ██║     ██║   ██║██║  ██║█████╗     ██║   ██████╔╝███████║ ╚███╔╝ ██║███████╗',
    '  ██║     ██║   ██║██║  ██║██╔══╝     ██║   ██╔══██╗██╔══██║ ██╔██╗ ██║╚════██║',
    '  ╚██████╗╚██████╔╝██████╔╝███████╗   ██║   ██║  ██║██║  ██║██╔╝ ██╗██║███████║',
    '   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝'
  ];

  // Mini logo for very narrow terminals
  const logoMini = [
    '  ╔═════════════╗',
    '  ║ CODETRAXIS  ║',
    '  ╚═════════════╝'
  ];

  let logo, lineWidth;
  if (termWidth < 60) {
    logo = logoMini;
    lineWidth = 40;
  } else if (termWidth < 90) {
    logo = logoCompact;
    lineWidth = 50;
  } else {
    logo = logoFull;
    lineWidth = 78;
  }

  process.stdout.write('\n');
  logo.forEach((line, i) => process.stdout.write(neonGradient(line, i) + '\n'));
  process.stdout.write(`\n  ${c.deepPurple}${box.h.repeat(Math.min(lineWidth, termWidth - 4))}${c.reset}\n\n`);

  process.stdout.write(`  ${c.neonCyan}${c.bold}${project}${c.reset}  ${c.dim}${c.neonPurple}v${version}${c.reset}\n`);
  process.stdout.write(`  ${c.electricBlue}${box.arrow}${c.reset}  ${c.neonBlue}${url}${c.reset}\n`);
  process.stdout.write(`  ${box.rocket}  ${devMode ? c.neonPink : c.neonGreen}${c.bold}${mode}${c.reset}\n`);
  process.stdout.write(`\n  ${c.deepPurple}${box.h.repeat(Math.min(lineWidth, termWidth - 4))}${c.reset}\n\n`);
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
    process.stdout.write(`  ${c.yellow}↳${c.reset}  first run — building codetraxis...\n`);
    process.stdout.write(`  ${c.dim}  (this only happens once)${c.reset}\n\n`);
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
  let spinnerInterval = null;

  const showSpinner = (text) => {
    if (spinnerInterval) clearInterval(spinnerInterval);
    spinnerInterval = setInterval(() => {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(2);
      process.stdout.write(`${c.neonCyan}${spinner.get()}${c.reset}  ${c.dim}${text}${c.reset}`);
    }, 80);
  };

  const stopSpinner = () => {
    if (spinnerInterval) {
      clearInterval(spinnerInterval);
      spinnerInterval = null;
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }
  };

  showSpinner('Starting server...');

  server.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      if (line.includes('[dotenv') || line.includes('tip:')) continue;
      if (line.includes('running on') || line.includes('ready on')) {
        if (!serverReady) {
          serverReady = true;
          stopSpinner();
          process.stdout.write(`  ${c.neonGreen}${c.bold}${box.check}${c.reset}  ${c.white}Server ready${c.reset}  ${c.electricBlue}${box.arrow}${c.reset}  ${c.dim}launching browser...${c.reset}\n`);
          showSpinner('Initializing watcher...');
        }
        continue;
      }
      if (line.includes('Watching:')) {
        if (!watchingShown) {
          watchingShown = true;
          stopSpinner();
          const dir = line.split('Watching:')[1]?.trim();
          const shortDir = dir.length > 60 ? '...' + dir.slice(-57) : dir;
          const termWidth = process.stdout.columns || 80;
          const lineWidth = Math.min(78, termWidth - 4);
          process.stdout.write(`  ${c.neonGreen}${c.bold}${box.check}${c.reset}  ${c.white}Watching${c.reset}  ${c.neonPurple}${shortDir}${c.reset}\n\n`);
          process.stdout.write(`  ${c.deepPurple}${box.h.repeat(lineWidth)}${c.reset}\n\n`);
        }
        continue;
      }
      if (line.includes('WebSocket') || line.includes('Debug hub')) continue;
      stopSpinner();
      process.stdout.write(`  ${c.dim}${box.dot} ${line}${c.reset}\n`);
    }
  });

  server.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      if (line.includes('[dotenv')) continue;
      process.stderr.write(`  ${c.red}${c.bold}${box.cross}${c.reset}  ${line}\n`);
    }
  });

  server.on('error', (err) => {
    stopSpinner();
    process.stderr.write(`\n  ${c.red}✗${c.reset}  ${err.message}\n\n`);
    process.exit(1);
  });

  server.on('exit', (code) => {
    stopSpinner();
    if (code !== 0) process.exit(code ?? 1);
  });

  setTimeout(async () => {
    const { default: open } = await import('open');
    open(`http://localhost:${port}`);
  }, 1200);

  process.on('SIGINT', () => {
    stopSpinner();
    process.stdout.write(`\n  ${c.dim}${box.dot} Shutting down gracefully...${c.reset}\n\n`);
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
      process.stdout.write(`  ${col}${c.bold}${tag}${c.reset}  ${c.dim}${line}${c.reset}\n`);
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
    process.stdout.write(`\n  ${c.dim}${box.dot} Shutting down gracefully...${c.reset}\n\n`);
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
