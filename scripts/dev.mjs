#!/usr/bin/env node
/**
 * Riffly launcher. Riffly is an app (Windows now, Android next), not a website.
 *
 *   npm run dev          Open the Riffly Windows app. Builds it first only when its code has
 *                        changed (the first build takes a few minutes). No server needed: songs
 *                        are analysed on this PC by the built-in C++ engine.
 *   npm run build        Build the Windows installers (.exe and .msi).
 *   npm run dev:live     For editing Riffly's code: the app with live reload.
 *   npm run transcribe-server
 *                        Optional: the Python server for the experimental "Transcribe" tab.
 *   npm run setup        Install dependencies only.
 *   npm run shortcut     Add "Riffly" to the Start menu (Windows search finds it). It opens the
 *                        app and rebuilds it first whenever the code has changed.
 *
 * Plain Node.js, no extra dependencies.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'frontend');
const backend = path.join(root, 'backend');
const tauriDir = path.join(frontend, 'src-tauri');
const isWin = process.platform === 'win32';
const exe = path.join(tauriDir, 'target', 'release', isWin ? 'riffly.exe' : 'riffly');
const venvPython = isWin ? path.join(backend, '.venv', 'Scripts', 'python.exe') : path.join(backend, '.venv', 'bin', 'python');
const mode = process.argv[2] ?? 'open';

const color = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const say = (msg) => console.log(color('1;35', '[riffly]'), msg);
const fail = (msg) => {
  console.error(color('1;31', '[riffly]'), msg);
  process.exit(1);
};

// Rust's cargo lives in ~/.cargo/bin; terminals opened before Rust was installed don't have it.
const cargoBin = path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.cargo', 'bin');
const PATH = `${cargoBin}${path.delimiter}${process.env.PATH ?? process.env.Path ?? ''}`;
const toolEnv = { ...process.env, PATH, Path: PATH };

/** npm/npx are .cmd files on Windows and must go through a shell (fixed args, no escaping needed). */
function command(cmd, args) {
  return isWin && (cmd === 'npm' || cmd === 'npx') ? { file: [cmd, ...args].join(' '), args: [], shell: true } : { file: cmd, args, shell: false };
}

function run(cmd, args, cwd) {
  const c = command(cmd, args);
  const res = spawnSync(c.file, c.args, { cwd, stdio: 'inherit', shell: c.shell, env: toolEnv });
  if (res.status !== 0) fail(`Command failed: ${cmd} ${args.join(' ')}`);
}

function setupApp() {
  if (!existsSync(path.join(frontend, 'node_modules'))) {
    say('Installing app packages (first run only, a few minutes)...');
    run('npm', ['install'], frontend);
  }
  if (!existsSync(path.join(cargoBin, isWin ? 'cargo.exe' : 'cargo'))) {
    fail('Rust is needed to build the Riffly app. Install it from https://rustup.rs and run this again.');
  }
}

function setupPython() {
  if (!existsSync(venvPython)) {
    const candidates = isWin
      ? [['py', ['-3']], ['python', []], [path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Python', 'Python312', 'python.exe'), []]]
      : [['python3', []], ['python', []]];
    const py = candidates.find(([cmd, pre]) => {
      const r = spawnSync(cmd, [...pre, '--version'], { encoding: 'utf8' });
      const m = /Python 3\.(\d+)/.exec(`${r.stdout}${r.stderr}`);
      return r.status === 0 && m && Number(m[1]) >= 11;
    });
    if (!py) fail('Python 3.11+ is needed for the transcription server. Install it from https://www.python.org/downloads/');
    say('Creating the Python environment...');
    run(py[0], [...py[1], '-m', 'venv', path.join(backend, '.venv')], root);
  }
  if (spawnSync(venvPython, ['-c', 'import fastapi, librosa, lameenc, multipart'], { cwd: backend }).status !== 0) {
    say('Installing server packages (first run only, several minutes)...');
    run(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', '-r', 'requirements.txt'], backend);
  }
}

/** Newest modification time under the given files/folders (skipping build output). */
function newest(paths) {
  let t = 0;
  const walk = (p) => {
    if (!existsSync(p)) return;
    const st = statSync(p);
    if (!st.isDirectory()) return void (t = Math.max(t, st.mtimeMs));
    for (const e of readdirSync(p, { withFileTypes: true })) {
      if (['node_modules', 'target', 'gen', 'build', 'dist'].includes(e.name) || e.name.startsWith('.')) continue;
      walk(path.join(p, e.name));
    }
  };
  paths.forEach(walk);
  return t;
}

function buildAppIfNeeded() {
  const sources = [
    ...['app', 'src', 'assets', 'package.json', 'app.json'].map((p) => path.join(frontend, p)),
    ...['src', 'capabilities', 'tauri.conf.json', 'Cargo.toml', 'build.rs'].map((p) => path.join(tauriDir, p)),
    ...['src', 'include', 'third_party'].map((p) => path.join(root, 'engine', p)),
  ];
  if (existsSync(exe) && statSync(exe).mtimeMs >= newest(sources)) return;
  say(existsSync(exe) ? 'Riffly changed: rebuilding the app (about a minute)...' : 'Building the Riffly app for the first time (a few minutes)...');
  run('npx', ['tauri', 'build', '--no-bundle'], frontend);
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port);
  });
}

