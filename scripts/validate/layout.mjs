// Sections 1-7c: manifests, skills, agents, hooks.json, cross-references, required files, README/CHANGELOG rules.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const MODELS = new Set(['haiku', 'sonnet', 'opus', 'inherit']);

export function run(ctx) {
const { root, err, exists, readText, readJson, frontmatter, listDirs, listMd, lfBytes } = ctx;

// 1. Manifests
const plugin = readJson('.claude-plugin/plugin.json');
const market = readJson('.claude-plugin/marketplace.json');
let version = '?';
if (plugin) {
  version = plugin.version;
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(String(plugin.version ?? ''))) err('.claude-plugin/plugin.json', `version "${plugin.version}" is not x.y.z`);
  if (market) {
    const plugins = Array.isArray(market.plugins) ? market.plugins : [];
    const entry = plugins.find((p) => p?.name === plugin.name);
    if (!entry) err('.claude-plugin/marketplace.json', `no plugins entry named "${plugin.name}"`);
    else if (entry.version !== plugin.version) {
      err('.claude-plugin/marketplace.json', `version mismatch: marketplace "${entry.version}" vs plugin.json "${plugin.version}"`);
    }
  }
}

// 2. Skills
const skillDirs = listDirs('skills');
for (const dir of skillDirs) {
  const file = `skills/${dir}/SKILL.md`;
  if (!exists(path.join(root, file))) {
    err(file, 'missing SKILL.md');
    continue;
  }
  const fm = frontmatter(file);
  if (!fm) continue;
  if (fm.name !== dir) err(file, `name "${fm.name ?? ''}" must match folder "${dir}"`);
  if (!fm.description) err(file, 'description is empty');
}

// 3. Agents
const agentFiles = listMd('agents');
for (const f of agentFiles) {
  const file = `agents/${f}`;
  const fm = frontmatter(file);
  if (!fm) continue;
  if (fm.name !== f.slice(0, -3)) err(file, `name "${fm.name ?? ''}" must match file "${f.slice(0, -3)}"`);
  if (!fm.description) err(file, 'description is empty');
  if (!MODELS.has(fm.model)) err(file, `model "${fm.model ?? ''}" must be one of haiku, sonnet, opus, inherit`);
  if (['opus-planner.md', 'opus-reviewer.md'].includes(f) && fm.model !== 'opus') err(file, 'model must be opus');
  if (!fm.tools) err(file, 'tools is empty');
}

// 4. Hooks
const hooksJson = readJson('hooks/hooks.json');
if (hooksJson) {
  const starts = Array.isArray(hooksJson.hooks?.SessionStart) ? hooksJson.hooks.SessionStart : [];
  const matchers = new Set(starts.flatMap((h) => String(h?.matcher ?? '').split('|')).map((s) => s.trim()));
  const missing = ['startup', 'resume', 'clear', 'compact'].filter((m) => !matchers.has(m));
  if (missing.length) err('hooks/hooks.json', `SessionStart matchers missing: ${missing.join(', ')}`);

  for (const [event, entries] of Object.entries(hooksJson.hooks ?? {})) {
    if (!Array.isArray(entries)) continue;
    entries.forEach((entry, i) => {
      if (/^(Pre|Post)ToolUse$/.test(event) && (typeof entry?.matcher !== 'string' || !entry.matcher.trim())) {
        err('hooks/hooks.json', `${event}[${i}] matcher must be a non-empty string`);
      }
      const hooks = Array.isArray(entry?.hooks) ? entry.hooks : [];
      hooks.forEach((h, j) => {
        if (h?.type !== 'command') err('hooks/hooks.json', `${event}[${i}].hooks[${j}] type must be "command"`);
        if (h?.timeout !== undefined && !(typeof h.timeout === 'number' && h.timeout > 0)) {
          err('hooks/hooks.json', `${event}[${i}].hooks[${j}] timeout must be a positive number`);
        }
      });
    });
  }

  const checkCommand = (cmd) => {
    for (const m of cmd.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"']+)/g)) {
      if (!exists(path.join(root, m[1]))) err('hooks/hooks.json', `command references missing file: ${m[1]}`);
    }
  };
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === 'command' && typeof v === 'string') checkCommand(v);
        else walk(v);
      }
    }
  };
  walk(hooksJson);
}

