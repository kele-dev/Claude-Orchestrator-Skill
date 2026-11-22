#!/usr/bin/env node
// PostToolUse hook for Bash/PowerShell: trims long command output, keeping error lines and the tail.
// Fails open: on any error or unexpected input it prints nothing and exits 0.
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { cachedStoreFor, makeDbg, posInt, readStdin, sanitizeSid, writeAtomic } from './lib.mjs';

const dbg = makeDbg('trim-output');
const NO_STATS = 'TRIM: none';

// Stats mode: `node trim-output.mjs --stats <store> [<session-id>]` prints one TRIM line for that session's file;
// without a session id it uses the newest trim-stats-*.jsonl and says so ("newest session").
// "TRIM: none" = nothing recorded (including a store not created yet); "TRIM: unavailable (<reason>)" = the stats exist but cannot be read (exit 0 either way).
if (process.argv[2] === '--stats') {
  try { process.stdout.write(statsLine(process.argv[3], process.argv[4]) + '\n'); } catch (e) { dbg(e); process.stdout.write(`TRIM: unavailable (error: ${e?.code || e?.name})\n`); }
} else readStdin((raw) => {
  try {
    if (raw.length < 3000) return;
    const input = JSON.parse(raw);
    const command = input?.tool_input?.command;
    const response = input?.tool_response;
    if (process.env.ORCH_NO_TRIM === '1') return;
    if (typeof command === 'string' && command.includes('# notrim')) return;
    if (typeof response?.stdout !== 'string') return;

    const strip = (s) => (typeof s === 'string' ? s.replace(/\r?\n$/, '') : '');
    const text = [strip(response.stdout), strip(response.stderr)].filter((s) => s !== '').join('\n');
    if (text === '') return;
    const noLines = (typeof command === 'string' && /(^|[|;&(]\s*)(git\s+(diff|show|log\b[^|]*-p)|cat|jq|Get-Content|type)\b/.test(command))
      || /^(\{|\[\s*($|[{"\]]))/.test((text.split('\n').find((l) => l.trim() !== '') ?? '').trimStart());
    const readCmd = typeof command === 'string' && /(^|[;&]\s*)(ls|find|git\s+ls-files|grep|rg|head|tail|sed\s+-n|wc|Get-ChildItem|Select-String)\b/.test(command.trimStart());
    const code = response.exit_code ?? response.exitCode;
    const stdout = trim(text, noLines, readCmd, Number.isInteger(code) && code !== 0);
    if (stdout === null) return;
    record(input, text, stdout);

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: { ...response, stdout, stderr: '' },
      },
    }));
  } catch (e) {
    // fail open
    dbg(e);
  }
});

// Returns the trimmed text, or null when no rule applied.
function trim(text, noLines, readCmd, exitFailed) {
  const out = noLines ? null : trimLines(text, readCmd ? 300 : 80, exitFailed);
  const result = out ?? text;
  if (result.length > 30000) {
    const cut = result.length - 26000;
    return `${result.slice(0, 6000)}\n[orchestrator: cut ${cut} chars; add "# notrim" to the command for full output]\n${result.slice(-20000)}`;
  }
  return out;
}

const ERROR_LINE = /error|fail|exception|panic|traceback|assert|not ok|✗|✖|×|^E\s|warning:/i;
const HEAD_FAILED = 10;

// When the command failed (non-zero exit code, or an error line anywhere), keep the first HEAD_FAILED lines instead of 3:
// failure lines without a keyword (e.g. "fatal: ...") usually come first.
function trimLines(text, maxLines, exitFailed = false) {
  const lines = text.split('\n');
  if (lines.length <= maxLines || text.length <= 4000) return null;

  const tailN = posInt(process.env.ORCH_TRIM_TAIL, 30);
  const errN = posInt(process.env.ORCH_TRIM_ERRORS, 10);
  const failed = exitFailed || lines.some((l) => ERROR_LINE.test(l));
  const headN = failed ? HEAD_FAILED : 3;
  const head = lines.slice(0, headN);
  const matched = lines
    .slice(headN, Math.max(headN, lines.length - tailN))
    .filter((l) => ERROR_LINE.test(l))
    .slice(0, errN);
  const tail = lines.slice(Math.max(headN, lines.length - tailN));
  const dropped = lines.length - head.length - matched.length - tail.length;

  const body = matched.length ? [...matched, '...'] : ['...'];
  return [
    `[orchestrator: trimmed ${dropped} of ${lines.length} lines; add "# notrim" to the command for full output]`,
    ...head,
    ...body,
    ...tail,
  ].join('\n');
}

// Appends one tiny {ts, before, after, saved} record to <store>/trim-stats-<session>.jsonl; never throws.
function record(input, before, after) {
  try {
    const sid = sanitizeSid(input?.session_id);
    const cwd = typeof input?.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd();
    if (sid === '') return;
    const store = cachedStoreFor(cwd, input?.session_id);
    const file = join(store, `trim-stats-${sid}.jsonl`);
    if (!existsSync(store)) mkdirSync(store, { recursive: true });
    if (existsSync(file) && statSync(file).size > 65536 && !compact(file)) return;
    if (!existsSync(file)) prune(store, file);
    const saved = Buffer.byteLength(before) - Buffer.byteLength(after);
    appendFileSync(file, JSON.stringify({ ts: Date.now(), before: before.split('\n').length, after: after.split('\n').length, saved }) + '\n');
  } catch (e) {
    dbg(e);
  }
}

// IC-159: folds an over-64 KB session file into one {ts, n, saved, summary} line; returns false on error (never throws).
function compact(file) {
  try {
    let n = 0, saved = 0;
    for (const l of readFileSync(file, 'utf8').split('\n')) {
      try { const r = JSON.parse(l); n += Number(r.n) || 1; saved += Number(r.saved) || 0; } catch { /* skip */ }
    }
    return writeAtomic(file, JSON.stringify({ ts: Date.now(), n, saved, summary: true }) + '\n');
  } catch (e) {
    dbg(e);
    return false;
  }
}

const STATS_MAX_AGE_MS = 14 * 24 * 3600 * 1000;

// Removes trim-stats files older than STATS_MAX_AGE_MS (regular files only, never the current one); never throws.
function prune(store, current) {
  for (const f of readdirSync(store)) {
    if (!/^trim-stats-.*\.jsonl$/.test(f)) continue;
    const p = join(store, f);
    if (p === current) continue;
    try {
      const st = lstatSync(p);
      if (st.isFile() && Date.now() - st.mtimeMs > STATS_MAX_AGE_MS) unlinkSync(p);
    } catch (e) {
      dbg(e);
    }
  }
}

function statsLine(store, sessionArg) {
  if (typeof store !== 'string' || store === '') return 'TRIM: unavailable (no store given)';
  let file, suffix = '';
  if (typeof sessionArg === 'string' && sessionArg !== '') {
    // IC-135: same sanitizing as record(); only this session's file is read
    const sid = sanitizeSid(sessionArg);
    file = join(store, `trim-stats-${sid}.jsonl`);
    if (!existsSync(file)) return NO_STATS;
  } else {
    if (!existsSync(store)) return NO_STATS;
    const files = readdirSync(store).filter((f) => /^trim-stats-.*\.jsonl$/.test(f))
      .map((f) => ({ f, t: statSync(join(store, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    if (!files.length) return NO_STATS;
    file = join(store, files[0].f);
    suffix = ' (newest session)';
  }
  let n = 0, saved = 0;
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    try { const r = JSON.parse(l); n += Number(r.n) || 1; saved += Number(r.saved) || 0; } catch { /* skip */ }
  }
  return n ? `TRIM: ${n} trims, ${saved} bytes saved${suffix}` : NO_STATS;
}
