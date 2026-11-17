#!/usr/bin/env node
// Turn a PRD task table (Task, Files, ...) into file-disjoint parallel waves for team mode. Tasks sharing a file, or a folder and a file under it, never share a wave.
// Usage: node scripts/plan-dag.mjs <prd.md> [--lanes N] [--json]   (N = 1-4, default 3)
// Output: one line per wave, then a PLAN summary; --json prints {waves, tasks, maxLanes}. Exit: 0 ok, 2 bad args, unreadable file or no task table.
import { readFileSync } from 'node:fs';

function fail(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const json = argv.includes('--json');
let lanes = 3;
const li = argv.indexOf('--lanes');
if (li !== -1) {
  const v = argv[li + 1];
  if (v === undefined || !/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 4) fail('plan-dag: --lanes must be an integer 1-4');
  lanes = Number(v);
}
const prd = argv.find((a, i) => !a.startsWith('--') && (li === -1 || i !== li + 1));
if (!prd) fail('plan-dag: usage: node scripts/plan-dag.mjs <prd.md> [--lanes N] [--json]');

let text;
try {
  text = readFileSync(prd, 'utf8').replace(/^﻿/, '');
} catch (e) {
  fail(`plan-dag: cannot read ${prd} (${e.message})`);
}

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());

// First table whose header has a "Files" column; rows run until the first non-table line.
const lines = text.split(/\r?\n/);
let filesCol = -1;
let rows = [];
for (let i = 0; i < lines.length - 1 && filesCol === -1; i++) {
  if (!lines[i].trim().startsWith('|') || !/^\s*\|?\s*:?-+/.test(lines[i + 1])) continue;
  const header = splitRow(lines[i]).map((h) => h.toLowerCase());
  const col = header.indexOf('files');
  if (col === -1) continue;
  filesCol = col;
  for (let j = i + 2; j < lines.length && lines[j].trim().startsWith('|'); j++) rows.push(splitRow(lines[j]));
}
if (filesCol === -1) {
  process.stdout.write('PLAN: no task table with a Files column\n');
  process.exit(2);
}

const clean = (s) => s.replace(/`|\*\*/g, '').trim();
const tasks = rows
  .filter((cells) => cells.some((c) => c !== ''))
  .map((cells) => {
    const files = (cells[filesCol] ?? '')
      .replace(/<br\s*\/?>/gi, ',')
      .split(/[,;\s]+/)
      .map((f) => clean(f).replace(/\\/g, '/').replace(/:\d+(-\d+)?$/, ''))
      .filter((f) => f && (f.includes('/') || f.includes('.')));
    return { task: clean(cells[0] ?? ''), files: [...new Set(files)] };
  });
if (tasks.length === 0) {
  process.stdout.write('PLAN: no task table with a Files column\n');
  process.exit(2);
}

const conflict = (a, b) => {
  if (a.files.length === 0 || b.files.length === 0) return true;
  return a.files.some((fa) => b.files.some((fb) =>
    fa === fb || (fa.endsWith('/') && fb.startsWith(fa)) || (fb.endsWith('/') && fa.startsWith(fb))));
};

// Single pass in PRD order: start after the latest conflicting earlier task, then move to the next wave with room.
const waveOf = [];
const counts = [];
tasks.forEach((t, j) => {
  let base = 1;
  for (let i = 0; i < j; i++) if (conflict(tasks[i], t)) base = Math.max(base, waveOf[i] + 1);
  let w = base;
  while ((counts[w] ?? 0) >= lanes) w++;
  counts[w] = (counts[w] ?? 0) + 1;
  waveOf[j] = w;
});

const waves = [];
tasks.forEach((t, j) => {
  (waves[waveOf[j]] ??= []).push({ task: t.task, files: t.files });
});
const ordered = waves.map((w) => w ?? []).filter((w) => w.length > 0);
const maxLanes = Math.max(...ordered.map((w) => w.length));

if (json) {
  process.stdout.write(`${JSON.stringify({ waves: ordered, tasks: tasks.length, maxLanes })}\n`);
} else {
  const out = ordered.map((w, k) => `WAVE ${k + 1}: ${w.map((t) => `${t.task} [${t.files.join(', ')}]`).join(', ')}`);
  out.push(`PLAN: ${tasks.length} tasks, ${ordered.length} waves, max ${maxLanes} lanes`);
  process.stdout.write(`${out.join('\n')}\n`);
}
process.exit(0);
