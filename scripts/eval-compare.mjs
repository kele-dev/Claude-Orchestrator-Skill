#!/usr/bin/env node
// Compare eval token totals against a baseline.
// Usage: node scripts/eval-compare.mjs <current.json> [baseline.json=evals/baseline.json] [--threshold 15] [--write <out.json>]
// Exit: 0 ok, 1 a pair is over the threshold, 2 unreadable file or bad args.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { analyzeTrace, readText } from './trace-tokens.mjs';

function fail(msg) {
  process.stdout.write(`EVAL-COMPARE: ERROR ${msg}\n`);
  process.exit(2);
}

function loadJson(path) {
  try {
    const o = JSON.parse(readFileSync(path, 'utf8'));
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

// Mean total tokens over the readable runs of one arm, or null.
function armTokens(runs, dir) {
  const totals = [];
  for (const run of Array.isArray(runs) ? runs : []) {
    let text = readText(run?.tracePath);
    if (text == null && typeof run?.tracePath === 'string') {
      text = readText(join(dir, run.tracePath.split(/[\\/]/).pop()));
    }
    const a = analyzeTrace(text);
    if (a && a.sum != null) totals.push(a.sum);
  }
  return totals.length ? Math.round(totals.reduce((x, y) => x + y, 0) / totals.length) : null;
}

// Returns {model, plugin, pairs: [[case, arm, tokens|null]]}.
function values(obj, dir) {
  const pairs = [];
  if (Array.isArray(obj.cases)) {
    for (const c of obj.cases) {
      for (const [arm, runs] of Object.entries(c?.arms ?? {})) pairs.push([c.name, arm, armTokens(runs, dir)]);
    }
    return { model: obj.suite?.modelOverride ?? null, plugin: obj.suite?.plugins?.[0]?.version ?? null, pairs };
  }
  for (const [name, arms] of Object.entries(obj.cases ?? {})) {
    for (const [arm, n] of Object.entries(arms ?? {})) {
      pairs.push([name, arm, typeof n === 'number' && Number.isFinite(n) ? n : null]);
    }
  }
  return { model: obj.model ?? null, plugin: obj.plugin ?? null, pairs };
}

const args = process.argv.slice(2);
const pos = [];
let threshold = 15;
let writeTo = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--threshold') {
    const v = args[++i];
    if (!/^\d+(\.\d+)?$/.test(v ?? '')) fail('bad --threshold');
    threshold = Number(v);
  } else if (args[i] === '--write') {
    writeTo = args[++i];
    if (!writeTo) fail('--write needs a path');
  } else if (args[i].startsWith('--')) {
    fail(`unknown flag ${args[i]}`);
  } else {
    pos.push(args[i]);
  }
}
if (pos.length < 1 || pos.length > 2) fail('usage: eval-compare.mjs <current.json> [baseline.json] [--threshold N] [--write out.json]');

const curObj = loadJson(pos[0]);
if (!curObj || !Array.isArray(curObj.cases)) fail(`current file unreadable: ${pos[0]}`);
const cur = values(curObj, dirname(pos[0]));

if (writeTo) {
  const cases = {};
  for (const [name, arm, n] of cur.pairs) {
    if (n == null) continue;
    (cases[name] ??= {})[arm] = n;
  }
  if (!Object.keys(cases).length) {
    process.stdout.write('EVAL-COMPARE: ERROR no readable trace, nothing written\n');
    process.exit(2);
  }
  writeFileSync(writeTo, JSON.stringify({ model: cur.model, plugin: cur.plugin, cases }, null, 2) + '\n');
  process.stdout.write(`EVAL-COMPARE: WROTE ${writeTo}\n`);
  process.exit(0);
}

const basePath = pos[1] ?? 'evals/baseline.json';
const baseObj = loadJson(basePath);
if (!baseObj || !baseObj.cases || typeof baseObj.cases !== 'object') fail(`baseline unreadable: ${basePath}`);
const base = values(baseObj, dirname(basePath));

if (cur.model && base.model && cur.model !== base.model) {
  process.stdout.write(`EVAL-COMPARE: SKIP model ${base.model} vs ${cur.model}\n`);
  process.exit(0);
}

const baseMap = new Map(base.pairs.map(([c, a, n]) => [`${c}\u0000${a}`, n]));
let over = 0;
for (const [name, arm, now] of cur.pairs) {
  const b = baseMap.get(`${name}\u0000${arm}`);
  let status;
  let pct = '';
  if (now == null) status = 'SKIP';
  else if (b == null || b <= 0) status = 'NEW';
  else {
    const d = ((now - b) / b) * 100;
    pct = ` ${d >= 0 ? '+' : ''}${d.toFixed(1)}%`;
    status = now * 100 > b * (100 + threshold) ? 'OVER' : 'OK';
  }
  if (status === 'OVER') over++;
  process.stdout.write(`CMP: ${name} ${arm} base ${b ?? '?'} now ${now ?? '?'}${pct} ${status}\n`);
}
process.stdout.write(`EVAL-COMPARE: ${over ? 'FAIL' : 'PASS'} ${over} over, threshold ${threshold}%\n`);
process.exit(over ? 1 : 0);
