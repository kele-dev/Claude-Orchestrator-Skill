#!/usr/bin/env node
// Maestro runner: setup, on, off, codex, gemini, status.
// Prints exactly one JSON summary line on stdout. Logs live in <store>/maestro/runs/<runId>/.
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync, lstatSync, realpathSync, writeSync,
} from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute, delimiter, extname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { storeInfo } from '../hooks/lib.mjs';
import {
  applyPatch, buildReviewPrompt, classifyCodex, classifyGemini, denyAllSettings, isSecretPath, ledgerBlocked, loadConfig,
  parseResetTime, readLedger, resolveGeminiModel, saveProjectConfig, writeLedger,
} from './maestro/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CODE_SCHEMA = join(HERE, 'maestro', 'code-result.schema.json');
const REVIEW_SCHEMA = join(HERE, 'maestro', 'review-result.schema.json');
const CI_PATHS = process.platform === 'win32' || process.platform === 'darwin';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

class Usage extends Error {}

function emit(summary, code = 0) {
  writeSync(1, JSON.stringify(summary) + '\n');
  process.exit(code);
}

// ---------- process helpers ----------

function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

// Returns { cmd, pre } (pre = args placed before the CLI args) or { error }.
function fromPath(p) {
  const ext = extname(p).toLowerCase();
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return { cmd: process.execPath, pre: [p] };
  if (ext === '.cmd' || ext === '.bat') {
    let text = '';
    try { text = readFileSync(p, 'utf8'); } catch { /* falls through */ }
    const m = /%dp0%[\\/]+(node_modules[\\/][^"\r\n]*?\.[cm]?js)/i.exec(text);
    if (!m) return { error: 'unsupported shim' };
    const target = join(dirname(p), ...m[1].split(/[\\/]+/));
    return { cmd: process.execPath, pre: [target] };
  }
  return { cmd: p, pre: [] };
}

function resolveBin(envName, name) {
  const over = process.env[envName];
  if (over) return isFile(over) ? fromPath(resolve(over)) : { error: `${envName} not found: ${over}` };
  const exts = process.platform === 'win32' ? ['.exe', '.cmd'] : [''];
  for (const dir of (process.env.PATH || process.env.Path || '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = join(dir, name + ext);
      if (isFile(p)) return fromPath(p);
    }
  }
  return { error: 'not installed' };
}

function runSync(bin, args, opts = {}) {
  if (bin.error) return { status: -1, stdout: '', stderr: bin.error };
  const r = spawnSync(bin.cmd, [...bin.pre, ...args], {
    encoding: 'utf8', windowsHide: true, timeout: 30000, env: process.env, ...opts,
  });
  return { status: r.error ? -1 : r.status, stdout: r.stdout || '', stderr: (r.stderr || '') + (r.error ? String(r.error.message) : '') };
}

// Async run with stdin text, timeout kill, and streaming of stdout/stderr into files.
function runWorker(bin, args, { cwd, input, timeoutMs, outFile, errFile }) {
  return new Promise((resolveP) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const child = spawn(bin.cmd, [...bin.pre, ...args], {
      cwd, windowsHide: true, env: process.env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32',
    });
    const done = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      try { writeFileSync(outFile, stdout); writeFileSync(errFile, stderr); } catch { /* best effort */ }
      resolveP({ exitCode, stdout, stderr, timedOut });
    };
    let grace = null;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      } else if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
      }
      // A grandchild may keep the pipes open so `close` never fires: settle anyway.
      grace = setTimeout(() => done(-1), 3000);
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('error', (e) => { stderr += `\nspawn error: ${e.message}`; done(-1); });
    child.on('close', (code) => done(code ?? -1));
    child.stdin.on('error', () => { /* child may exit before reading */ });
    child.stdin.end(input);
  });
}

