#!/usr/bin/env node
// Token trace summary (always exits 0).
// Usage: node scripts/trace-tokens.mjs <trace.jsonl | result.json> [--md]
import { readFileSync } from 'node:fs';

const UNREADABLE = 'TRACE: unreadable';

const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function readText(path) {
  if (typeof path !== 'string') return null;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function parseJsonl(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s));
    } catch {
      // skip unparsable lines
    }
  }
  return out;
}

// Returns structured numbers for one trace file, or null when unreadable.
function analyzeTrace(text) {
  if (text == null) return null;
  const entries = parseJsonl(text);

  let r = null;
  for (const e of entries) if (e?.type === 'result') r = e;
  let init = null;
  for (const e of entries) {
    if (e?.type === 'system' && e.subtype === 'init') {
      init = e;
      break;
    }
  }

  let sum = null;
  if (r) {
    sum = 0;
    for (const u of Object.values(r.modelUsage ?? {})) {
      sum +=
        (u?.inputTokens ?? 0) +
        (u?.outputTokens ?? 0) +
        (u?.cacheReadInputTokens ?? 0) +
        (u?.cacheCreationInputTokens ?? 0);
    }
  }
  const byModel = [];
  for (const [m, u] of Object.entries(r?.modelUsage ?? {})) {
    if (isNum(u?.costUSD)) byModel.push({ model: m, cost: u.costUSD });
  }
  const model = init?.model ?? '?';

  const seen = new Set();
  let main = 0;
  for (const e of entries) {
    if (e?.type !== 'assistant') continue;
    if (e.parent_tool_use_id != null) continue;
    if (e.uuid != null) {
      if (seen.has(e.uuid)) continue;
      seen.add(e.uuid);
    }
    for (const b of e.message?.content ?? []) {
      if (b?.type === 'text' && typeof b.text === 'string') main += b.text.length;
    }
  }

  const agents = entries
    .filter((e) => e?.type === 'system' && e.subtype === 'task_started')
    .map((t) => {
      const id = t.tool_use_id;
      const first =
        id != null
          ? entries.find((e) => e?.type === 'assistant' && e.parent_tool_use_id === id)
          : undefined;
      const u = first?.message?.usage;
      let startup = '?';
      let cached = '?';
      if (u) {
        startup = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        cached = u.cache_read_input_tokens ?? '?';
      }
      let note = null;
      for (const e of entries) {
        if (e?.type === 'system' && e.subtype === 'task_notification' && e.tool_use_id === id) note = e;
      }
      return {
        type: t.subagent_type ?? '?',
        startup,
        cached,
        total: note?.usage?.total_tokens ?? '?',
        tools: note?.usage?.tool_uses ?? '?',
        brief: typeof t.prompt === 'string' ? t.prompt.length : '?',
      };
    });

  return {
    sum,
    cost: isNum(r?.total_cost_usd) ? r.total_cost_usd : null,
    byModel,
    turns: r?.num_turns ?? '?',
    model,
    out: r?.modelUsage?.[model]?.outputTokens ?? '?',
    reply: typeof r?.result === 'string' ? r.result.length : null,
    main,
    agents,
  };
}

// Cost per model, sorted by cost, averaged over the given per-run lists.
function costByModel(lists) {
  const acc = new Map();
  for (const l of lists) for (const x of l) acc.set(x.model, (acc.get(x.model) ?? 0) + x.cost);
  const n = lists.length;
  const rows = [...acc].map(([model, c]) => ({ model, cost: c / n })).sort((a, b) => b.cost - a.cost);
  const total = rows.reduce((s, x) => s + x.cost, 0);
  return rows
    .map((x) => `${x.model} $${x.cost.toFixed(4)} (${total > 0 ? Math.round((100 * x.cost) / total) : 0}%)`)
    .join(' ; ');
}

function traceLines(text) {
  const a = analyzeTrace(text);
  if (!a) return [UNREADABLE];
  const T = a.sum == null ? '?' : Math.round(a.sum / 1000) + 'k';
  const C = a.cost == null ? '?' : '$' + a.cost.toFixed(4);
  const bm = a.byModel.length ? ` | by model: ${costByModel([a.byModel])}` : '';
  const lines = [
    `TRACE: total ${T} tokens, cost ${C}, turns ${a.turns}, main ${a.model} out ${a.out}, reply ${a.reply ?? '?'} chars, main text ${a.main} chars${bm}`,
  ];
  for (const g of a.agents) {
    lines.push(`AGENT: ${g.type} startup ${g.startup} cached ${g.cached} total ${g.total} tools ${g.tools} brief ${g.brief}`);
  }
  return lines;
}

function parseResult(text) {
  try {
    const o = JSON.parse(text);
    return o && typeof o === 'object' && Array.isArray(o.cases) ? o : null;
  } catch {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const md = args.includes('--md');
  const file = args.find((a) => a !== '--md');
  const text = file ? readText(file) : null;
  if (text == null) return [UNREADABLE];

  const root = parseResult(text);
  if (!root) return traceLines(text);

  const meta = root.suite ?? {};
  const out = [];

  if (!md) {
    for (const c of root.cases) {
      for (const [arm, runs] of Object.entries(c.arms ?? {})) {
        if (!Array.isArray(runs)) continue;
        runs.forEach((run, i) => {
          out.push(`RUN: ${c.name} ${arm} #${i + 1} ${run.passed === true ? 'PASS' : 'FAIL'}`);
          out.push(...traceLines(readText(run.tracePath)));
        });
      }
    }
    return out;
  }

  const version = meta.plugins?.[0]?.version ?? '?';
  const date = String(root.startedAt ?? '').slice(0, 10) || '?';
  for (const c of root.cases) {
    const model = c.model ?? meta.modelOverride ?? '?';
    for (const [arm, runs] of Object.entries(c.arms ?? {})) {
      if (!Array.isArray(runs)) continue;
      const n = runs.length;
      const passed = runs.filter((r) => r.passed === true).length;
      const analyses = runs.map((r) => analyzeTrace(readText(r.tracePath)));

      const totals = analyses.filter((a) => a && a.sum != null).map((a) => a.sum);
      const meanTotal = totals.length ? Math.round(mean(totals) / 1000) + 'k' : '?';

      const costs = runs.map((r) => r.costUsd).filter(isNum);
      const meanCost = costs.length ? mean(costs).toFixed(4) : '?';

      const startups = analyses.flatMap((a) => (a ? a.agents.map((g) => g.startup).filter(isNum) : []));
      const agentStr = startups.length
        ? `${(Math.min(...startups) / 1000).toFixed(1)}-${(Math.max(...startups) / 1000).toFixed(1)}k`
        : '-';

      const replies = analyses.filter((a) => a && a.reply != null).map((a) => a.reply);
      const meanReply = replies.length ? Math.round(mean(replies)) : '?';

      const byModelLists = analyses.filter((a) => a && a.byModel.length).map((a) => a.byModel);
      const bmStr = byModelLists.length ? `; cost by model ${costByModel(byModelLists)}` : '';

      out.push(
        `| ${version} | ${date} | ${c.name} | ${model} | ${n} | ${meanTotal} | ${meanCost} | arm ${arm}; pass ${passed}/${n}; agent startup ${agentStr}; reply ${meanReply} chars${bmStr} |`,
      );
    }
  }
  return out;
}

try {
  const lines = main();
  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
} catch {
  process.stdout.write(UNREADABLE + '\n');
}
process.exitCode = 0;
