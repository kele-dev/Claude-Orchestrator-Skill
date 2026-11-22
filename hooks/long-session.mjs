#!/usr/bin/env node
// UserPromptSubmit hook: warns when the context has grown (assistant message.usage tokens), then again at higher thresholds (ORCH_LONG_REPEAT),
// or, without usage data, when the transcript is large; also warns on delegation count.
// Delegation count is incremental: the byte offset and count are cached in a .count file, and only new bytes are read.
// Marker, .count and .growth (usage scan state) files live in ORCH_STATE_DIR, or else in a private per-user dir under tmpdir (mode 0700, not a symlink, owned by the current user).
// Fails open: on any error or unexpected input it prints nothing and exits 0.
import { closeSync, existsSync, openSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isMainAssistant, makeDbg, posInt, readBytes, readStdin, sanitizeSid, stateDir, writeAtomic } from './lib.mjs';

const dbg = makeDbg('long-session');

readStdin((raw) => {
  try {
    const out = run(JSON.parse(raw));
    if (out) process.stdout.write(out + '\n');
  } catch (e) {
    // fail open
    dbg(e);
  }
});

// Context tokens of one transcript line (main-session assistant usage), or null.
function usageTokens(line) {
  if (!line.includes('"usage"')) return null;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  const u = entry?.message?.usage;
  if (!isMainAssistant(entry) || !u || typeof u !== 'object') return null;
  return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
}

const CHECK_BYTES = 64;
const checkOf = (fd, offset) => readBytes(fd, offset - Math.min(offset, CHECK_BYTES), Math.min(offset, CHECK_BYTES)).toString('base64');

// Cached scan state { offset, first, last, check } from a previous prompt; null unless the file still has the same bytes before the offset (a shrunk or rewritten file invalidates it).
function loadGrowthCache(fd, cachePath, size) {
  try {
    const c = JSON.parse(readFileSync(cachePath, 'utf8'));
    const ok = Number.isInteger(c?.offset) && c.offset > 0 && c.offset <= size && Number.isInteger(c.first) && Number.isInteger(c.last) && typeof c.check === 'string';
    return ok && checkOf(fd, c.offset) === c.check ? c : null;
  } catch (e) {
    dbg(e);
    return null;
  }
}

// Context growth from assistant message.usage: { first, last } tokens, or null when no usage entries are found.
// Incremental: the scanned byte offset, the first usage and the latest usage are cached, so a later prompt reads only the bytes appended since.
// Without a valid cache (first prompt, shrunk or rewritten file) it reads a bounded head window and tail window (1 MB each).
function contextGrowth(path, size, cachePath) {
  const WINDOW = 1024 * 1024;
  const save = (fd, offset, first, last) => {
    try {
      writeAtomic(cachePath, JSON.stringify({ offset, first, last, check: checkOf(fd, offset) }));
    } catch (e) {
      dbg(e);
      // ignore cache write errors
    }
  };
  try {
    const fd = openSync(path, 'r');
    try {
      const c = loadGrowthCache(fd, cachePath, size);
      if (c) {
        const buf = readBytes(fd, c.offset, size - c.offset);
        const lastNL = buf.lastIndexOf(0x0a);
        if (lastNL === -1) return { first: c.first, last: c.last };
        let last = c.last;
        for (const line of buf.toString('utf8', 0, lastNL).split('\n')) {
          const t = usageTokens(line);
          if (t !== null) last = t;
        }
        save(fd, c.offset + lastNL + 1, c.first, last);
        return { first: c.first, last };
      }
      const len = Math.min(size, WINDOW);
      let head = readBytes(fd, 0, len).toString('utf8');
      if (size > len) {
        const nl = head.lastIndexOf('\n');
        head = nl === -1 ? '' : head.slice(0, nl);
      }
      let tail = readBytes(fd, size - len, len).toString('utf8');
      if (size > len) {
        const nl = tail.indexOf('\n');
        tail = nl === -1 ? '' : tail.slice(nl + 1);
      }
      let first = null;
      for (const line of head.split('\n')) {
        const t = usageTokens(line);
        if (t !== null) {
          first = t;
          break;
        }
      }
      let last = null;
      for (const line of tail.split('\n')) {
        const t = usageTokens(line);
        if (t !== null) last = t;
      }
      if (first === null || last === null) return null;
      const lastNL = tail.lastIndexOf('\n');
      if (lastNL !== -1) save(fd, size - Buffer.byteLength(tail.slice(lastNL + 1)), first, last);
      return { first, last };
    } finally {
      closeSync(fd);
    }
  } catch (e) {
    dbg(e);
    return null;
  }
}

// Cold start (no valid cache) over a transcript larger than this counts only its last COLD_SCAN_BYTES; the partial first line fails JSON.parse and is skipped.
const COLD_SCAN_BYTES = 4 * 1024 * 1024;