// 4b. Syntax check for hook and script modules (scripts/validate/ included)
for (const dir of ['hooks', 'scripts', 'scripts/validate']) {
  const abs = path.join(root, dir);
  const files = exists(abs) ? fs.readdirSync(abs).filter((f) => f.endsWith('.mjs')).sort() : [];
  for (const f of files) {
    const res = spawnSync(process.execPath, ['--check', path.join(abs, f)], { encoding: 'utf8' });
    if (res.status !== 0) err(`${dir}/${f}`, `syntax error: ${(res.stderr ?? '').split('\n')[0]}`);
  }
}
if (!exists(path.join(root, 'hooks/rules.md'))) err('hooks/rules.md', 'missing');

// 5. Cross-references
const known = new Set([...skillDirs, ...agentFiles.map((f) => f.slice(0, -3))]);
const refFiles = [
  'README.md',
  'hooks/rules.md',
  ...skillDirs.flatMap((d) => listMd(`skills/${d}`).map((f) => `skills/${d}/${f}`)),
  ...agentFiles.map((f) => `agents/${f}`),
];
for (const file of refFiles) {
  if (!exists(path.join(root, file))) continue;
  const text = readText(path.join(root, file));
  for (const m of text.matchAll(/orchestrator:([a-z][a-z0-9-]*)/g)) {
    if (!known.has(m[1])) {
      const line = text.slice(0, m.index).split('\n').length;
      err(file, `unknown skill or agent "${m[1]}"`, line);
    }
  }
}

// 6. README lists every skill as /orchestrator:<name>
if (!exists(path.join(root, 'README.md'))) {
  err('README.md', 'missing README.md');
} else {
  const readme = readText(path.join(root, 'README.md'));
  for (const d of skillDirs) {
    const escaped = d.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
    if (!new RegExp(`/orchestrator:${escaped}(?![a-z0-9-])`).test(readme)) {
      err('README.md', `missing /orchestrator:${d}`);
    }
  }
}

