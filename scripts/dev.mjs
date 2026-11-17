#!/usr/bin/env node
/**
 * `npm run dev`: one command to run Riffly locally.
 *
 *  1. First run (or after dependencies change): installs the app's npm packages and creates
 *     the Python environment for the analysis server.
 *  2. Starts the analysis server (http://localhost:8000) and the app (http://localhost:8081).
 *  3. Opens the app in your browser. Ctrl+C stops both.
 *
 * No extra dependencies: plain Node.js.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'frontend');
const backend = path.join(root, 'backend');
const isWin = process.platform === 'win32';
const venvPython = isWin ? path.join(backend, '.venv', 'Scripts', 'python.exe') : path.join(backend, '.venv', 'bin', 'python');
const API_PORT = 8000;
const APP_PORT = 8081;
const APP_URL = `http://localhost:${APP_PORT}`;
const setupOnly = process.argv.includes('--setup-only');
// `npm start`: lightweight mode for using the app. One Python process serves the pre-built app
// and the API; no development bundler (which alone uses ~900 MB of RAM).
const lean = process.argv.includes('--start');
const dist = path.join(frontend, 'dist');

const color = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const say = (msg) => console.log(color('1;35', '[riffly]'), msg);
const fail = (msg) => {
  console.error(color('1;31', '[riffly]'), msg);
  process.exit(1);
};

/**
 * npm/npx are .cmd files on Windows and must go through a shell. Pass them as one command
 * string (our arguments are fixed, so nothing needs escaping). Everything else runs directly.
 */
const NEEDS_SHELL = new Set(['npm', 'npx']);
function command(cmd, args) {
  return isWin && NEEDS_SHELL.has(cmd) ? { file: [cmd, ...args].join(' '), args: [], shell: true } : { file: cmd, args, shell: false };
}

/** Run a command to completion with its output shown. */
function run(cmd, args, cwd) {
  const c = command(cmd, args);
  const res = spawnSync(c.file, c.args, { cwd, stdio: 'inherit', shell: c.shell });
  if (res.status !== 0) fail(`Command failed: ${cmd} ${args.join(' ')}`);
}

