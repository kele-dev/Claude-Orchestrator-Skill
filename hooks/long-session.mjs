#!/usr/bin/env node
// UserPromptSubmit hook: warns once per session when the context has grown (assistant message.usage tokens),
// or, without usage data, when the transcript is large; also warns on delegation count.
// Delegation count is incremental: the byte offset and count are cached in a tmp .count file, and only new bytes are read.
// Fails open: on any error or unexpected input it prints nothing and exits 0.
import { closeSync, existsSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  try {
    const out = run(JSON.parse(raw));
    if (out) process.stdout.write(out + '\n');
  } catch {
    // fail open
  }
});

const posInt = (v, d) => (/^[1-9]\d*$/.test(v ?? '') ? Number(v) : d);

// Context growth from assistant message.usage: { first, last } tokens, or null when no usage entries are found.
function contextGrowth(path, size) {
  const WINDOW = 1024 * 1024;
  const usageTokens = (line) => {
    if (!line.includes('"usage"')) return null;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      return null;
    }
    const u = entry?.message?.usage;
    if (entry?.type !== 'assistant' || entry.isSidechain || !u || typeof u !== 'object') return null;
    return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  };
  const readRange = (fd, start, len) => {
    const buf = Buffer.alloc(len);
    let got = 0;
    while (got < len) {
      const n = readSync(fd, buf, got, len - got, start + got);
      if (n <= 0) break;
      got += n;
    }
    return buf.toString('utf8', 0, got);
  };
  try {
    const fd = openSync(path, 'r');
    try {
      const len = Math.min(size, WINDOW);
      let head = readRange(fd, 0, len);
      if (size > len) {
        const nl = head.lastIndexOf('\n');
        head = nl === -1 ? '' : head.slice(0, nl);
      }
      let tail = readRange(fd, size - len, len);
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
      return { first, last };
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

// Counts Agent/Task delegations in new complete lines since the cached offset; returns the total count.
// Fails open: on any error returns the cached count.
function countDelegations(path, size, cachePath) {
  let cache = { offset: 0, count: 0 };
  try {
    const c = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (Number.isInteger(c?.offset) && Number.isInteger(c?.count) && c.offset >= 0 && c.count >= 0 && c.offset <= size) cache = c;
  } catch {
    // missing or invalid cache: start from zero
  }
  let next;
  try {
    const len = size - cache.offset;
    const buf = Buffer.alloc(len);
    const fd = openSync(path, 'r');
    let got = 0;
    try {
      while (got < len) {
        const n = readSync(fd, buf, got, len - got, cache.offset + got);
        if (n <= 0) break;
        got += n;
      }
    } finally {
      closeSync(fd);
    }
    const lastNL = buf.subarray(0, got).lastIndexOf(0x0a);
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
      if (entry?.type !== 'assistant' || entry.isSidechain) continue;
      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;
      count += content.filter((p) => p?.type === 'tool_use' && (p.name === 'Agent' || p.name === 'Task')).length;
    }
    next = { offset: cache.offset + lastNL + 1, count };
  } catch {
    return cache.count;
  }
  try {
    writeFileSync(cachePath, JSON.stringify(next));
  } catch {
    // ignore cache write errors
  }
  return next.count;
}

function run(input) {
  if (process.env.ORCH_LONG === 'off') return '';

  const id = String(input?.session_id ?? '').replace(/[^A-Za-z0-9-]/g, '');
  if (id === '') return '';
  const marker = join(tmpdir(), `orchestrator-long-${id}`);
  const countPath = `${marker}.count`;
  if (existsSync(marker)) return '';

  const path = input?.transcript_path;
  if (typeof path !== 'string' || path === '') return '';

  const tokensLimit = posInt(process.env.ORCH_LONG_TOKENS, 120000);
  const bytesLimit = posInt(process.env.ORCH_LONG_BYTES, 2 * 1024 * 1024);
  const delegLimit = posInt(process.env.ORCH_LONG_DELEGATIONS, 30);

  const size = statSync(path).size;
  const g = contextGrowth(path, size);
  const tokensLong = g && g.last - g.first >= tokensLimit;
  const delegations = tokensLong ? 0 : countDelegations(path, size, countPath);
  const isLong = tokensLong || delegations >= delegLimit || (!g && size >= bytesLimit);
  if (!isLong) return '';

  writeFileSync(marker, '');
  try {
    rmSync(countPath, { force: true });
  } catch {
    // ignore cleanup errors
  }
  const tail = ' Write a checkpoint per orchestrator:resume and continue in a new session with /orchestrator:resume.';
  const line = g
    ? `orchestrator: this session is long (+${Math.round((g.last - g.first) / 1000)}k context tokens${tokensLong ? '' : `, ${delegations} delegations`}).${tail}`
    : `orchestrator: this session is long (${(size / 1048576).toFixed(1)} MB, ${delegations} delegations).${tail}`;
  return JSON.stringify({
    systemMessage: line,
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: line },
  });
}