function git(cwd, args, { input, buffer } = {}) {
  const r = spawnSync('git', args, {
    cwd, windowsHide: true, maxBuffer: 1 << 29, input, encoding: buffer ? 'buffer' : 'utf8',
  });
  return {
    status: r.error ? -1 : r.status,
    out: r.stdout ?? (buffer ? Buffer.alloc(0) : ''),
    err: String(r.stderr ?? '') + (r.error ? String(r.error.message) : ''),
  };
}
const gitOut = (cwd, args) => { const r = git(cwd, args); return r.status === 0 ? r.out.trim() : ''; };

// ---------- misc helpers ----------

const pad = (n) => String(n).padStart(2, '0');
function stamp(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function nextMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}
function parseArgs(argv, valueFlags, boolFlags) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (boolFlags.includes(a)) out[a.slice(2)] = true;
    else if (valueFlags.includes(a)) {
      if (i + 1 >= argv.length) throw new Usage(`${a} needs a value`);
      out[a.slice(2)] = argv[++i];
    } else throw new Usage(`unknown argument: ${a}`);
  }
  return out;
}
const normPath = (p) => String(p).replace(/\\/g, '/').replace(/^(\.\/)+/, '');
const cmpKey = (p) => (CI_PATHS ? normPath(p).toLowerCase() : normPath(p));

function mainTree() {
  const r = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  return r.status === 0 ? r.out.trim() : '';
}

function ctx() {
  const home = homedir();
  const main = mainTree();
  const store = storeInfo(main || process.cwd()).store;
  const cfg = loadConfig({ home, store });
  return { home, main, store, cfg };
}

function readSettingsWarnings(home) {
  const warnings = [];
  const file = join(home, '.gemini', 'antigravity-cli', 'settings.json');
  if (!existsSync(file)) return warnings;
  let s;
  try { s = JSON.parse(readFileSync(file, 'utf8')); } catch { return warnings; }
  if (s && s.allowNonWorkspaceAccess === true) warnings.push('allowNonWorkspaceAccess is true in the global Antigravity settings');
  const homeNorm = home.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  for (const t of Array.isArray(s?.trustedWorkspaces) ? s.trustedWorkspaces : []) {
    const n = String(t).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    if (n === homeNorm || n === '' || n === '/' || /^[a-z]:$/.test(n)) {
      warnings.push(`trustedWorkspaces contains "${t}" (home folder or drive root) in the global Antigravity settings`);
    }
  }
  return warnings;
}

function listGeminiModels(bin) {
  const r = runSync(bin, ['models']);
  if (r.status !== 0) return [];
  return r.stdout.split(/\r?\n/).map((l) => l.split('\t')[0].trim()).filter((id) => id.startsWith('gemini-'));
}

