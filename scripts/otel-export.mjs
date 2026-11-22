#!/usr/bin/env node
// Export a Claude Code session transcript (JSONL) as OTLP/JSON spans, using OpenTelemetry GenAI semantic conventions.
// Usage: node scripts/otel-export.mjs <transcript.jsonl> [--out <file>]   (default: stdout)
// Exit: 0 ok, 2 unreadable transcript or invalid arguments.
// Content capture is off: no prompts, message text, tool outputs or tool inputs are written (only Agent/Task subagent_type).
// Schema pinned to 1.37.0 because the GenAI conventions are at Development stability.
// Trace and span IDs are deterministic: sha256 of the absolute transcript path (trace), and of path + span index (span).
// Missing timestamps take the last earlier one (else the file mtime); a call without a result ends at the transcript's last timestamp.
import { createHash } from 'node:crypto';
import { statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readTranscript, entries } from './transcript.mjs';

const SCHEMA_URL = 'https://opentelemetry.io/schemas/1.37.0';

function fail(msg) {
  process.stderr.write(msg + '\n');
  process.exit(2);
}

const args = process.argv.slice(2);
let file = null, out = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') {
    out = args[++i];
    if (out === undefined) fail('--out needs a file');
  } else if (a.startsWith('--')) fail(`unknown option ${a}`);
  else if (file === null) file = a;
  else fail(`unexpected argument ${a}`);
}
if (file === null) fail('usage: node scripts/otel-export.mjs <transcript.jsonl> [--out <file>]');

const abs = path.resolve(file);
let lines;
try { lines = readTranscript(abs); } catch { fail(`cannot read transcript: ${file}`); }

const sha = (s) => createHash('sha256').update(s).digest('hex');
const traceId = sha(abs).slice(0, 32);
const spanId = (i) => sha(`${abs}:${i}`).slice(0, 16);
const toNs = (ts) => {
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : BigInt(ms) * 1000000n;
};
const str = (key, v) => ({ key, value: { stringValue: v } });
const int = (key, v) => ({ key, value: { intValue: String(v) } });

const list = [...entries(lines)];

// Main-session usage: last usage per assistant message.id, same rule as mainUsage in budget.mjs.
const usageById = new Map();
let anon = 0;
for (const o of list) {
  if (o.type !== 'assistant' || !o.message?.usage) continue;
  usageById.set(o.message.id ?? 'anon-' + anon++, o.message.usage);
}
let inTok = 0, outTok = 0;
for (const u of usageById.values()) {
  inTok += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  outTok += u.output_tokens ?? 0;
}

const stamps = list.map((o) => toNs(o.timestamp)).filter((t) => t !== null);
const fileNs = BigInt(Math.round(statSync(abs).mtimeMs)) * 1000000n;
const rootStart = stamps.length ? stamps[0] : fileNs;
const rootEnd = stamps.length ? stamps[stamps.length - 1] : fileNs;

// Tool calls and their results (first tool_result per tool_use_id).
const calls = [];
const results = new Map();
let last = rootStart;
for (const o of list) {
  const t = toNs(o.timestamp);
  if (t !== null) last = t;
  const content = Array.isArray(o.message?.content) ? o.message.content : [];
  if (o.type === 'assistant') {
    for (const b of content) {
      if (b?.type === 'tool_use') calls.push({ block: b, start: last });
    }
  } else if (o.type === 'user') {
    for (const b of content) {
      if (b?.type === 'tool_result' && !results.has(b.tool_use_id)) {
        results.set(b.tool_use_id, { end: toNs(o.timestamp), isError: b.is_error === true });
      }
    }
  }
}

const spans = [{
  traceId,
  spanId: spanId(0),
  name: 'invoke_agent orchestrator',
  kind: 1,
  startTimeUnixNano: String(rootStart),
  endTimeUnixNano: String(rootEnd),
  attributes: [
    str('gen_ai.operation.name', 'invoke_agent'),
    str('gen_ai.agent.name', 'orchestrator'),
    str('gen_ai.provider.name', 'anthropic'),
    int('gen_ai.usage.input_tokens', inTok),
    int('gen_ai.usage.output_tokens', outTok),
  ],
}];

calls.forEach(({ block, start }, k) => {
  const result = results.get(block.id);
  const end = result?.end ?? null;
  const isAgent = block.name === 'Agent' || block.name === 'Task';
  const sub = typeof block.input?.subagent_type === 'string' && block.input.subagent_type ? block.input.subagent_type : 'agent';
  const attributes = isAgent
    ? [str('gen_ai.operation.name', 'invoke_agent'), str('gen_ai.agent.name', sub)]
    : [str('gen_ai.operation.name', 'execute_tool'), str('gen_ai.tool.name', String(block.name ?? 'unknown'))];
  attributes.push(str('gen_ai.tool.call.id', String(block.id ?? '')));
  const span = {
    traceId,
    spanId: spanId(k + 1),
    parentSpanId: spans[0].spanId,
    name: isAgent ? `invoke_agent ${sub}` : `execute_tool ${block.name ?? 'unknown'}`,
    kind: 1,
    startTimeUnixNano: String(start),
    endTimeUnixNano: String(end ?? (rootEnd > start ? rootEnd : start)),
    attributes,
  };
  if (result) span.status = { code: result.isError ? 2 : 1 };
  spans.push(span);
});

const doc = {
  resourceSpans: [{
    resource: { attributes: [str('service.name', 'claude-orchestrator')] },
    scopeSpans: [{
      scope: { name: 'orchestrator-otel-export', version: '1' },
      schemaUrl: SCHEMA_URL,
      spans,
    }],
  }],
};

const text = JSON.stringify(doc, null, 2) + '\n';
if (out) writeFileSync(out, text);
else process.stdout.write(text);