/** Run a long-lived child with prefixed output; Ctrl+C stops it. */
function runForeground(name, cmd, args, cwd) {
  const c = command(cmd, args);
  const child = spawn(c.file, c.args, { cwd, env: toolEnv, shell: c.shell, stdio: 'inherit' });
  const stop = () => {
    if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', (code) => process.exit(code ?? 0));
  say(`${name} running. Press Ctrl+C here to stop.`);
}

async function main() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 20) fail(`Node.js 20+ is required (you have ${process.versions.node}).`);

  switch (mode) {
    case 'setup':
      setupApp();
      say('Setup complete. Run `npm run dev` to open Riffly.');
      return;

    case 'build':
      setupApp();
      say('Building the Windows installers...');
      run('npx', ['tauri', 'build'], frontend);
      say(`Installers are in ${path.join(tauriDir, 'target', 'release', 'bundle')}`);
      return;

    case 'live':
      setupApp();
      if (!(await portFree(8081))) fail('Port 8081 is in use. Close the other Riffly development window and try again.');
      runForeground('Riffly (live reload)', 'npx', ['tauri', 'dev'], frontend);
      return;

    case 'transcribe-server':
      setupPython();
      if (!(await portFree(8000))) fail('Port 8000 is already in use (is the server already running?).');
      runForeground('Transcription server (http://localhost:8000)', venvPython, ['-m', 'uvicorn', 'app.main:app', '--port', '8000'], backend);
      return;

    case 'shortcut': {
      // A "Riffly" entry in the Start menu (so Windows search finds it). It runs this launcher,
      // which rebuilds the app first whenever the code has changed, then opens it. If a build
      // fails, the window stays open ("pause") so the error can be read.
      if (!isWin) fail('The Start-menu shortcut is for Windows.');
      const programs = path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
      const link = path.join(programs, 'Riffly.lnk');
      const icon = path.join(tauriDir, 'icons', 'icon.ico');
      const args = `/c ""${process.execPath}" "${path.join(root, 'scripts', 'dev.mjs')}" open || pause"`;
      const ps = [
        `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${link.replace(/'/g, "''")}')`,
        `$s.TargetPath = '${path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe')}'`,
        `$s.Arguments = '${args.replace(/'/g, "''")}'`,
        `$s.WorkingDirectory = '${root.replace(/'/g, "''")}'`,
        `$s.IconLocation = '${icon.replace(/'/g, "''")}'`,
        `$s.WindowStyle = 7`,
        `$s.Description = 'Riffly: guitar tuner and play-along'`,
        `$s.Save()`,
      ].join('; ');
      const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'inherit' });
      if (res.status !== 0) fail('Could not create the Start-menu shortcut.');
      say(`Added "Riffly" to the Start menu (${link}). Search for Riffly to open it.`);
      return;
    }

    default: {
      setupApp();
      buildAppIfNeeded();
      say('Opening Riffly...');
      spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
      say(color('1;32', 'Riffly is open. You can close this terminal.'));
    }
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
