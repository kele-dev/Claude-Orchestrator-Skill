#!/usr/bin/env node
// Sum sub-agent token usage from a Claude Code transcript (JSONL), or main-session usage with --main. Always exits 0.
// Usage: node scripts/budget.mjs <transcript.jsonl|auto> [--mark] [--main] [--from <bytes>] [--limit <N>k]
import { statSync, readdirSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTranscript, entries } from './transcript.mjs';

// Newest *.jsonl in one project transcript dir; undefined if missing or without jsonl.
function newestJsonl(dir) {
  let best, bt = -1;
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      try {
        const t = statSync(path.join(dir, f)).mtimeMs;
        if (t > bt) { bt = t; best = path.join(dir, f); }
      } catch { continue; }
    }
  } catch { return undefined; }
  return best;
}

// Newest *.jsonl of this project's transcript dir: cwd (and its realpath), then each parent up to root.
// undefined if nothing found (treated as unreadable).
function newestTranscript() {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const starts = [process.cwd()];
  try { const real = realpathSync(process.cwd()); if (real !== starts[0]) starts.push(real); } catch { /* cwd only */ }
  for (const start of starts) {
    for (let dir = start; ; dir = path.dirname(dir)) {
      const found = newestJsonl(path.join(base, 'projects', dir.replace(/[^A-Za-z0-9]/g, '-')));
      if (found) return found;
      if (path.dirname(dir) === dir) break;
    }
  }
  return undefined;
}

// Main-session usage: last usage per assistant message.id (non-sidechain entries only).
function mainUsage(lines) {
  const msgs = new Map();
  let anon = 0, last = null;
  for (const line of lines) {
    if (!line.includes('"usage"')) continue;
    const o = entries([line]).next().value;
    if (!o || o.type !== 'assistant' || !o.message?.usage) continue;
    msgs.set(o.message.id ?? 'anon-' + anon++, o.message.usage);
    last = o.message.usage;
  }
  if (msgs.size === 0) return 'MAIN: 0 calls';
  let inp = 0, cr = 0, cw = 0, out = 0;
  for (const u of msgs.values()) {
    inp += u.input_tokens ?? 0;
    cr += u.cache_read_input_tokens ?? 0;
    cw += u.cache_creation_input_tokens ?? 0;
    out += u.output_tokens ?? 0;
  }
  const ctx = (last.input_tokens ?? 0) + (last.cache_read_input_tokens ?? 0) + (last.cache_creation_input_tokens ?? 0);
  const k = (n) => Math.round(n / 1000);
  return `MAIN: ${msgs.size} calls, input ${k(inp)}k, cache-read ${k(cr)}k, cache-write ${k(cw)}k, output ${k(out)}k, context ${k(ctx)}k`;
}

function main() {
  const args = process.argv.slice(2);
  const val = (name) => {
    const i = args.findIndex((a) => a === name || a.startsWith(name + '='));
    if (i < 0) return undefined;
    return args[i].includes('=') ? args[i].slice(name.length + 1) : args[i + 1];
  };
  let file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--from' && args[i - 1] !== '--limit');
  if (file === 'auto') file = newestTranscript();
  if (args.includes('--mark')) {
    let size;
    try { size = statSync(file).size; } catch { return 'BUDGET: mark ? (transcript unreadable)'; }
    return `BUDGET: mark ${size}`;
  }
  const lm = /^(\d+(?:\.\d+)?)k?$/i.exec(val('--limit') ?? '');
  const limit = lm && Number(lm[1]) > 0 ? Number(lm[1]) : null;
  const unknownSuffix = limit !== null ? ` of ${limit}k: UNKNOWN` : '';
  const fv = val('--from');
  const hasFrom = args.some((a) => a === '--from' || a.startsWith('--from='));
  if (hasFrom && !/^\d+$/.test(fv ?? '')) return `BUDGET: spent ? (no valid mark)${unknownSuffix}`;
  const from = /^\d+$/.test(fv ?? '') ? Number(fv) : 0;

  const main = args.includes('--main');
  let lines;
  try { lines = readTranscript(file, from); } catch { return main ? 'MAIN: ? (transcript unreadable)' : `BUDGET: spent ? (transcript unreadable)${unknownSuffix}`; }
  if (main) return mainUsage(lines);

  const launches = new Set();
  const map = new Map(); // launch id -> agent key
  const tokens = new Map(); // agent key -> max tokens
  const notes = [];
  const bump = (k, n) => { if (!tokens.has(k) || tokens.get(k) < n) tokens.set(k, n); };
  const re = /<task-notification>([\s\S]*?)<\/task-notification>/g;

  for (const line of lines) {
    if (!line.includes('tool_use') && !line.includes('toolUseResult') && !line.includes('subagent_tokens')) continue;
    const o = entries([line]).next().value;
    if (!o) continue;
    const m = o.message;
    if (o.type === 'assistant' && m && Array.isArray(m.content)) {
      for (const c of m.content) {
        if (c && c.type === 'tool_use' && (c.name === 'Agent' || c.name === 'Task') && c.id) launches.add(c.id);
      }
    }
    if (o.toolUseResult && typeof o.toolUseResult === 'object' && m && Array.isArray(m.content)) {
      for (const c of m.content) {
        if (c && c.type === 'tool_result' && launches.has(c.tool_use_id)) {
          const key = o.toolUseResult.agentId ?? c.tool_use_id;
          map.set(c.tool_use_id, key);
          if (typeof o.toolUseResult.totalTokens === 'number') bump(key, o.toolUseResult.totalTokens);
        }
      }
    }
    if (line.includes('subagent_tokens')) {
      for (const b of line.matchAll(re)) {
        const id = /<task-id>([\s\S]*?)<\/task-id>/.exec(b[1])?.[1]?.trim();
        const n = /<subagent_tokens>\s*(\d+)\s*<\/subagent_tokens>/.exec(b[1])?.[1];
        if (id && n !== undefined) notes.push([id, Number(n)]);
      }
    }
  }
  for (const [id, n] of notes) bump(id, n);

  let sum = 0, known = 0;
  for (const id of launches) {
    const key = map.get(id) ?? id;
    if (tokens.has(key)) { sum += tokens.get(key); known++; }
  }
  const A = launches.size, U = A - known;
  const word = A === 1 ? 'agent' : 'agents';
  const X = Math.round(sum / 1000);
  let out;
  if (U === 0) out = `BUDGET: spent ${X}k (${A} ${word})`;
  else if (known > 0) out = `BUDGET: spent ${X}k+? (${A} ${word}, ${U} without usage)`;
  else out = `BUDGET: spent ? (${A} ${word}, ${U} without usage)`;
  if (limit !== null) out += ` of ${limit}k: ${sum >= limit * 1000 ? 'OVER' : U > 0 ? 'UNKNOWN' : 'UNDER'}`;
  return out;
}

let line;
try { line = main(); } catch { line = 'BUDGET: spent ? (transcript unreadable)'; }
process.stdout.write(line + '\n');
process.exit(0);
