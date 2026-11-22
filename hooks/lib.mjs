// Shared helpers for the orchestrator hooks (stdin read, debug output, env ints, bounded file reads, transcript entry filter).
import { execFileSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, fstatSync, lstatSync, openSync, mkdirSync, readFileSync, readSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';

// One-line error text; full stack when ORCH_DEBUG=2, quoted strings redacted otherwise.
export const fmt = (e) => process.env.ORCH_DEBUG === '2' ? String(e?.stack ?? e) : `${e?.name ?? 'Error'}: ${String(e?.message ?? e).replace(/"[^"]*"/g, '"…"').slice(0, 200)}`;

// Debug printer for one hook: only when ORCH_DEBUG is 1 or 2. Writes the redacted line to stderr (not shown in chat on exit 0)
// and appends it to <tmpdir>/orchestrator-debug.log, which stops growing at 256 KB.
export const DEBUG_LOG_MAX = 256 * 1024;
export const makeDbg = (name) => (e) => {
  if (process.env.ORCH_DEBUG !== '1' && process.env.ORCH_DEBUG !== '2') return;
  const line = `orchestrator ${name}: ${fmt(e)}\n`;
  process.stderr.write(line);
  try {
    const file = join(tmpdir(), 'orchestrator-debug.log');
    const size = existsSync(file) ? statSync(file).size : 0;
    if (size + line.length <= DEBUG_LOG_MAX) appendFileSync(file, line);
  } catch { /* debug logging must never fail a hook */ }
};

const stateDbg = makeDbg('state-dir');

// State dir for markers: ORCH_STATE_DIR when set, else a per-user dir under tmpdir. Returns null (fail open) when the dir cannot be used.
// The ownership/symlink safety check applies to the default per-user dir only; an explicit ORCH_STATE_DIR is trusted as the user's choice.
export function stateDir() {
  const explicit = process.env.ORCH_STATE_DIR;
  const tag = String(process.getuid?.() ?? userInfo().username).replace(/[^A-Za-z0-9_-]/g, '');
  const dir = explicit || join(tmpdir(), `orchestrator-${tag}`);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (!explicit && process.platform !== 'win32') {
      const st = lstatSync(dir);
      if (!st.isDirectory() || st.isSymbolicLink() || (process.getuid && st.uid !== process.getuid())) {
        stateDbg(new Error('unsafe state dir ' + dir));
        return null;
      }
    }
  } catch (e) {
    stateDbg(e);
    return null;
  }
  return dir;
}

// Positive integer from an env-style string, else the default.
export const posInt = (v, d) => (/^[1-9]\d*$/.test(v ?? '') ? Number(v) : d);

// Atomic write: temp file (flag 'wx', so an existing file or symlink is never followed) then rename over the target; fails silently.
export function writeAtomic(path, data) {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, data, { flag: 'wx' });
    renameSync(tmp, path);
  } catch {
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

const dbg = makeDbg('guard-edit'); // same debug tag as before the move to lib

// True only when the most recent real orchestrator command/Skill call in the transcript is off.
export function orchestrationOff(transcriptPath) {
  const WINDOW = 512 * 1024;
  let text;
  let size = 0;
  let len = 0;
  let skip = 0;
  let partial = false;
  try {
    const fd = openSync(transcriptPath, 'r');
    try {
      size = fstatSync(fd).size;
      len = Math.min(size, WINDOW);
      text = readBytes(fd, size - len, len).toString('utf8');
      partial = size > len;
    } finally {
      closeSync(fd);
    }
  } catch (e) {
    dbg(e);
    return false;
  }
  if (partial) {
    const nl = text.indexOf('\n');
    skip = nl === -1 ? len : nl + 1;
    text = nl === -1 ? '' : text.slice(nl + 1);
  }
  let mode = lastMode(text);
  if (mode === null && partial && skip > 0) mode = scanOlder(transcriptPath, size - len + skip);
  return mode === 'off';
}

// Scan [0, end) backwards in fixed chunks (bounded memory and time) for the latest mode marker.
function scanOlder(transcriptPath, end) {
  const CHUNK = 1024 * 1024;
  const MAX_CARRY = 32 * 1024 * 1024;
  const deadline = Date.now() + 2000;
  let fd;
  try {
    fd = openSync(transcriptPath, 'r');
    let pos = end;
    let carry = Buffer.alloc(0);
    while (pos > 0 && Date.now() < deadline) {
      const start = Math.max(0, pos - CHUNK);
      const data = Buffer.concat([readBytes(fd, start, pos - start), carry]);
      let body = data;
      if (start > 0) {
        const i = data.indexOf(10);
        if (i === -1) {
          carry = data.length > MAX_CARRY ? Buffer.alloc(0) : data;
          pos = start;
          continue;
        }
        carry = data.subarray(0, i);
        body = data.subarray(i + 1);
      } else {
        carry = Buffer.alloc(0);
      }
      const mode = lastMode(body.toString('utf8'));
      if (mode) return mode;
      pos = start;
    }
  } catch (e) {
    dbg(e);
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }
  return null;
}

function lastMode(text) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!(l.includes('<command-name>/orchestrator:') || (l.includes('"Skill"') && l.includes('orchestrator:')))) continue;
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const mode = modeOf(entry);
    if (mode) return mode;
  }
  return null;
}

