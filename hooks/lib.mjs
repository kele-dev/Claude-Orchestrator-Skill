// Shared helpers for the orchestrator hooks (stdin read, debug output, env ints, bounded file reads, transcript entry filter).
import { execFileSync } from 'node:child_process';
import { existsSync, readSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';

// One-line error text; full stack when ORCH_DEBUG=2, quoted strings redacted otherwise.
export const fmt = (e) => process.env.ORCH_DEBUG === '2' ? String(e?.stack ?? e) : `${e?.name ?? 'Error'}: ${String(e?.message ?? e).replace(/"[^"]*"/g, '"…"').slice(0, 200)}`;

// Debug printer for one hook: writes to stderr only when ORCH_DEBUG is 1 or 2.
export const makeDbg = (name) => (e) => { if (process.env.ORCH_DEBUG === '1' || process.env.ORCH_DEBUG === '2') process.stderr.write(`orchestrator ${name}: ${fmt(e)}\n`); };

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
// Backward compatible: when the remote-key dir does not exist but the old path-slug dir does, the old dir is kept.
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
  const useRemote = remote !== '' && (existsSync(base + remote) || !existsSync(base + pathKey));
  return { main, store: base + (useRemote ? remote : pathKey) };
}

export const storeFor = (cwd) => storeInfo(cwd).store;