// 7. Required files, headings, frontmatter flags, README version note
for (const f of ['skills/on/modes.md', 'skills/on/reference.md', 'skills/learn/legacy.md', 'skills/status/caps.md', 'skills/learn/reference.md', 'skills/on/non-opus.md', 'CHANGELOG.md']) {
  if (!exists(path.join(root, f))) err(f, 'required file missing');
}
const headingChecks = [
  ['skills/team/SKILL.md', '## Budget'],
  ['skills/autopilot/SKILL.md', '## Budget'],
  ['skills/learn/SKILL.md', '## Store'],
  ['skills/learn/reference.md', '## Store command'],
  ['skills/learn/reference.md', '## Manual commands'],
  ['skills/on/reference.md', '## Token rules (situational)'],
  ['skills/on/SKILL.md', '## Main-session model'],
  ['skills/on/SKILL.md', '## Token rules'],
  ...[0, 1, 2, 3, 4, 5, 6].map((n) => ['skills/on/SKILL.md', `## ${n}.`]),
];
for (const [f, h] of headingChecks) {
  if (!exists(path.join(root, f))) continue;
  if (!readText(path.join(root, f)).split(/\r?\n/).some((l) => l.startsWith(h))) err(f, `missing heading "${h}"`);
}
// Always-loaded context budget (hooks/rules.md + skills/on/SKILL.md, LF-normalized bytes).
// Raising it is a deliberate decision: state the release and reason in this comment.
// v1.12.0: measured 13146 B after the non-opus.md / situational split, plus about 1 KB headroom.
// v1.12.1 (improvement cycle 002): measured 13320 B after the ask-first and chat-commit rule edits; raised to 14500 B to restore about 1 KB headroom.
// v1.13.0: measured 13699 B after the slash-command rule in hooks/rules.md (PR #18); raised to 14700 B to keep about 1 KB headroom.
const CONTEXT_BUDGET_BYTES = 14700;
if (exists(path.join(root, 'hooks/rules.md')) && exists(path.join(root, 'skills/on/SKILL.md'))) {
  const n = lfBytes(readText(path.join(root, 'hooks/rules.md'))) + lfBytes(readText(path.join(root, 'skills/on/SKILL.md')));
  if (n > CONTEXT_BUDGET_BYTES) err('skills/on/SKILL.md', `always-loaded context ${n} B exceeds budget ${CONTEXT_BUDGET_BYTES} B (hooks/rules.md + skills/on/SKILL.md)`);
}
if (lfBytes('a\r\nb') !== 3) err('scripts/validate.mjs', 'smoke "lfBytes": expected 3');
// Caps mirror: skills/status/caps.md must match the ## Budget bullets of team and autopilot.
const capPairs = [
  ['skills/team/SKILL.md', /Max parallel lanes per wave: (\d+)[^\n]*Hard ceiling: (\d+)/, /team lanes per wave: (\d+) \(ceiling (\d+)\)/, 'team'],
  ['skills/team/SKILL.md', /Max fix rounds per lane: (\d+), raised automatically up to (\d+)/, /team fix rounds per lane: (\d+) \(ceiling (\d+)\)/, 'team'],
  ['skills/autopilot/SKILL.md', /Max batches: (\d+), raised automatically up to (\d+)/, /autopilot batches: (\d+) \(ceiling (\d+)\)/, 'autopilot'],
  ['skills/autopilot/SKILL.md', /Max fix rounds per batch: (\d+), raised automatically up to (\d+)/, /autopilot fix rounds per batch: (\d+) \(ceiling (\d+)\)/, 'autopilot'],
];
if (exists(path.join(root, 'skills/status/caps.md'))) {
  const caps = readText(path.join(root, 'skills/status/caps.md'));
  for (const [src, srcRe, capRe, name] of capPairs) {
    if (!exists(path.join(root, src))) continue;
    const s = readText(path.join(root, src)).match(srcRe);
    const c = caps.match(capRe);
    if (!s || !c || s[1] !== c[1] || s[2] !== c[2]) err('skills/status/caps.md', `caps differ from ${name} ## Budget: ${capRe.source}`);
  }
}
for (const s of ['off', 'team', 'autopilot', 'status', 'help']) {
  const f = `skills/${s}/SKILL.md`;
  if (!exists(path.join(root, f))) continue;
  const fm = frontmatter(f);
  if (fm && fm['disable-model-invocation'] !== 'true') err(f, 'frontmatter must set disable-model-invocation: true');
}
// Exact version token: "Baru di 1.13.0" must not match "Baru di 1.13.01" or "Baru di 1.13.0-rc" (a trailing sentence period is fine).
const readmeHasVersion = (text, v) => new RegExp(`Baru di ${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9A-Za-z+-]|\\.[0-9A-Za-z])`).test(text);
if (exists(path.join(root, 'README.md')) && plugin && !readmeHasVersion(readText(path.join(root, 'README.md')), String(plugin.version))) {
  err('README.md', `missing "Baru di ${plugin.version}"`);
}
// A line that is exactly "### <version>" (trailing whitespace allowed) must exist in CHANGELOG.md.
const changelogHasVersion = (text, v) => new RegExp(`^### ${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(text);
if (exists(path.join(root, 'CHANGELOG.md')) && plugin && !changelogHasVersion(readText(path.join(root, 'CHANGELOG.md')), String(plugin.version))) {
  err('CHANGELOG.md', `missing "### ${plugin.version}" entry`);
}
// pure in-memory checks of the matcher
for (const [text, v, want] of [['- Baru di 1.13.0: x', '1.13.0', true], ['Baru di 1.13.0.', '1.13.0', true], ['Baru di 1.13.01', '1.13.0', false], ['Baru di 1.13.0.1', '1.13.0', false], ['Baru di 11.13.0', '1.13.0', false], ['Baru di 1.13.0-rc.1', '1.13.0', false]]) {
  if (readmeHasVersion(text, v) !== want) err('scripts/validate.mjs', `README version matcher: "${text}" vs ${v} expected ${want}`);
}
for (const [text, v, want] of [['### 1.14.0', '1.14.0', true], ['### 1.14.0\n', '1.14.0', true], ['### 1.14.01', '1.14.0', false], ['### 1.14', '1.14.0', false], ['#### 1.14.0', '1.14.0', false]]) {
  if (changelogHasVersion(text, v) !== want) err('scripts/validate.mjs', `CHANGELOG version matcher: "${text}" vs ${v} expected ${want}`);
}

// 7b. Stop names in skills/on/modes.md must be listed in autopilot's STOP section and resume's "When to write" section
const sectionOf = (text, pred) => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('## ') && pred(l));
  if (start === -1) return { heading: '## (section not found)', body: '' };
  const next = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return { heading: lines[start], body: lines.slice(start + 1, next === -1 ? undefined : next).join('\n') };
};
const modesFile = 'skills/on/modes.md';
if (exists(path.join(root, modesFile))) {
  const modes = readText(path.join(root, modesFile));
  const stopNames = new Set();
  for (const re of [/\bstatus ([A-Z]{4,}(?: [A-Z]{4,})*)\b/g, /\b([A-Z]{4,}(?: [A-Z]{4,})*) stop\b/g, /\bis ([A-Z]{4,}(?: [A-Z]{4,})*)\b/g]) {
    for (const m of modes.matchAll(re)) {
      // PASS is a unit status, not a stop
      if (m[1] !== 'PASS') stopNames.add(m[1]);
    }
  }
  const apFile = 'skills/autopilot/SKILL.md';
  if (exists(path.join(root, apFile))) {
    const sec = sectionOf(readText(path.join(root, apFile)), (l) => l.includes('STOP'));
    for (const name of stopNames) {
      if (!new RegExp(`^- ${name}:`, 'm').test(sec.body)) err(apFile, `stop status "${name}" from ${modesFile} missing in ${sec.heading}`);
    }
  }
  const resumeFile = 'skills/resume/SKILL.md';
  if (exists(path.join(root, resumeFile))) {
    const sec = sectionOf(readText(path.join(root, resumeFile)), (l) => l.startsWith('## When to write'));
    for (const name of stopNames) {
      if (name !== 'DONE' && !new RegExp(`\\b${name}\\b`).test(sec.body)) err(resumeFile, `stop status "${name}" from ${modesFile} missing in ${sec.heading}`);
    }
  }
  // 7d. orchestrator:on budget argument: hint, pointer to modes.md Budget, and only stop names known to modes.md
  const onFile = 'skills/on/SKILL.md';
  if (exists(path.join(root, onFile))) {
    const onText = readText(path.join(root, onFile));
    if (onText.includes('budget=')) {
      const hint = /^argument-hint:\s*(.*)$/m.exec(onText)?.[1] ?? '';
      if (!hint.includes('budget=<N>k')) err(onFile, 'argument-hint must include "budget=<N>k" when the body uses budget=');
      if (!/Budget[^\n]*modes\.md|modes\.md[^\n]*Budget/.test(onText)) err(onFile, 'budget= rule must point to the Budget bullet in modes.md');
    }
    for (const m of onText.matchAll(/\bstatus ([A-Z]{4,}(?: [A-Z]{4,})*)\b/g)) {
      if (m[1] !== 'PASS' && !stopNames.has(m[1])) err(onFile, `stop status "${m[1]}" is not defined in ${modesFile}`);
    }
  }
}

// 7c. "Baru di" lines in README.md and CHANGELOG.md must be in strictly ascending version order (numeric: 1.10 > 1.9); "Juga di" lines are ignored
for (const rel of ['README.md', 'CHANGELOG.md']) {
  if (!exists(path.join(root, rel))) continue;
  let prev = null;
  readText(path.join(root, rel)).split(/\r?\n/).forEach((line, i) => {
    const m = /^- Baru di (\d+(?:\.\d+){1,2})\b/.exec(line);
    if (!m) return;
    const cur = [...m[1].split('.').map(Number), 0].slice(0, 3);
    if (prev && (cur[0] - prev.n[0] || cur[1] - prev.n[1] || cur[2] - prev.n[2]) <= 0) {
      err(rel, `"Baru di ${m[1]}" must come after "Baru di ${prev.v}" (ascending order)`, i + 1);
    }
    prev = { v: m[1], n: cur };
  });
}

Object.assign(ctx, { plugin, market, version, skillDirs, agentFiles, hooksJson });
}