function findPython() {
  const candidates = isWin
    ? [['py', ['-3']], ['python', []], ['python3', []], [path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Python', 'Python312', 'python.exe'), []]]
    : [['python3', []], ['python', []]];
  for (const [cmd, pre] of candidates) {
    const res = spawnSync(cmd, [...pre, '--version'], { encoding: 'utf8', shell: false });
    const m = /Python 3\.(\d+)/.exec(`${res.stdout}${res.stderr}`);
    if (res.status === 0 && m && Number(m[1]) >= 11) return [cmd, pre];
  }
  return null;
}

function setup() {
  if (!existsSync(path.join(frontend, 'node_modules'))) {
    say('Installing app packages (first run only, a few minutes)…');
    run('npm', ['install'], frontend);
  }

  if (!existsSync(venvPython)) {
    const py = findPython();
    if (!py) fail('Python 3.11+ is needed for the analysis server. Install it from https://www.python.org/downloads/ and run `npm run dev` again.');
    say('Creating the Python environment for the analysis server…');
    run(py[0], [...py[1], '-m', 'venv', path.join(backend, '.venv')], root);
  }
  // Cheap check that the server's packages are present (also catches newly added ones).
  const check = spawnSync(venvPython, ['-c', 'import fastapi, librosa, lameenc, multipart'], { cwd: backend });
  if (check.status !== 0) {
    say('Installing analysis-server packages (first run only, can take several minutes)…');
    run(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', '-r', 'requirements.txt'], backend);
  }
}

/** Newest modification time of any file under `dir` (skipping node_modules). */
function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return newest;
}

/** Build the web app into frontend/dist if it's missing or older than the source. */
function buildIfNeeded() {
  const index = path.join(dist, 'index.html');
  const sources = ['app', 'src', 'assets'].map((d) => path.join(frontend, d)).filter(existsSync);
  const sourceTime = Math.max(...sources.map(newestMtime), ...['package.json', 'app.json'].map((f) => statSync(path.join(frontend, f)).mtimeMs));
  if (existsSync(index) && statSync(index).mtimeMs >= sourceTime) return;
  say('Building the app (only when its code has changed, about a minute)…');
  run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'], frontend);
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port);
  });
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function openBrowser(url) {
  const [cmd, args] = isWin ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

// Harmless tool chatter that would otherwise drown out useful output.
const NOISE = /NO_COLOR' env is ignored|node --trace-warnings|Download the React DevTools/;

const children = [];

function start(name, colorCode, cmd, args, cwd, env = {}) {
  const c = command(cmd, args);
  const childEnv = { ...process.env, ...env };
  // Node warns on every start when both are set; keep FORCE_COLOR only.
  if (childEnv.FORCE_COLOR && childEnv.NO_COLOR) delete childEnv.NO_COLOR;
  const child = spawn(c.file, c.args, {
    cwd,
    env: childEnv,
    shell: c.shell,
    detached: !isWin, // own process group on macOS/Linux so we can stop the whole tree
  });
  const prefix = color(colorCode, `[${name}]`.padEnd(6));
  for (const stream of [child.stdout, child.stderr]) {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) if (line.trim() && !NOISE.test(line)) console.log(`${prefix} ${line}`);
    });
  }
  child.on('exit', (code) => {
    if (!stopping) {
      say(`${name} stopped unexpectedly (exit code ${code}). Shutting down.`);
      stopAll(1);
    }
  });
  children.push(child);
  return child;
}

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    try {
      if (isWin) spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
      else process.kill(-c.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => {
  say('Stopping…');
  stopAll(0);
});
process.on('SIGTERM', () => stopAll(0));

async function main() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 20) fail(`Node.js 20+ is required (you have ${process.versions.node}).`);

  setup();
  if (setupOnly) {
    say('Setup complete. Run `npm run dev` to start Riffly.');
    return;
  }

  if (lean) {
    buildIfNeeded();
    if (!(await portFree(API_PORT))) fail(`Port ${API_PORT} is already in use. Is Riffly already running in another window? Close it and try again.`);
    say('Starting Riffly…');
    start('riffly', '36', venvPython, ['-m', 'uvicorn', 'app.main:app', '--port', String(API_PORT)], backend, { APP_DIR: dist });
    const url = `http://localhost:${API_PORT}`;
    if (!(await waitFor(`${url}/api/health`, 120_000))) fail('Riffly did not start. Check the lines above.');
    console.log('');
    say(color('1;32', `Riffly is running → ${url}`));
    if (!process.env.RIFFLY_NO_OPEN) openBrowser(url);
    say('Press Ctrl+C here to stop.');
    console.log('');
    return;
  }

  for (const [port, what] of [[API_PORT, 'analysis server'], [APP_PORT, 'app']]) {
    if (!(await portFree(port))) {
      fail(`Port ${port} (needed for the ${what}) is already in use. Is Riffly already running in another window? Close it and try again.`);
    }
  }

  say('Starting the analysis server and the app…');
  start('api', '36', venvPython, ['-m', 'uvicorn', 'app.main:app', '--port', String(API_PORT)], backend);
  // BROWSER=none: we open the browser ourselves once the app has finished bundling.
  start('app', '33', 'npx', ['expo', 'start', '--web', '--port', String(APP_PORT)], frontend, { BROWSER: 'none' });

  const [apiUp, appUp] = await Promise.all([
    waitFor(`http://localhost:${API_PORT}/api/health`, 120_000),
    waitFor(APP_URL, 240_000),
  ]);
  if (!apiUp) say(color('33', 'The analysis server did not start. Analysing songs will not work; check the [api] lines above.'));
  if (!appUp) fail('The app did not start. Check the [app] lines above.');

  // Load the page once so the first visit isn't spent waiting for the bundle.
  await waitFor(`${APP_URL}/`, 60_000);
  console.log('');
  say(color('1;32', `Riffly is running → ${APP_URL}`));
  if (process.env.RIFFLY_NO_OPEN) say('Press Ctrl+C here to stop.');
  else {
    say('Opening your browser. Press Ctrl+C here to stop.');
    openBrowser(APP_URL);
  }
  console.log('');
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