// Counts Agent/Task delegations in new complete lines since the cached offset; returns the total count.
// Without a valid cache, a transcript over COLD_SCAN_BYTES is counted from its last COLD_SCAN_BYTES only (the cache write below keeps later prompts incremental).
// Fails open: on any error returns the cached count.
function countDelegations(path, size, cachePath) {
  let cache = { offset: 0, count: 0 };
  let hasCache = false;
  try {
    const c = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (Number.isInteger(c?.offset) && Number.isInteger(c?.count) && c.offset >= 0 && c.count >= 0 && c.offset <= size) {
      cache = c;
      hasCache = true;
    }
  } catch (e) {
    dbg(e);
    // missing or invalid cache: start from zero
  }
  if (!hasCache && size > COLD_SCAN_BYTES) cache = { offset: size - COLD_SCAN_BYTES, count: 0 };
  let next;
  try {
    const fd = openSync(path, 'r');
    let buf;
    try {
      buf = readBytes(fd, cache.offset, size - cache.offset);
    } finally {
      closeSync(fd);
    }
    const lastNL = buf.lastIndexOf(0x0a);
    if (lastNL === -1) return cache.count;
    let count = cache.count;
    for (const line of buf.toString('utf8', 0, lastNL).split('\n')) {
      if (!line.includes('"subagent_type":"')) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isMainAssistant(entry)) continue;
      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;
      count += content.filter((p) => p?.type === 'tool_use' && (p.name === 'Agent' || p.name === 'Task')).length;
    }
    next = { offset: cache.offset + lastNL + 1, count };
  } catch (e) {
    dbg(e);
    return cache.count;
  }
  try {
    writeAtomic(cachePath, JSON.stringify(next));
  } catch (e) {
    dbg(e);
    // ignore cache write errors
  }
  return next.count;
}

// Extra growth thresholds after the first warning: ORCH_LONG_REPEAT = comma list (default 250000,400000) or "off".
function repeatLevels(v, first) {
  if (v === 'off') return [];
  const raw = v === undefined || v === '' ? '250000,400000' : v;
  const nums = raw.split(',').map((s) => s.trim()).filter((s) => /^[1-9]\d*$/.test(s)).map(Number).filter((n) => n > first);
  return [...new Set(nums)].sort((a, b) => a - b).slice(0, 5);
}
// Highest warning level already shown (marker content); an empty or invalid marker (older versions) counts as 1.
function readLevel(marker) {
  try { const s = readFileSync(marker, 'utf8').trim(); return /^[1-9]\d*$/.test(s) ? Number(s) : 1; } catch (e) { dbg(e); return 1; }
}

function run(input) {
  if (process.env.ORCH_LONG === 'off') return '';

  const id = sanitizeSid(input?.session_id);
  if (id === '') return '';
  const dir = stateDir();
  if (dir === null) return '';
  const marker = join(dir, `orchestrator-long-${id}`);
  const countPath = `${marker}.count`;
  const path = input?.transcript_path;
  if (typeof path !== 'string' || path === '') return '';

  const tokensLimit = posInt(process.env.ORCH_LONG_TOKENS, 120000);
  const levels = [tokensLimit, ...repeatLevels(process.env.ORCH_LONG_REPEAT, tokensLimit)];
  const warned = existsSync(marker) ? readLevel(marker) : 0;
  if (warned >= levels.length) return '';
  const size = statSync(path).size;
  const g = contextGrowth(path, size, `${marker}.growth`);
  const growth = g ? g.last - g.first : 0;
  const level = levels.filter((t) => growth >= t).length;
  const say = (user, model) => JSON.stringify({ systemMessage: user, hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `${user} ${model} Tell the user in their language.` } });
  if (warned > 0) {
    if (!g || level <= warned) return '';
    writeAtomic(marker, String(level));
    return say(`orchestrator: this session is very long (+${Math.round(growth / 1000)}k context tokens; reminder ${level - 1} of ${levels.length - 1}). Every new message re-sends the whole conversation, so each turn costs more. A fresh session is cheaper; Claude can save your progress first so you can continue there.`, 'If a multi-step task is in progress, write a checkpoint per orchestrator:resume now (one haiku-coder delegation, bundled with any due housekeeping) and hand off per orchestrator:resume (summary plus a new-session card running /orchestrator:resume the real checkpoint name (never a placeholder)); otherwise suggest a new session or /compact in one line.');
  }

  const bytesLimit = posInt(process.env.ORCH_LONG_BYTES, 2 * 1024 * 1024);
  const delegLimit = posInt(process.env.ORCH_LONG_DELEGATIONS, 30);

  const tokensLong = level >= 1;
  const delegations = tokensLong ? 0 : countDelegations(path, size, countPath);
  const isLong = tokensLong || delegations >= delegLimit || (!g && size >= bytesLimit);
  if (!isLong) return '';

  writeAtomic(marker, String(g ? Math.max(1, level) : levels.length));
  try {
    rmSync(countPath, { force: true });
  } catch (e) {
    dbg(e);
    // ignore cleanup errors
  }
  const tail = 'Write a checkpoint per orchestrator:resume and hand off per orchestrator:resume (summary plus a new-session card running /orchestrator:resume the real checkpoint name (never a placeholder)).';
  const line = g
    ? `orchestrator: this session is long (+${Math.round((g.last - g.first) / 1000)}k context tokens${tokensLong ? '' : `, ${delegations} delegations`}). Every new message re-sends the whole conversation, so a fresh session is cheaper; Claude can save your progress first so you can continue there.`
    : `orchestrator: this session is long (${(size / 1048576).toFixed(1)} MB, ${delegations} delegations). Every new message re-sends the whole conversation, so a fresh session is cheaper; Claude can save your progress first so you can continue there.`;
  return say(line, tail);
}
