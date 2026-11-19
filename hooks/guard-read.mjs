#!/usr/bin/env node
// PreToolUse hook for Read: denies ONCE per file per session a main-session whole-file Read (no offset/limit) of a large file
// (over 2000 lines or 100 KB); page-ranged reads and pdf/image/notebook files are allowed. A repeated identical Read is allowed (marker file in the temp dir). Subagents are untouched.
// Kill switch: ORCH_READ_GUARD=off. Fails open on malformed input, missing session id or any error (prints nothing, exits 0).
import { createHash } from 'node:crypto';
import { closeSync, openSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDbg, readBytes, readStdin } from './lib.mjs';

const dbg = makeDbg('guard-read');
const MAX_BYTES = 100 * 1024;
const MAX_LINES = 2000;

readStdin((raw) => {
  try {
    if (process.env.ORCH_READ_GUARD === 'off') return;
    const input = JSON.parse(raw);
    if (typeof input?.agent_id === 'string' && input.agent_id !== '') return;
    const ti = input?.tool_input;
    const file = ti?.file_path;
    if (typeof file !== 'string' || file === '') return;
    if (ti.offset !== undefined && ti.offset !== null) return;
    if (ti.limit !== undefined && ti.limit !== null) return;
    if (ti.pages !== undefined && ti.pages !== null && ti.pages !== '') return;
    if (/\.(pdf|png|jpe?g|gif|webp|bmp|svg|ipynb)$/i.test(file)) return;
    const sid = String(input.session_id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
    if (sid === '') return;

    const st = statSync(file);
    if (!st.isFile()) return;
    const big = st.size > MAX_BYTES || (st.size > 20000 && countLines(file, st.size) > MAX_LINES);
    if (!big) return;

    const marker = join(tmpdir(), `orchestrator-read-${sid}-${createHash('sha1').update(file).digest('hex').slice(0, 16)}`);
    if (existsSync(marker)) return;
    writeFileSync(marker, '1');
    const kb = Math.round(st.size / 1024);
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `orchestrator: ${file} is large (${kb} KB); a whole-file Read costs many tokens. Read only what you need with offset/limit, find it with Grep, or ask the Explore agent. If you really need the whole file, repeat the same Read and it will be allowed. Set ORCH_READ_GUARD=off to disable this guard.`,
      },
    }));
  } catch (e) {
    // fail open
    dbg(e);
  }
});

// Newline count of a file at most MAX_BYTES long (callers pass size <= MAX_BYTES).
function countLines(file, size) {
  const fd = openSync(file, 'r');
  try {
    const buf = readBytes(fd, 0, Math.min(size, MAX_BYTES));
    let n = 0;
    for (const b of buf) if (b === 10) n++;
    return n;
  } finally {
    closeSync(fd);
  }
}
