// Shared helpers for the orchestrator hooks (stdin read, debug output, env ints, bounded file reads, transcript entry filter).
import { execFileSync } from 'node:child_process';
import { readSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';

// One-line error text; full stack when ORCH_DEBUG=2, quoted strings redacted otherwise.
export const fmt = (e) => process.env.ORCH_DEBUG === '2' ? String(e?.stack ?? e) : `${e?.name ?? 'Error'}: ${String(e?.message ?? e).replace(/"[^"]*"/g, '"…"').slice(0, 200)}`;

// Debug printer for one hook: writes to stderr only when ORCH_DEBUG is 1 or 2.
export const makeDbg = (name) => (e) => { if (process.env.ORCH_DEBUG === '1' || process.env.ORCH_DEBUG === '2') process.stderr.write(`orchestrator ${name}: ${fmt(e)}\n`); };

// Positive integer from an env-style string, else the default.
export const posInt = (v, d) => (/^[1-9]\d*$/.test(v ?? '') ? Number(v) : d);

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

// Per-project store dir (same rule as hooks/session-info.mjs): git common dir of cwd (else cwd), slugified, last 80 chars.
export function storeFor(cwd) {
  let main = cwd;
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8',
    }).trim();
    if (common) main = dirname(common);
  } catch {
    main = cwd;
  }
  const key = main.replace(/\\/g, '/').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(-80);
  return homedir().replace(/\\/g, '/') +'/.claude/orchestrator/' + key;
}
