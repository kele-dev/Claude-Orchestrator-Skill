#!/usr/bin/env node
// SubagentStop hook: appends one line per orchestrator delegation ({ts, tier, status, agent_id}) to <store>/delegations.jsonl, capped at 1000 lines once over 256 KB.
// Stats mode: `node ledger.mjs --stats <store>` prints one LEDGER line with the pass rate per tier.
// Store computation: lib.cachedStoreFor (per-session cache of lib.storeFor, primed by session-info and trim-output). Fails open: any error prints nothing and exits 0; never blocks.
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cachedStoreFor, makeDbg, readStdin, writeAtomic } from './lib.mjs';

const dbg = makeDbg('ledger');

const TIERS = ['haiku-coder', 'sonnet-dev', 'opus-planner', 'opus-reviewer'];
const CAP_BYTES = 256 * 1024;
const CAP_LINES = 1000;
const NONE = 'LEDGER: no delegations';


const TAIL_BYTES = 1048576;

// Text of the last assistant entry in a JSONL transcript (reads at most the last TAIL_BYTES); '' when none.
function lastAssistantText(path) {
  if (typeof path !== 'string' || path === '') return '';
  let fd = null;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    let got = 0;
    while (got < buf.length) {
      const n = readSync(fd, buf, got, buf.length - got, start + got);
      if (n === 0) break;
      got += n;
    }
    const lines = buf.subarray(0, got).toString('utf8').split('\n');
    if (start > 0) lines.shift(); // partial first line
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"assistant"')) continue;
      let entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (entry?.type !== 'assistant') continue;
      const content = entry.message?.content;
      if (typeof content === 'string') return content;
      if (!Array.isArray(content)) return '';
      return content.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n');
    }
  } catch (e) {
    dbg(e);
  } finally {
    if (fd !== null) closeSync(fd);
  }
  return '';
}

const LOCK_WAIT_MS = 500;
const LOCK_STALE_MS = 5000;

// Takes <store>/delegations.lock (flag 'wx'); retries for ~500 ms, removes a lock older than 5 s. Returns true when held.
function takeLock(lock) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      writeFileSync(lock, String(process.pid), { flag: 'wx' });
      return true;
    } catch (e) {
      if (e?.code !== 'EEXIST') {
        dbg(e);
        return false;
      }
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
          unlinkSync(lock);
          continue;
        }
      } catch { /* lock vanished: retry */ }
      if (Date.now() >= deadline) return false;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
}

// Keeps only the last CAP_LINES lines when the file is over CAP_BYTES.
function capFile(file) {
  try {
    if (!existsSync(file) || statSync(file).size <= CAP_BYTES) return;
    const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l !== '');
    writeAtomic(file, lines.slice(-CAP_LINES).map((l) => l + '\n').join(''));
  } catch (e) {
    dbg(e);
  }
}

function record(input) {
  const tier = String(input?.agent_type ?? '').replace(/^orchestrator:/, '');
  if (!TIERS.includes(tier)) return;
  const cwd = typeof input?.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd();
  const text = typeof input?.last_assistant_message === 'string' ? input.last_assistant_message : lastAssistantText(input?.agent_transcript_path);
  const ms = [...String(text).matchAll(/^[ \t>*_-]*STATUS[ \t*_]*:[ \t*_]*([A-Za-z_]+)/gim)];
  const status = ms.length ? ms[ms.length - 1][1].toUpperCase() : '?';

  const store = cachedStoreFor(cwd, input?.session_id);
  mkdirSync(store, { recursive: true });
  const file = join(store, 'delegations.jsonl');
  const line = JSON.stringify({ ts: new Date().toISOString(), tier, status, agent_id: String(input?.agent_id ?? '') }) + '\n';
  // Cap and append under a lock so parallel SubagentStop hooks cannot lose lines; without the lock, append only (never drop the record).
  const lock = join(store, 'delegations.lock');
  const held = takeLock(lock);
  try {
    if (held) capFile(file);
    appendFileSync(file, line);
  } finally {
    if (held) {
      try { unlinkSync(lock); } catch (e) { dbg(e); }
    }
  }
}

// Pass rate per tier from <store>/delegations.jsonl; bad lines and unknown tiers are skipped. "?" (no STATUS found) is unknown, not a failure.
function stats(dir) {
  if (typeof dir !== 'string' || dir === '') return NONE;
  const counts = new Map();
  try {
    for (const line of readFileSync(join(dir, 'delegations.jsonl'), 'utf8').split('\n')) {
      if (line.trim() === '') continue;
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        continue;
      }
      if (!TIERS.includes(r?.tier)) continue;
      const c = counts.get(r.tier) ?? { pass: 0, decided: 0, unknown: 0 };
      if (r.status === '?') {
        c.unknown++;
      } else {
        c.decided++;
        if (r.status === 'SUCCESS' || r.status === 'PASS') c.pass++;
      }
      counts.set(r.tier, c);
    }
  } catch (e) {
    dbg(e);
  }
  const parts = TIERS.filter((t) => counts.has(t)).map((t) => {
    const c = counts.get(t);
    return `${t} ${c.pass}/${c.decided} pass${c.unknown > 0 ? `, ${c.unknown} unknown` : ''}`;
  });
  return parts.length ? `LEDGER: ${parts.join(', ')}` : NONE;
}

if (process.argv[2] === '--stats') {
  try {
    process.stdout.write(stats(process.argv[3]) + '\n');
  } catch (e) {
    dbg(e);
    process.stdout.write(NONE + '\n');
  }
} else {
  readStdin((raw) => {
    try {
      record(JSON.parse(raw));
    } catch (e) {
      // fail open
      dbg(e);
    }
  });
}