function newRun(c, worker, task) {
  const runId = `${stamp(new Date())}-${worker}-${task}`;
  const dir = join(c.store, 'maestro', 'runs', runId);
  mkdirSync(dir, { recursive: true });
  return { runId, dir };
}
function finishRun(run, summary) {
  try { writeFileSync(join(run.dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n'); } catch { /* best effort */ }
  emit(summary);
}

function updateLedger(home, fn) {
  const l = readLedger(home);
  fn(l);
  writeLedger(home, l);
}

// ---------- setup / on / off / status ----------

function cmdSetup() {
  const c = ctx();
  const gitOk = git(process.cwd(), ['--version']).status === 0;
  const cbin = resolveBin('MAESTRO_CODEX_BIN', 'codex');
  const codex = { installed: !cbin.error || cbin.error === 'unsupported shim' };
  if (cbin.error) {
    codex.installed = cbin.error === 'unsupported shim';
    codex.error = cbin.error;
    codex.install = 'npm install -g @openai/codex';
    codex.login = 'none';
  } else {
    const v = runSync(cbin, ['--version']);
    codex.version = (/\d+\.\d+\.\d+\S*/.exec(v.stdout + v.stderr) || [''])[0];
    const l = runSync(cbin, ['login', 'status']);
    const text = l.stdout + l.stderr;
    codex.login = l.status === 0 && /chatgpt/i.test(text) ? 'ChatGPT' : l.status === 0 && /api key/i.test(text) ? 'API key' : 'none';
  }
  const abin = resolveBin('MAESTRO_AGY_BIN', 'agy');
  const gemini = { installed: !abin.error };
  if (abin.error) {
    gemini.error = abin.error;
    gemini.install = 'https://antigravity.google/docs/cli/overview';
    gemini.models = [];
    gemini.warnings = [];
  } else {
    const v = runSync(abin, ['--version']);
    gemini.version = (/\d+\.\d+\.\d+\S*/.exec(v.stdout + v.stderr) || [''])[0];
    gemini.models = listGeminiModels(abin);
    gemini.warnings = readSettingsWarnings(c.home);
  }
  emit({ cmd: 'setup', node: process.version, git: gitOk, codex, gemini, enabled: c.cfg.enabled, store: c.store });
}

function cmdEnable(on) {
  const c = ctx();
  saveProjectConfig(c.store, { enabled: on });
  emit({ cmd: on ? 'on' : 'off', enabled: on, file: join(c.store, 'maestro.json').replace(/\\/g, '/') });
}

function cmdStatus() {
  const c = ctx();
  const runsDir = join(c.store, 'maestro', 'runs');
  const runs = [];
  if (existsSync(runsDir)) {
    const names = readdirSync(runsDir).sort().reverse();
    for (const n of names) {
      if (runs.length >= 5) break;
      try { runs.push(JSON.parse(readFileSync(join(runsDir, n, 'summary.json'), 'utf8'))); } catch { /* no summary */ }
    }
  }
  emit({ cmd: 'status', enabled: c.cfg.enabled, store: c.store, ledger: readLedger(c.home), config: c.cfg, runs });
}

// ---------- codex ----------

function snapshot(main) {
  const sc = git(main, ['stash', 'create']);
  if (sc.status !== 0) return { base: '', id: '' };
  const created = sc.out.trim();
  const base = created || 'HEAD';
  const tree = gitOut(main, ['rev-parse', `${base}^{tree}`]);
  const index = created ? gitOut(main, ['rev-parse', `${created}^2^{tree}`]) : gitOut(main, ['write-tree']);
  const list = git(main, ['ls-files', '-o', '--exclude-standard', '-z']).out.split('\0').filter(Boolean).sort();
  const untracked = list.map((f) => {
    const h = git(main, ['hash-object', '--', f]);
    return `${f}\t${h.status === 0 ? h.out.trim() : 'x'}`;
  });
  return { base: created ? created : gitOut(main, ['rev-parse', 'HEAD']), id: JSON.stringify({ tree, index, untracked }) };
}

function statusPaths(wt) {
  const raw = git(wt, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).out.split('\0');
  const paths = [];
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i];
    if (e.length < 4) continue;
    const xy = e.slice(0, 2);
    paths.push(e.slice(3));
    if (/[RC]/.test(xy)) { i++; if (raw[i]) paths.push(raw[i]); }
  }
  return paths;
}

function rejectedPatchModes(wt, base) {
  const raw = git(wt, ['diff', '--cached', '--raw', '--no-renames', '--no-abbrev', base]).out.split(/\r?\n/);
  for (const line of raw) {
    const m = /^:(\d{6}) (\d{6}) /.exec(line);
    if (!m) continue;
    const [, a, b] = m;
    if (a === '120000' || b === '120000' || a === '160000' || b === '160000') return `symlink or gitlink in patch: ${line.split('\t')[1] || ''}`;
    if (a !== '000000' && b !== '000000' && a !== b) return `mode change in patch: ${line.split('\t')[1] || ''}`;
  }
  return '';
}

async function cmdCodex(argv) {
  const a = parseArgs(argv, ['--task', '--brief', '--files', '--profile', '--effort', '--model'], ['--keep']);
  if (!a.task || !SLUG_RE.test(a.task)) throw new Usage('--task <slug> required (a-z0-9 and dashes, max 41 chars)');
  if (!a.brief) throw new Usage('--brief <file> required');
  if (!a.files) throw new Usage('--files <a,b,...> required');
  const profile = a.profile || 'code';
  if (profile !== 'code' && profile !== 'fix') throw new Usage('--profile must be code or fix');
  const files = a.files.split(',').map((f) => normPath(f.trim())).filter(Boolean);
  if (files.length === 0) throw new Usage('--files is empty');
  if (!existsSync(a.brief)) throw new Usage(`brief file not found: ${a.brief}`);

  const c = ctx();
  const t0 = Date.now();
  const base0 = { cmd: 'codex', runId: '', status: '', files: [], extraFiles: [], selfReport: {}, tokens: { input: 0, output: 0 }, seconds: 0, error: '', log: '' };
  if (!c.cfg.enabled) emit({ ...base0, status: 'DISABLED', error: 'maestro is not enabled for this project' });
  const lb = ledgerBlocked(readLedger(c.home), 'codex', new Date(), 0);
  if (lb.blocked) emit({ ...base0, status: 'QUOTA', error: lb.reason });

  const run = newRun(c, 'codex', a.task);
  const sum = { ...base0, runId: run.runId, log: run.dir.replace(/\\/g, '/') };
  let cleanup = () => {};
  const end = (status, error = '', extra = {}) => {
    cleanup();
    finishRun(run, { ...sum, ...extra, status, error, seconds: Math.round((Date.now() - t0) / 1000) });
  };

  if (!c.main) end('FAIL', 'not a git repository');
  const main = c.main;
  if (git(main, ['rev-parse', '--verify', '-q', 'HEAD']).status !== 0) end('FAIL', 'repository has no commit');

  const snap = snapshot(main);
  if (!snap.base) end('FAIL', 'could not snapshot the working tree');
  const wt = join(c.store, 'maestro', 'wt', run.runId);
  git(main, ['worktree', 'prune']);
  mkdirSync(dirname(wt), { recursive: true });
  const add = git(main, ['worktree', 'add', '--detach', wt, snap.base]);
  if (add.status !== 0) end('FAIL', `git worktree add failed: ${add.err.trim()}`);
  // process.exit in emit skips finally blocks, so removal runs from end().
  cleanup = () => {
    if (a.keep) return;
    const rm = git(main, ['worktree', 'remove', '--force', wt]);
    if (rm.status !== 0) {
      try { rmSync(wt, { recursive: true, force: true }); } catch { /* leave it */ }
      git(main, ['worktree', 'prune']);
    }
  };

  try {
    const bin = resolveBin('MAESTRO_CODEX_BIN', 'codex');
    if (bin.error) end('FAIL', `codex: ${bin.error}`);
    const prof = c.cfg.profiles[profile] || {};
    const effort = a.effort || prof.effort || c.cfg.codex.effort;
    const model = a.model || prof.model || c.cfg.codex.model || '';
    const footer = [
      '', '---', 'Rules for this task:',
      `- You may change only these files: ${files.join(', ')}`,
      '- Do not commit. Do not run git commands that change history or the index.',
      '- Do not touch any other file.',
      '- When finished, reply with the JSON object required by the output schema (status, files_changed, tests, notes).',
      '',
    ].join('\n');
    const prompt = readFileSync(a.brief, 'utf8') + footer;
    writeFileSync(join(run.dir, 'prompt.txt'), prompt);
    const resultFile = join(run.dir, 'result.json');
    const args = [
      'exec', '-C', wt, '-s', 'workspace-write',
      '-c', 'sandbox_workspace_write.exclude_tmpdir_env_var=true',
      '-c', 'sandbox_workspace_write.exclude_slash_tmp=true',
      '-c', 'sandbox_workspace_write.writable_roots=[]',
      '-c', 'sandbox_workspace_write.network_access=false',
      '-c', `model_reasoning_effort="${effort}"`,
      '--ephemeral', '--json', '--output-schema', CODE_SCHEMA, '-o', resultFile,
    ];
    if (model) args.push('-m', model);
    if (c.cfg.codex.ignoreUserConfig) args.push('--ignore-user-config');
    if (process.platform === 'win32' && c.cfg.codex.windowsSandbox) args.push('-c', `windows.sandbox="${c.cfg.codex.windowsSandbox}"`);
    args.push('-');

    const r = await runWorker(bin, args, {
      cwd: wt, input: prompt, timeoutMs: c.cfg.codex.timeoutMin * 60000,
      outFile: join(run.dir, 'events.jsonl'), errFile: join(run.dir, 'stderr.txt'),
    });
    let selfReport = {};
    try { selfReport = JSON.parse(readFileSync(resultFile, 'utf8')); } catch { /* none */ }
    sum.selfReport = selfReport;
    if (r.timedOut) end('TIMEOUT', `codex exceeded ${c.cfg.codex.timeoutMin} min`, { selfReport });

    const events = r.stdout.split(/\r?\n/).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const cls = classifyCodex({ exitCode: r.exitCode, events });
    sum.tokens = cls.tokens;
    if (cls.status === 'QUOTA') {
      const now = new Date();
      updateLedger(c.home, (l) => {
        l.codex.blockedUntil = parseResetTime(cls.error, now).toISOString();
        l.codex.lastError = cls.error;
      });
      end('QUOTA', cls.error, { tokens: cls.tokens, selfReport });
    }
    if (cls.status !== 'ok') end('FAIL', cls.error, { tokens: cls.tokens, selfReport });

    // Check 1: main tree unchanged since the snapshot.
    const after = snapshot(main);
    if (after.id !== snap.id) end('VIOLATION', 'the main working tree changed during the run; nothing applied');

    // Check 2: changed paths are a subset of --files.
    git(wt, ['add', '-A']);
    const changed = [];
    const seen = new Set();
    for (const p of statusPaths(wt)) {
      const np = normPath(p);
      if (seen.has(cmpKey(np))) continue;
      seen.add(cmpKey(np));
      if (git(wt, ['diff', '--cached', '--quiet', snap.base, '--', p]).status === 0) continue;
      changed.push(np);
    }
    sum.files = changed;
    const allowed = new Set(files.map(cmpKey));
    const extra = changed.filter((p) => !allowed.has(cmpKey(p)));
    if (extra.length) end('VIOLATION', 'files changed outside --files', { files: changed, extraFiles: extra });
    if (changed.length === 0) end('FAIL', 'codex changed no files', { files: [] });

    // Patch.
    const diff = git(wt, ['diff', '--cached', '--binary', snap.base], { buffer: true });
    const patchFile = join(run.dir, 'patch.diff');
    writeFileSync(patchFile, diff.out);
    if (diff.status !== 0 || diff.out.length === 0) end('FAIL', 'could not build the patch');
    const bad = rejectedPatchModes(wt, snap.base);
    if (bad) end('VIOLATION', bad);

    const ap = applyPatch({ tree: main, patchFile });
    if (!ap.ok) end('CONFLICT', ap.error);
    end('PASS');
  } finally {
    cleanup();
  }
}

// ---------- gemini ----------

function looksBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

async function cmdGemini(argv) {
  const a = parseArgs(argv, ['--task', '--prompt', '--files', '--diff', '--profile', '--effort', '--model'], []);
  if (!a.task || !SLUG_RE.test(a.task)) throw new Usage('--task <slug> required (a-z0-9 and dashes, max 41 chars)');
  if (!a.prompt) throw new Usage('--prompt <file> required');
  const profile = a.profile || 'review';
  if (profile !== 'review' && profile !== 'read') throw new Usage('--profile must be review or read');
  if (!existsSync(a.prompt)) throw new Usage(`prompt file not found: ${a.prompt}`);
  if (a.diff !== undefined && !/^[^-]/.test(a.diff)) throw new Usage('--diff must not start with "-"');
  const fileArgs = a.files ? a.files.split(',').map((f) => f.trim()).filter(Boolean) : [];

  const c = ctx();
  const t0 = Date.now();
  const base0 = { cmd: 'gemini', runId: '', status: '', model: '', findings: [], skipped: [], tokens: { input: 0, output: 0 }, seconds: 0, error: '', log: '' };
  if (!c.cfg.enabled) emit({ ...base0, status: 'DISABLED', error: 'maestro is not enabled for this project' });
  const gcfg = c.cfg.gemini;
  const lb = ledgerBlocked(readLedger(c.home), 'gemini', new Date(), gcfg.dailyRuns);
  if (lb.blocked) emit({ ...base0, status: 'QUOTA', error: lb.reason });

  const run = newRun(c, 'gemini', a.task);
  const sum = { ...base0, runId: run.runId, log: run.dir.replace(/\\/g, '/') };
  const end = (status, error = '', extra = {}) => {
    finishRun(run, { ...sum, ...extra, status, error, seconds: Math.round((Date.now() - t0) / 1000) });
  };

  if (!c.main) end('FAIL', 'not a git repository');
  const main = c.main;
  let mainReal = main;
  try { mainReal = realpathSync(main); } catch { /* keep */ }

  // Model.
  const prof = c.cfg.profiles[profile] || {};
  const effort = a.effort || prof.effort || gcfg.effort;
  const wanted = a.model || prof.model || gcfg.model || '';
  const bin = resolveBin('MAESTRO_AGY_BIN', 'agy');
  let model = '';
  try {
    if (wanted) model = resolveGeminiModel({ wanted, effort, available: [] });
    else {
      if (bin.error) end('FAIL', `agy: ${bin.error}`);
      model = resolveGeminiModel({ wanted: '', effort, available: listGeminiModels(bin) });
    }
  } catch (e) {
    end('FAIL', e.message);
  }
  sum.model = model;
  if (bin.error) end('FAIL', `agy: ${bin.error}`);

  // Inputs.
  const fileBlocks = [];
  const have = new Set();
  const addFile = (display, abs, text) => {
    if (have.has(display)) return;
    have.add(display);
    fileBlocks.push({ path: display, text });
  };
  for (const f of fileArgs) {
    const abs = resolve(main, f);
    let real;
    try { real = realpathSync(abs); } catch { end('FAIL', `file not found: ${f}`); }
    const rel = relative(mainReal, real);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) end('FAIL', `file is outside the project: ${f}`);
    if (!statSync(real).isFile()) end('FAIL', `not a file: ${f}`);
    const display = rel.replace(/\\/g, '/');
    if (git(main, ['check-ignore', '-q', '--', display]).status === 0) end('FAIL', `file is git-ignored: ${f}`);
    const buf = readFileSync(real);
    if (looksBinary(buf)) end('FAIL', `binary file: ${f}`);
    addFile(display, real, buf.toString('utf8'));
  }
  let diff = '';
  const extraSkipped = [];
  if (a.diff !== undefined) {
    // --name-status (not --name-only) so a rename lists both the old and the new name.
    const names = git(main, ['diff', '--name-status', '-z', '-M', a.diff, '--']);
    if (names.status !== 0) end('FAIL', `git diff failed: ${names.err.trim()}`);
    const tok = names.out.split('\0');
    const excl = new Set();
    for (let i = 0; i < tok.length; i++) {
      const st = tok[i];
      if (!st) continue;
      const group = /^[RC]/.test(st) ? [tok[i + 1], tok[i + 2]] : [tok[i + 1]];
      i += group.length;
      // A rename or copy from or to a secret name drops both sides (the content moved).
      if (group.some((p) => p && isSecretPath(p))) for (const p of group) if (p) excl.add(p);
    }
    const excludes = [...excl].map((p) => `:(exclude,literal)${p}`);
    for (const p of excl) extraSkipped.push(p);
    const d = git(main, [
      'diff', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', a.diff, '--', '.', ...excludes,
    ]);
    if (d.status !== 0) end('FAIL', `git diff failed: ${d.err.trim()}`);
    diff = d.out;
    for (const f of git(main, ['ls-files', '-o', '--exclude-standard', '-z']).out.split('\0').filter(Boolean)) {
      const abs = join(main, f);
      try {
        if (lstatSync(abs).isSymbolicLink() || !statSync(abs).isFile()) continue;
        const buf = readFileSync(abs);
        if (looksBinary(buf)) { extraSkipped.push(f); continue; }
        addFile(f, abs, buf.toString('utf8'));
      } catch { /* unreadable: skip */ }
    }
  }

  let built;
  try {
    built = buildReviewPrompt({ instructions: readFileSync(a.prompt, 'utf8'), files: fileBlocks, diff, maxKB: gcfg.maxPromptKB });
  } catch (e) {
    end('FAIL', e.message);
  }
  sum.skipped = [...built.skipped, ...extraSkipped];
  writeFileSync(join(run.dir, 'prompt.txt'), built.prompt);

  const settingsFile = join(run.dir, 'settings.json');
  writeFileSync(settingsFile, JSON.stringify(denyAllSettings(), null, 2) + '\n');
  const empty = join(c.store, 'maestro', 'empty', run.runId);
  // `empty` is removed and recreated fresh below, then removed again after the empty check.
  rmSync(empty, { recursive: true, force: true });
  mkdirSync(empty, { recursive: true });

  const args = [
    '--print=', '--input-format', 'stream-json', '--output-format', 'stream-json', '--mode', 'plan',
    '--settings', settingsFile, '--json-schema', REVIEW_SCHEMA,
    '--print-timeout', `${gcfg.timeoutMin * 60}s`, '--model', model,
  ];
  const input = JSON.stringify({ event: 'user', message: { role: 'user', content: built.prompt } }) + '\n';

  // The call reaches the CLI: count it now.
  updateLedger(c.home, (l) => {
    const b = ledgerBlocked(l, 'gemini', new Date(), gcfg.dailyRuns).ledger;
    b.gemini.runs += 1;
    l.gemini = b.gemini;
  });

  const r = await runWorker(bin, args, {
    cwd: empty, input, timeoutMs: (gcfg.timeoutMin * 60 + 30) * 1000,
    outFile: join(run.dir, 'out.jsonl'), errFile: join(run.dir, 'stderr.txt'),
  });
  if (r.timedOut) { try { rmSync(empty, { recursive: true, force: true }); } catch {} end('TIMEOUT', `agy exceeded ${gcfg.timeoutMin} min`); }

  let result = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    try {
      const o = JSON.parse(line);
      if (o && o.event === 'result') result = o.result ?? null;
    } catch { /* not json */ }
  }
  if (result) { try { writeFileSync(join(run.dir, 'result.json'), JSON.stringify(result, null, 2) + '\n'); } catch { /* ignore */ } }
  const cls = classifyGemini({ exitCode: r.exitCode, result, stderr: r.stderr });
  const part = { findings: cls.findings, tokens: cls.tokens };
  let leftover = 0;
  try { leftover = readdirSync(empty).length; } catch { /* gone */ }
  try { rmSync(empty, { recursive: true, force: true }); } catch { /* EBUSY on win32: leftover is reported below */ }
  if (cls.status === 'QUOTA') {
    const until = nextMidnight(new Date()).toISOString();
    updateLedger(c.home, (l) => { l.gemini.blockedUntil = until; l.gemini.lastError = cls.error; });
    end('QUOTA', cls.error, part);
  }
  if (cls.status === 'FAIL') end('FAIL', cls.error, part);
  if (cls.status === 'DENIED') end('DENIED', 'no structured output (tool use was denied)', part);
  if (leftover > 0) end('VIOLATION', 'the empty working folder is not empty after the run', part);
  end('PASS', '', part);
}

// ---------- main ----------

async function main() {
  const [sub, ...rest] = process.argv.slice(2);
  try {
    switch (sub) {
      case 'setup': return cmdSetup();
      case 'on': return cmdEnable(true);
      case 'off': return cmdEnable(false);
      case 'status': return cmdStatus();
      case 'codex': return await cmdCodex(rest);
      case 'gemini': return await cmdGemini(rest);
      default: throw new Usage('usage: maestro-run.mjs setup|on|off|status|codex|gemini ...');
    }
  } catch (e) {
    if (e instanceof Usage) emit({ cmd: sub || '', status: 'USAGE', error: e.message }, 1);
    emit({ cmd: sub || '', status: 'FAIL', error: String(e?.message || e) }, 0);
  }
}

main();