function modeOf(entry) {
  const content = entry?.message?.content;
  if (entry?.type === 'user') {
    let s = null;
    if (typeof content === 'string') s = content;
    else if (Array.isArray(content)) {
      const first = content.find((p) => p?.type === 'text');
      if (typeof first?.text === 'string') s = first.text;
    }
    if (s === null) return null;
    s = s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
    if (!s.trimStart().startsWith('<command-message>')) return null;
    const m = /<command-name>\/orchestrator:(on|off|team|autopilot)<\/command-name>/.exec(s);
    return m ? m[1] : null;
  }
  if (entry?.type === 'assistant' && Array.isArray(content)) {
    for (const p of content) {
      if (p?.type === 'tool_use' && p.name === 'Skill' && typeof p.input?.skill === 'string') {
        const m = /^orchestrator:(on|off|team|autopilot)$/.exec(p.input.skill);
        if (m) return m[1];
      }
    }
  }
  return null;
}

// Reads all of stdin as utf8 and passes it to cb.
export function readStdin(cb) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', () => cb(raw));
}

// Reads up to len bytes at start; returns a Buffer with the bytes actually read.
export function readBytes(fd, start, len) {
  const buf = Buffer.alloc(len);
  let got = 0;
  while (got < len) {
    const n = readSync(fd, buf, got, len - got, start + got);
    if (n <= 0) break;
    got += n;
  }
  return buf.subarray(0, got);
}

// True for a main-session (non-sidechain) assistant transcript entry.
export const isMainAssistant = (entry) => entry?.type === 'assistant' && !entry.isSidechain;

// Normalizes a git remote URL for the store key: no scheme, no credentials, lowercase, no trailing slash or .git.
// "https://user:pw@GitHub.com/Foo/Bar.git" and "git@github.com:foo/bar.git" both give "github.com/foo/bar" (or ":" form), then slugified.
export function remoteKey(url) {
  const u = String(url ?? '').split('\n')[0].trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^[^/]*@/, '')
    .replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '');
  return u.replace(/[^a-z0-9]+/g, '-').slice(-80);
}

// Per-project store: key from the git remote origin URL (so clones and worktrees of one repo share a store), else the path slug.
// Backward compatible: an existing path-slug dir always wins; the remote key is used only when that dir does not exist.
// Mirrors skills/learn/reference.md "## Store command". Returns { main, store }; main = main checkout path with forward slashes.
export function storeInfo(cwd) {
  const git = (args) => execFileSync('git', args, { cwd, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
  let main = cwd;
  try {
    const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
    if (common) main = dirname(common);
  } catch {
    main = cwd;
  }
  main = main.replace(/\\/g, '/');
  let remote = '';
  try {
    remote = remoteKey(git(['config', '--get', 'remote.origin.url']));
  } catch {
    remote = '';
  }
  const base = homedir().replace(/\\/g, '/') + '/.claude/orchestrator/';
  const pathKey = main.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(-80);
  const useRemote = remote !== '' && !existsSync(base + pathKey);
  return { main, store: base + (useRemote ? remote : pathKey) };
}

export const storeFor = (cwd) => storeInfo(cwd).store;

// Per-session cache file for the store path (in the state dir); null when there is no session id or no usable state dir.
export function storeCacheFile(sessionId) {
  const sid = String(sessionId ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  const dir = sid === '' ? null : stateDir();
  return dir === null ? null : join(dir, `orchestrator-store-${sid}.json`);
}

// Store path from the per-session cache when it was written for the same cwd; else computes storeFor and writes the cache.
export function cachedStoreFor(cwd, sessionId) {
  const f = storeCacheFile(sessionId);
  if (f === null) return storeFor(cwd);
  try {
    const c = JSON.parse(readFileSync(f, 'utf8'));
    if (c?.cwd === cwd && typeof c.store === 'string' && c.store !== '') return c.store;
  } catch {
    // no usable cache: compute below
  }
  const store = storeFor(cwd);
  writeAtomic(f, JSON.stringify({ cwd, store }));
  return store;
}
