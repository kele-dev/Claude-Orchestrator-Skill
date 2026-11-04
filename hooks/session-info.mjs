#!/usr/bin/env node
// SessionStart hook: prints the per-project orchestrator store path, lesson index and checkpoints.
// Store computation mirrors skills/learn/SKILL.md "## Store". Fails open: any error prints nothing.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

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

const fwd = (p) => p.replace(/\\/g, '/');

function listMd(dir, prefix = '') {
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.md') && f.startsWith(prefix)).sort();
  } catch {
    return [];
  }
}

function run(input) {
  const cwd = input?.cwd;
  if (typeof cwd !== 'string' || cwd === '') return '';

  let main = cwd;
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8',
    }).trim();
    if (common) main = dirname(common);
  } catch {
    main = cwd;
  }
  main = fwd(main);

  const key = main.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(-80);
  const store = fwd(homedir()) + '/.claude/orchestrator/' + key;
  const lines = [`Orchestrator store: ${store}`];

  const allLessons = listMd(join(store, 'lessons'), 'learned-');
  const lessons = allLessons.slice(0, 20).map((f) => {
    let desc = '';
    try {
      const fm = readFileSync(join(store, 'lessons', f), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const m = fm && fm[1].match(/^description:\s*(.*)$/m);
      if (m) desc = m[1].trim();
    } catch { /* ignore */ }
    return `${f}: ${desc.slice(0, 100)}`;
  });
  if (allLessons.length > 20) lessons.push(`+${allLessons.length - 20} more (see ${store}/lessons)`);
  lines.push(lessons.length ? `Lessons: ${lessons.join('; ')}` : 'Lessons: none');

  const cpDir = join(store, 'checkpoints');
  const allCps = listMd(cpDir)
    .map((f) => {
      let t = 0;
      try { t = statSync(join(cpDir, f)).mtimeMs; } catch { /* ignore */ }
      return { f, t };
    })
    .sort((a, b) => b.t - a.t || (a.f < b.f ? 1 : -1))
    .map((x) => x.f);
  const cps = allCps.slice(0, 5).map((f) => {
    let task = '';
    try {
      const m = readFileSync(join(store, 'checkpoints', f), 'utf8').match(/^\s*(?:[-*]\s*)?Task:\s*(.*)$/m);
      if (m) task = m[1].trim().slice(0, 80);
    } catch { /* ignore */ }
    return `${f.replace(/\.md$/, '')} (${task})`;
  });
  if (allCps.length > 5) cps.push(`+${allCps.length - 5} more`);
  if (cps.length) lines.push(`Checkpoints: ${cps.join('; ')}`);

  let legacy = false;
  try {
    legacy = readdirSync(join(main, '.claude', 'skills')).some((d) => d.startsWith('learned-'));
  } catch { /* none */ }
  if (!legacy) legacy = listMd(join(main, '.claude', 'orchestrator', 'checkpoints')).length > 0;
  if (legacy) lines.push(`Legacy files present in ${main}/.claude (read legacy.md in the orchestrator:learn skill folder).`);

  return lines.join('\n');
}
