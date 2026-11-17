#!/usr/bin/env node
// Validates the orchestrator plugin layout, manifests, skills, agents, hooks and cross-references.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] ?? path.join(scriptDir, '..'));
const errors = [];
const err = (file, msg, line) => errors.push(`ERROR ${file}${line ? `:${line}` : ''}: ${msg}`);
const exists = (p) => fs.existsSync(p);
const readText = (p) => fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
const MODELS = new Set(['haiku', 'sonnet', 'opus', 'inherit']);

function readJson(file) {
  try {
    return JSON.parse(readText(path.join(root, file)));
  } catch (e) {
    err(file, `cannot read or parse JSON (${e.message})`);
    return null;
  }
}

// Parses the frontmatter block into a key/value map; reports unquoted values containing ': '.
function frontmatter(file) {
  const lines = readText(path.join(root, file)).split(/\r?\n/);
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (end === -1) {
    err(file, 'missing frontmatter');
    return null;
  }
  const fm = {};
  let key = null;
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    // Continuation line (indented or "- item"): belongs to the previous key; a bare key then counts as non-empty.
    if (/^(\s|- )/.test(line)) {
      if (key !== null && !fm[key]) fm[key] = '(block)';
      continue;
    }
    const m = /:(\s|$)/.exec(line);
    if (!m) {
      key = null;
      continue;
    }
    key = line.slice(0, m.index).trim();
    const raw = line.slice(m.index + 1).trim();
    const quoted = raw.length >= 2 && ((raw[0] === '"' && raw.at(-1) === '"') || (raw[0] === "'" && raw.at(-1) === "'"));
    if (!quoted && /:(\s|$)/.test(raw.replace(/\s+#.*$/, ''))) err(file, "unquoted value contains ': ' (invalid YAML)", i + 1);
    fm[key] = quoted ? raw.slice(1, -1) : raw;
  }
  return fm;
}

const listDirs = (rel) => {
  const dir = path.join(root, rel);
  return exists(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
};
const listMd = (rel) => {
  const dir = path.join(root, rel);
  return exists(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
};

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

// 4b. Syntax check for hook and script modules
for (const dir of ['hooks', 'scripts']) {
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
for (const f of ['skills/on/modes.md', 'skills/on/reference.md', 'skills/learn/legacy.md', 'skills/status/caps.md', 'skills/learn/reference.md', 'skills/on/non-opus.md']) {
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
const lfBytes = (t) => Buffer.byteLength(t.replace(/\r\n/g, '\n'));
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
for (const s of ['off', 'team', 'autopilot', 'status']) {
  const f = `skills/${s}/SKILL.md`;
  if (!exists(path.join(root, f))) continue;
  const fm = frontmatter(f);
  if (fm && fm['disable-model-invocation'] !== 'true') err(f, 'frontmatter must set disable-model-invocation: true');
}
if (exists(path.join(root, 'README.md')) && plugin && !readText(path.join(root, 'README.md')).includes(`Baru di ${plugin.version}`)) {
  err('README.md', `missing "Baru di ${plugin.version}"`);
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

// 7c. README "Baru di" lines must be in strictly ascending version order (numeric: 1.10 > 1.9); "Juga di" lines are ignored
if (exists(path.join(root, 'README.md'))) {
  let prev = null;
  readText(path.join(root, 'README.md')).split(/\r?\n/).forEach((line, i) => {
    const m = /^- Baru di (\d+(?:\.\d+){1,2})\b/.exec(line);
    if (!m) return;
    const cur = [...m[1].split('.').map(Number), 0].slice(0, 3);
    if (prev && (cur[0] - prev.n[0] || cur[1] - prev.n[1] || cur[2] - prev.n[2]) <= 0) {
      err('README.md', `"Baru di ${m[1]}" must come after "Baru di ${prev.v}" (ascending order)`, i + 1);
    }
    prev = { v: m[1], n: cur };
  });
}

// 8. Hook smoke tests
function runHook(name, payload, extraEnv = {}) {
  const hookPath = path.join(root, 'hooks', name);
  if (!exists(hookPath)) {
    err(`hooks/${name}`, 'missing, cannot smoke test');
    return null;
  }
  return spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: root,
    env: { ...process.env, ORCH_GUARD: '', ORCH_NO_TRIM: '', CLAUDE_PROJECT_DIR: root, ORCH_STATE_DIR: os.tmpdir(), ...extraEnv },
  });
}
// Shared trim-output payload: 150 lines, one 50-char error line at index 69.
const BIG_STDOUT = Array.from({ length: 150 }, (_, i) => (i === 69 ? 'Error: boom'.padEnd(50, '.') : 'x'.repeat(50))).join('\n');
const trimPayload = (command) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'Bash',
  tool_input: { command },
  tool_response: { stdout: BIG_STDOUT, stderr: '', interrupted: false },
  cwd: root,
});

// Shared session-info runner. raw: spawn with only the given env added (no runHook defaults).
function sessionInfo(cwd, env = {}, raw = false) {
  const payload = { hook_event_name: 'SessionStart', source: 'startup', cwd };
  if (!raw) return runHook('session-info.mjs', payload, env);
  return spawnSync(process.execPath, [path.join(root, 'hooks', 'session-info.mjs')], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: root,
    env: { ...process.env, ...env },
  });
}
{
  let r = runHook('trim-output.mjs', trimPayload('npm test'));
  if (r) {
    let out = null;
    try {
      out = JSON.parse(r.stdout).hookSpecificOutput.updatedToolOutput.stdout;
    } catch {
      err('hooks/trim-output.mjs', `smoke "trim npm test": stdout is not the expected JSON (${(r.stdout ?? '').slice(0, 80)})`);
    }
    if (out !== null && !(out.includes('[orchestrator: trimmed') && out.includes('Error: boom'))) {
      err('hooks/trim-output.mjs', 'smoke "trim npm test": output not trimmed or lost the error line');
    }
  }
  r = runHook('trim-output.mjs', trimPayload('git diff'));
  if (r && r.stdout.trim() !== '') err('hooks/trim-output.mjs', 'smoke "git diff untouched": expected empty stdout');
  {
    // read/list commands: 300-line limit; 150 lines over 4000 chars must pass untouched
    const trimmedOut = (command, lineCount = 150) => {
      const body = Array.from({ length: lineCount }, () => 'x'.repeat(50)).join('\n');
      const res = runHook('trim-output.mjs', { ...trimPayload(command), tool_response: { stdout: body, stderr: '', interrupted: false } });
      if (!res || res.stdout.trim() === '') return '';
      return JSON.parse(res.stdout).hookSpecificOutput.updatedToolOutput.stdout;
    };
    if (trimmedOut('git ls-files') !== '') err('hooks/trim-output.mjs', 'smoke "trim read git ls-files": expected untrimmed (empty stdout) at 150 lines');
    if (trimmedOut('cd x && ls -R') !== '') err('hooks/trim-output.mjs', 'smoke "trim read cd && ls": expected untrimmed (empty stdout) at 150 lines');
    if (!trimmedOut('npm test | tail -n 200').includes('[orchestrator: trimmed')) err('hooks/trim-output.mjs', 'smoke "trim read pipe tail": expected trimmed after pipe');
    if (!trimmedOut('git ls-files', 350).includes('[orchestrator: trimmed')) err('hooks/trim-output.mjs', 'smoke "trim read 350 lines": expected trimmed above 300 lines');
  }

  const guard = (file, extra = {}) =>
    runHook('guard-edit.mjs', {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: file },
      transcript_path: path.join(root, 'no-such-transcript.jsonl'),
      cwd: root,
      ...extra,
    });
  const guardCases = [
    ['guard agents/x.md main thread denied', path.join(root, 'agents', 'x.md'), {}, true],
    ['guard agents/x.md subagent allowed', path.join(root, 'agents', 'x.md'), { agent_id: 'a1' }, false],
    ['guard docs/prd allowed', path.join(root, 'docs', 'prd', 'x.md'), {}, false],
    ['guard worktree docs/prd allowed', path.join(root, '.claude', 'worktrees', 'w1', 'docs', 'prd', 'x.md'), {}, false],
  ];
  const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-guard-'));
  try {
    const writeT = (name, lines) => {
      const p = path.join(tdir, name);
      fs.writeFileSync(p, lines.map((e) => JSON.stringify(e)).join('\n') + '\n');
      return p;
    };
    const offEntry = { type: 'user', message: { content: '<command-message>orchestrator:off</command-message>\n<command-name>/orchestrator:off</command-name>' } };
    const onSkill = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'orchestrator:on' } }] } };
    const reminderOff = { type: 'user', message: { content: [{ type: 'text', text: '<system-reminder>x</system-reminder><command-message>orchestrator:off</command-message><command-name>/orchestrator:off</command-name>' }] } };
    const plainMention = { type: 'user', message: { content: 'please run /orchestrator:off later' } };
    const tCases = [
      ['guard transcript off allowed', writeT('off.jsonl', [offEntry]), false],
      ['guard transcript off then on via Skill denied', writeT('off-on.jsonl', [offEntry, onSkill]), true],
      ['guard transcript reminder-prefixed off allowed', writeT('reminder-off.jsonl', [reminderOff]), false],
      ['guard transcript plain mention denied', writeT('mention.jsonl', [plainMention]), true],
    ];
    for (const [name, tp, deny] of tCases) {
      const g = guard(path.join(root, 'agents', 'x.md'), { transcript_path: tp });
      if (!g) continue;
      const denied = g.stdout.includes('"permissionDecision":"deny"');
      if (deny && !denied) err('hooks/guard-edit.mjs', `smoke "${name}": expected deny`);
      if (!deny && g.stdout.trim() !== '') err('hooks/guard-edit.mjs', `smoke "${name}": expected empty stdout`);
    }
  } finally {
    fs.rmSync(tdir, { recursive: true, force: true });
  }
  for (const [name, file, extra, deny] of guardCases) {
    const g = guard(file, extra);
    if (!g) continue;
    const denied = g.stdout.includes('"permissionDecision":"deny"');
    if (deny && !denied) err('hooks/guard-edit.mjs', `smoke "${name}": expected deny`);
    if (!deny && g.stdout.trim() !== '') err('hooks/guard-edit.mjs', `smoke "${name}": expected empty stdout`);
  }
  {
    const g = guard(path.join(root, 'agents', 'x.md'));
    if (g && !g.stdout.includes('docs/prd/ is writable')) {
      err('hooks/guard-edit.mjs', 'smoke "guard agents/x.md main thread denied": expected "docs/prd/ is writable" in deny reason');
    }
  }

  r = sessionInfo(root);
  if (r && (r.status !== 0 || !r.stdout.includes('Orchestrator store:'))) {
    err('hooks/session-info.mjs', `smoke "session-info": exit ${r.status}, expected "Orchestrator store:" in stdout`);
  }
  if (r && !r.stdout.includes('Guards: active')) err('hooks/session-info.mjs', 'smoke "session-info": expected "Guards: active" in stdout');
  r = sessionInfo(root, { ORCH_GUARD: 'off' });
  if (r && !r.stdout.includes('Guards: off (ORCH_GUARD=off)')) err('hooks/session-info.mjs', 'smoke "session-info ORCH_GUARD=off": expected "Guards: off (ORCH_GUARD=off)" in stdout');

  // session-info stale checkpoints (fake HOME and cwd in temp dirs)
  const sh = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-st-'));
  const scwd = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-cwd-'));
  try {
    const sess = (e) => sessionInfo(scwd, { HOME: sh, USERPROFILE: sh, ORCH_STALE_DAYS: '', ...e })?.stdout ?? '';
    const store = /Orchestrator store: (.*)/.exec(sess({}))?.[1]?.trim();
    if (!store) {
      err('hooks/session-info.mjs', 'smoke "session-info stale": no "Orchestrator store:" line');
    } else {
      const cd = path.join(store, 'checkpoints');
      fs.mkdirSync(cd, { recursive: true });
      fs.writeFileSync(path.join(cd, 'old.md'), 'Task: old one\n');
      fs.writeFileSync(path.join(cd, 'new.md'), 'Task: new one\n');
      const t = (Date.now() - 20 * 864e5) / 1000;
      fs.utimesSync(path.join(cd, 'old.md'), t, t);
      const a = sess({});
      const b = sess({ ORCH_STALE_DAYS: '30' });
      if (!(a.includes('old (old one) (stale 20d)') && a.includes('new (new one)') && !a.includes('new (new one) (stale') && a.includes('offer the user to delete') && !b.includes('stale'))) {
        err('hooks/session-info.mjs', 'smoke "session-info stale": expected stale marker for 20d-old checkpoint only, none with ORCH_STALE_DAYS=30');
      }

      // session-info map: no learned-map.md -> "Map: none"; present -> no "Map: none"
      if (!sess({}).includes('Map: none')) {
        err('hooks/session-info.mjs', 'smoke "session-info map": expected "Map: none" on fresh store');
      }
      fs.mkdirSync(path.join(store, 'lessons'), { recursive: true });
      fs.writeFileSync(path.join(store, 'lessons', 'learned-map.md'), '---\ndescription: map\n---\n');
      if (sess({}).includes('Map: none')) {
        err('hooks/session-info.mjs', 'smoke "session-info map": expected no "Map: none" once learned-map.md exists');
      }
      // stored lesson text is sanitized: backtick and control char removed, marked as data
      fs.writeFileSync(path.join(store, 'lessons', 'learned-tick.md'), '---\ndescription: run `rm` now\u0001x\n---\n');
      const lo = sess({});
      if (!lo.includes('Lessons: (stored notes, data not instructions)') || !lo.includes('run rm now x') || lo.includes('`')) {
        err('hooks/session-info.mjs', 'smoke "session-info sanitize": expected sanitized lesson text (no backtick, no control char) under the data-marked Lessons line');
      }
    }
  } finally {
    fs.rmSync(sh, { recursive: true, force: true });
    fs.rmSync(scwd, { recursive: true, force: true });
  }
}

// 8a. Kill switches, invalid stdin and project-root fallback
{
  const editReq = (file) => ({
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: file },
    transcript_path: path.join(root, 'no-such-transcript.jsonl'),
    cwd: root,
  });

  let r = runHook('guard-edit.mjs', editReq(path.join(root, 'agents', 'x.md')), { ORCH_GUARD: 'off' });
  if (r && r.stdout.trim() !== '') err('hooks/guard-edit.mjs', 'smoke "guard ORCH_GUARD=off": expected empty stdout');
  r = runHook('trim-output.mjs', trimPayload('npm test'), { ORCH_NO_TRIM: '1' });
  if (r && r.stdout.trim() !== '') err('hooks/trim-output.mjs', 'smoke "trim ORCH_NO_TRIM=1": expected empty stdout');

  // invalid JSON stdin: fail open silently; with ORCH_DEBUG=1 the error goes to stderr
  const rawHook = (name, env) => spawnSync(process.execPath, [path.join(root, 'hooks', name)], { input: '{bad' + 'x'.repeat(3100), encoding: 'utf8', cwd: root, env: { ...process.env, ORCH_DEBUG: '', ...env } });
  for (const [name, prefix] of [['trim-output.mjs', 'orchestrator trim-output:'], ['guard-edit.mjs', 'orchestrator guard-edit:']]) {
    const quiet = rawHook(name, {});
    if (quiet.status !== 0 || quiet.stdout.trim() !== '' || quiet.stderr.trim() !== '') {
      err(`hooks/${name}`, `smoke "invalid stdin": expected exit 0 with empty stdout and stderr (exit ${quiet.status})`);
    }
    const loud = rawHook(name, { ORCH_DEBUG: '1' });
    if (!(loud.stderr ?? '').startsWith(prefix)) err(`hooks/${name}`, `smoke "invalid stdin ORCH_DEBUG=1": expected stderr starting with "${prefix}"`);
  }

  // project-root fallback: no CLAUDE_PROJECT_DIR, so the git top level of cwd is the project root
  if (spawnSync('git', ['--version']).status === 0) {
    const gtmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'orch-root-')));
    try {
      spawnSync('git', ['init', '-q'], { cwd: gtmp });
      const tp = path.join(gtmp, 'transcript.jsonl');
      fs.writeFileSync(tp, JSON.stringify({ type: 'user', message: { content: 'hello' } }) + '\n');
      const payload = { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(gtmp, 'a.txt') }, transcript_path: tp, cwd: gtmp };
      const g = spawnSync(process.execPath, [path.join(root, 'hooks', 'guard-edit.mjs')], {
        input: JSON.stringify(payload),
        encoding: 'utf8',
        cwd: gtmp,
        env: { ...process.env, ORCH_GUARD: '', CLAUDE_PROJECT_DIR: '' },
      });
      if (!(g.stdout ?? '').includes('"deny"')) err('hooks/guard-edit.mjs', 'smoke "guard root fallback": expected deny for a project file without CLAUDE_PROJECT_DIR');
    } finally {
      fs.rmSync(gtmp, { recursive: true, force: true });
    }
  }
}

// 8a2. Large-input windows: trim cut, guard transcript window fallback, long-session head/tail reads
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-large-'));
  const sid = `large-${process.pid}-${Date.now()}`;
  try {
    // trim-output: line trimming keeps ~33 lines, so 1000-char lines keep more than 30000 chars and hit the cut marker
    const bigLines = Array.from({ length: 200 }, (_, i) => (i === 199 ? 'LAST-LINE-MARK'.padEnd(1000, '.') : 'x'.repeat(1000)));
    const r = runHook('trim-output.mjs', {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      tool_response: { stdout: bigLines.join('\n'), stderr: '', interrupted: false },
      cwd: root,
    });
    if (r) {
      let out = null;
      try {
        out = JSON.parse(r.stdout).hookSpecificOutput.updatedToolOutput.stdout;
      } catch {
        err('hooks/trim-output.mjs', 'smoke "trim large": stdout is not the expected JSON');
      }
      if (out !== null && !(out.includes('[orchestrator: cut ') && out.includes('LAST-LINE-MARK'))) {
        err('hooks/trim-output.mjs', 'smoke "trim large": expected cut marker and LAST-LINE-MARK in output');
      }
    }

    // guard-edit: transcript over 512 KB whose off command is outside the window; full-file fallback must still see off
    const offLine = JSON.stringify({ type: 'user', message: { content: '<command-message>orchestrator:off</command-message>\n<command-name>/orchestrator:off</command-name>' } });
    const filler = JSON.stringify({ type: 'user', message: { content: 'f'.repeat(1000) } });
    const bigTranscript = path.join(tmp, 'big-off.jsonl');
    fs.writeFileSync(bigTranscript, offLine + '\n' + Array.from({ length: 700 }, () => filler + '\n').join(''));
    const g = runHook('guard-edit.mjs', {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: path.join(root, 'agents', 'x.md') },
      transcript_path: bigTranscript,
      cwd: root,
    });
    if (g && g.stdout.trim() !== '') err('hooks/guard-edit.mjs', 'smoke "guard large transcript off": expected empty stdout');

    // long-session: over 1 MB, usage at head and tail only, filler in the middle forces head/tail windows
    const usage = (cacheRead) => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 10, cache_read_input_tokens: cacheRead } } });
    const longPath = path.join(tmp, 'long-large.jsonl');
    fs.writeFileSync(longPath, usage(1000) + '\n' + 'y'.repeat(2.5 * 1024 * 1024) + '\n' + usage(131000) + '\n');
    const rl = runHook('long-session.mjs', { hook_event_name: 'UserPromptSubmit', session_id: sid, transcript_path: longPath, cwd: root }, { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '999999999', ORCH_LONG_TOKENS: '', ORCH_LONG_REPEAT: '' });
    if (rl && (!rl.stdout.includes('systemMessage') || !rl.stdout.includes('+130k'))) err('hooks/long-session.mjs', 'smoke "long large head/tail": expected systemMessage with "+130k" in stdout');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const f of fs.readdirSync(os.tmpdir())) {
      if (f.startsWith(`orchestrator-long-${sid}`)) fs.rmSync(path.join(os.tmpdir(), f), { force: true });
    }
  }
}

// 8a3. Store key: session-info.mjs and the bash/PowerShell lines in learn/reference.md must derive the same key
{
  const refPath = 'skills/learn/reference.md';
  const refText = exists(path.join(root, refPath)) ? readText(path.join(root, refPath)) : null;
  if (refText === null) {
    err(refPath, 'missing, cannot check store key');
  } else {
    for (const pattern of ['tr A-Z a-z', "sed 's/[^a-z0-9][^a-z0-9]*/-/g'", 'tail -c 80', 'ToLower()', "-replace '[^a-z0-9]+','-'", 'Substring($k.Length - 80)']) {
      if (!refText.includes(pattern)) err(refPath, `store key pattern missing: ${pattern}`);
    }
  }
  const siPath = 'hooks/session-info.mjs';
  if (exists(path.join(root, siPath))) {
    if (!readText(path.join(root, siPath)).includes(".toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(-80)")) {
      err(siPath, 'store key pattern missing: .toLowerCase().replace(/[^a-z0-9]+/g, \'-\').slice(-80)');
    }
  } else {
    err(siPath, 'missing, cannot check store key');
  }

  // run the bash store command and session-info.mjs in the same fresh non-git dir; both must print the same path
  if (refText !== null && process.platform !== 'win32' && spawnSync('bash', ['--version']).status === 0) {
    const sdir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'orch-key-cwd-')));
    const shome = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'orch-key-home-')));
    try {
      const fence = refText.indexOf('```bash', refText.indexOf('## Store command'));
      const bodyStart = refText.indexOf('\n', fence) + 1;
      const bodyEnd = refText.indexOf('```', bodyStart);
      const cmd = refText.slice(bodyStart, bodyEnd).split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
      const env = { ...process.env, HOME: shome, USERPROFILE: shome };
      const b = spawnSync('bash', ['-c', cmd], { encoding: 'utf8', cwd: sdir, env });
      const hook = sessionInfo(sdir, { HOME: shome, USERPROFILE: shome, ORCH_STALE_DAYS: '' }, true);
      const store = /Orchestrator store: (.*)/.exec(hook.stdout ?? '')?.[1]?.trim();
      const bashOut = (b.stdout ?? '').trim();
      if (!bashOut || !store || bashOut !== store) {
        err('skills/learn/reference.md', `store key smoke: bash "${bashOut}" vs session-info "${store ?? ''}"`);
      }
    } finally {
      fs.rmSync(sdir, { recursive: true, force: true });
      fs.rmSync(shome, { recursive: true, force: true });
    }
  }
}

// 8b. Script smoke tests: digest.mjs and long-session.mjs
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-validate-'));
  const sidA = `validate-${process.pid}-${Date.now()}`;
  const sidB = `${sidA}-b`;
  const sidC = `${sidA}-c`;
  const sidD = `${sidA}-d`;
  const sidE = `${sidA}-e`;
  const markers = [sidA, sidB, sidC, sidD, sidE, `${sidA}-f`].flatMap((s) => [path.join(os.tmpdir(), `orchestrator-long-${s}`), path.join(os.tmpdir(), `orchestrator-long-${s}.count`)]);
  markers.push(...['g', 'h', 'i', 'j', 'k'].flatMap((s) => [path.join(os.tmpdir(), `orchestrator-long-${sidA}-${s}`), path.join(os.tmpdir(), `orchestrator-long-${sidA}-${s}.count`)]));
  try {
    const digestPath = path.join(root, 'scripts', 'digest.mjs');
    if (!exists(digestPath)) {
      err('scripts/digest.mjs', 'missing, cannot smoke test');
    } else {
      const transcript = path.join(tmp, 'digest.jsonl');
      const lines = [
        { type: 'user', message: { content: [{ type: 'text', text: '<system-reminder>reminder-x</system-reminder>hello' }] } },
        { type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'world' }, { type: 'tool_use', id: 't1', name: 'Bash', input: {} }] } },
        { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
        { type: 'assistant', isSidechain: true, message: { id: 'm2', content: [{ type: 'text', text: 'secret' }] } },
        { type: 'user', isMeta: true, message: { content: 'meta' } },
        { type: 'user', message: { content: '<command-message>x</command-message><command-name>/orchestrator:on</command-name><command-args>do X</command-args>' } },
        { type: 'user', message: { content: 'talk about <command-name> tags' } },
        { type: 'user', message: { content: '<system-reminder><command-name>/x</command-name></system-reminder>real question' } },
      ];
      fs.writeFileSync(transcript, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
      const d = spawnSync(process.execPath, [digestPath, transcript], { encoding: 'utf8', cwd: root });
      if (d.status !== 0) err('scripts/digest.mjs', `smoke "digest": exit ${d.status}, stderr: ${(d.stderr ?? '').split('\n')[0]}`);
      const out = d.stdout ?? '';
      for (const want of ['U: hello', 'A: world', 'U: /orchestrator:on do X', 'U: talk about <command-name> tags', 'U: real question']) {
        if (!out.includes(want)) err('scripts/digest.mjs', `smoke "digest": expected "${want}" in stdout`);
      }
      for (const bad of ['system-reminder', 'secret', 'meta', 'U: /x']) {
        if (out.includes(bad)) err('scripts/digest.mjs', `smoke "digest": stdout must not contain "${bad}"`);
      }
    }

    const longTranscript = path.join(tmp, 'long.jsonl');
    fs.writeFileSync(longTranscript, 'x'.repeat(10));
    const longPayload = (sid) => ({ hook_event_name: 'UserPromptSubmit', session_id: sid, transcript_path: longTranscript, cwd: root });
    let r1 = runHook('long-session.mjs', longPayload(sidA), { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '' });
    if (r1 && r1.stdout.trim() !== '') err('hooks/long-session.mjs', 'smoke "long 10 bytes": expected empty stdout');
    let r2 = runHook('long-session.mjs', longPayload(sidB), { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '5' });
    if (r2 && !r2.stdout.includes('systemMessage')) err('hooks/long-session.mjs', 'smoke "long limit 5": expected systemMessage in stdout');
    let r3 = runHook('long-session.mjs', longPayload(sidB), { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '5' });
    if (r3 && r3.stdout.trim() !== '') err('hooks/long-session.mjs', 'smoke "long repeat": expected empty stdout (marker exists)');
    const delegTranscript = path.join(tmp, 'deleg.jsonl');
    const delegLines = [
      { type: 'user', message: { content: 'x'.repeat(300 * 1024) } },
      { type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'x', prompt: 'p' } }] } },
      { type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'x', prompt: 'p' } }] } },
    ];
    fs.writeFileSync(delegTranscript, delegLines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    const r6 = runHook('long-session.mjs', { hook_event_name: 'UserPromptSubmit', session_id: sidE, transcript_path: delegTranscript, cwd: root }, { ORCH_LONG: '', ORCH_LONG_TOKENS: '', ORCH_LONG_BYTES: '999999999', ORCH_LONG_DELEGATIONS: '2' });
    if (r6 && !r6.stdout.includes('2 delegations')) err('hooks/long-session.mjs', 'smoke "long delegations": expected "2 delegations" in stdout');
    const sidF = `${sidA}-f`;
    const sidFCount = path.join(os.tmpdir(), `orchestrator-long-${sidF}.count`);
    const incTranscript = path.join(tmp, 'inc.jsonl');
    const incLine = JSON.stringify({ type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'x', prompt: 'p' } }] } }) + '\n';
    fs.writeFileSync(incTranscript, incLine);
    const incPayload = { hook_event_name: 'UserPromptSubmit', session_id: sidF, transcript_path: incTranscript, cwd: root };
    const incEnv = { ORCH_LONG: '', ORCH_LONG_TOKENS: '', ORCH_LONG_BYTES: '999999999', ORCH_LONG_DELEGATIONS: '2' };
    const r7 = runHook('long-session.mjs', incPayload, incEnv);
    if (r7 && r7.stdout.trim() !== '') err('hooks/long-session.mjs', 'smoke "long incremental 1": expected empty stdout');
    if (!fs.existsSync(sidFCount)) err('hooks/long-session.mjs', 'smoke "long incremental 1": expected .count file');
    fs.appendFileSync(incTranscript, incLine);
    const r8 = runHook('long-session.mjs', incPayload, incEnv);
    if (r8 && !r8.stdout.includes('2 delegations')) err('hooks/long-session.mjs', 'smoke "long incremental 2": expected "2 delegations" in stdout');
    if (fs.existsSync(sidFCount)) err('hooks/long-session.mjs', 'smoke "long incremental 2": expected .count file removed');

    // IC-020: with ORCH_STATE_DIR empty, markers go to the private per-user dir (0700 on non-Windows)
    const sidS = `${sidA}-s`;
    const stateTag = String(process.getuid?.() ?? os.userInfo().username).replace(/[^A-Za-z0-9_-]/g, '');
    const stateMarker = path.join(os.tmpdir(), `orchestrator-${stateTag}`, `orchestrator-long-${sidS}`);
    const rs = runHook('long-session.mjs', longPayload(sidS), { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '5', ORCH_STATE_DIR: '' });
    if (rs && !rs.stdout.includes('systemMessage')) err('hooks/long-session.mjs', 'smoke "long state dir": expected systemMessage in stdout');
    if (!fs.existsSync(stateMarker)) err('hooks/long-session.mjs', 'smoke "long state dir": expected marker in per-user state dir');
    if (process.platform !== 'win32' && fs.existsSync(stateMarker) && (fs.statSync(path.dirname(stateMarker)).mode & 0o777) !== 0o700) err('hooks/long-session.mjs', 'smoke "long state dir": expected state dir mode 0700');
    fs.rmSync(stateMarker, { force: true });
    fs.rmSync(`${stateMarker}.count`, { force: true });

    const usageTranscript = (cacheRead2) => {
      const usageLines = [
        { type: 'assistant', message: { usage: { input_tokens: 10, cache_read_input_tokens: 1000 } } },
        { type: 'assistant', message: { usage: { input_tokens: 10, cache_read_input_tokens: cacheRead2 } } },
      ];
      return usageLines.map((l) => JSON.stringify(l)).join('\n') + '\n';
    };
    const growthPath = path.join(tmp, 'growth.jsonl');
    fs.writeFileSync(growthPath, usageTranscript(131000));
    const r4 = runHook('long-session.mjs', { hook_event_name: 'UserPromptSubmit', session_id: sidC, transcript_path: growthPath, cwd: root }, { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '999999999', ORCH_LONG_TOKENS: '' });
    if (r4 && (!r4.stdout.includes('systemMessage') || !r4.stdout.includes('+130k'))) err('hooks/long-session.mjs', 'smoke "long usage growth": expected systemMessage with "+130k" in stdout');
    const flatPath = path.join(tmp, 'flat.jsonl');
    fs.writeFileSync(flatPath, usageTranscript(11000));
    const r5 = runHook('long-session.mjs', { hook_event_name: 'UserPromptSubmit', session_id: sidD, transcript_path: flatPath, cwd: root }, { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '5', ORCH_LONG_TOKENS: '' });
    if (r5 && r5.stdout.trim() !== '') err('hooks/long-session.mjs', 'smoke "long usage flat": expected empty stdout (usage present overrides bytes)');

    // long repeat smoke: [suffix, ORCH_LONG_REPEAT, write marker first, [growth, expect ('' = empty stdout), noReminder]]
    const repeatSteps = [
      ['g', '', false, [[130000, '+130k', true], [130000, '', false], [260000, 'reminder 1 of 2', false], [260000, '', false], [400000, 'reminder 2 of 2', false], [900000, '', false]]],
      ['h', 'off', false, [[260000, '+260k', true], [500000, '', false]]],
      ['i', '', true, [[130000, '', false], [260000, 'reminder 1 of 2', false]]],
      ['j', '', false, [[450000, '+450k', true], [460000, '', false]]],
      ['k', '200000,abc,50000', false, [[130000, '+130k', false], [210000, 'reminder 1 of 1', false], [999000, '', false]]],
    ];
    const repeatPath = path.join(tmp, 'repeat.jsonl');
    for (const [sfx, rep, pre, steps] of repeatSteps) {
      if (pre) fs.writeFileSync(path.join(os.tmpdir(), `orchestrator-long-${sidA}-${sfx}`), '');
      steps.forEach(([growth, want, noReminder], idx) => {
        const n = idx + 1;
        fs.writeFileSync(repeatPath, usageTranscript(growth + 1000));
        const rr = runHook('long-session.mjs', { hook_event_name: 'UserPromptSubmit', session_id: `${sidA}-${sfx}`, transcript_path: repeatPath, cwd: root }, { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '999999999', ORCH_LONG_TOKENS: '', ORCH_LONG_REPEAT: rep });
        if (!rr) return;
        const o = rr.stdout ?? '';
        const okWant = want === '' ? o.trim() === '' : o.includes(want);
        const okRem = !noReminder || !o.includes('reminder');
        if (!okWant || !okRem) err('hooks/long-session.mjs', `smoke "long repeat ${sfx} step ${n}": expected ${want === '' ? 'empty stdout' : `"${want}"`}${noReminder ? ' without "reminder"' : ''}`);
      });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const m of markers) fs.rmSync(m, { force: true });
  }
}

// 8c. Smoke tests: scripts/budget.mjs and hooks/guard-review.mjs
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-budget-'));
  try {
    const budgetPath = path.join(root, 'scripts', 'budget.mjs');
    if (!exists(budgetPath)) {
      err('scripts/budget.mjs', 'missing, cannot smoke test');
    } else {
      const J = JSON.stringify;
      const launch = (id, name) => J({ type: 'assistant', message: { id: 'm' + id, content: [{ type: 'tool_use', id, name: name || 'Agent', input: { subagent_type: 'orchestrator:haiku-coder', prompt: 'p' } }] } });
      const result = (id, tur) => J({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'r' }] }, toolUseResult: tur });
      const block = (a, n) => '<task-notification>\n<task-id>' + a + '</task-id>\n<status>completed</status>\n<usage><subagent_tokens>' + n + '</subagent_tokens><tool_uses>3</tool_uses></usage>\n</task-notification>';
      const qop = (a, n) => J({ type: 'queue-operation', operation: 'enqueue', content: block(a, n) });
      const unote = (a, n) => J({ type: 'user', message: { content: block(a, n) } });
      const A = [launch('tu1'), result('tu1', { status: 'async_launched', agentId: 'ag1' }), qop('ag1', 12000), unote('ag1', 12000), launch('tu2', 'Task'), result('tu2', { status: 'completed', agentId: 'ag2', totalTokens: 30500 }), J({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'tool_use', id: 'tu9', name: 'Agent', input: {} }] } }), unote('agX', 99999), unote('ag1', 15000)];
      const U = [launch('tu3'), result('tu3', { status: 'async_launched', agentId: 'ag3' })];
      const w = (f, L) => fs.writeFileSync(path.join(tmp, f), L.length ? L.join('\n') + '\n' : '');
      w('known.jsonl', A);
      w('mixed.jsonl', A.concat(U));
      w('m.jsonl', A);
      const bud = (args) => {
        const r = spawnSync(process.execPath, [budgetPath, ...args], { encoding: 'utf8', cwd: root });
        return { out: (r.stdout ?? '').trim(), status: r.status };
      };
      const chk = (name, got, want) => {
        if (got !== want) err('scripts/budget.mjs', `smoke "${name}": expected "${want}", got "${got}"`);
      };
      const known = path.join(tmp, 'known.jsonl');
      const mixed = path.join(tmp, 'mixed.jsonl');
      const m = path.join(tmp, 'm.jsonl');
      chk('known', bud([known]).out, 'BUDGET: spent 46k (2 agents)');
      chk('mixed limit 40k', bud([mixed, '--limit', '40k']).out, 'BUDGET: spent 46k+? (3 agents, 1 without usage) of 40k: OVER');
      chk('known limit 100000k', bud([known, '--limit', '100000k']).out, 'BUDGET: spent 46k (2 agents) of 100000k: UNDER');
      chk('mixed limit 100000k', bud([mixed, '--limit', '100000k']).out, 'BUDGET: spent 46k+? (3 agents, 1 without usage) of 100000k: UNKNOWN');
      chk('mark unreadable',bud([path.join(tmp, 'none.jsonl'), '--mark']).out, 'BUDGET: mark ? (transcript unreadable)');
      chk('from invalid mark', bud([known, '--from', '?', '--limit', '10k']).out, 'BUDGET: spent ? (no valid mark) of 10k: UNKNOWN');
      const missingRes = bud([path.join(tmp, 'none.jsonl')]);
      chk('missing file', missingRes.out, 'BUDGET: spent ? (transcript unreadable)');
      chk('missing file exit', String(missingRes.status), '0');
      const size = fs.statSync(m).size;
      chk('mark', bud([m, '--mark']).out, `BUDGET: mark ${size}`);
      fs.appendFileSync(m, U.join('\n') + '\n');
      chk('from mark', bud([m, '--from', String(size)]).out, 'BUDGET: spent ? (1 agent, 1 without usage)');

      // --main: last usage per message.id, sidechain skipped, context = last message input + cache
      const am = (id, u, extra = {}) => J({ type: 'assistant', ...extra, message: { id, content: [{ type: 'text', text: 't' }], usage: u } });
      w('main.jsonl', [
        am('m1', { input_tokens: 1000, cache_read_input_tokens: 20000, cache_creation_input_tokens: 3000, output_tokens: 500 }),
        am('m1', { input_tokens: 1000, cache_read_input_tokens: 20000, cache_creation_input_tokens: 3000, output_tokens: 800 }),
        am('m2', { input_tokens: 2000, cache_read_input_tokens: 40000, cache_creation_input_tokens: 1000, output_tokens: 1200 }),
        am('m3', { input_tokens: 99999 }, { isSidechain: true }),
      ]);
      chk('main', bud([path.join(tmp, 'main.jsonl'), '--main']).out, 'MAIN: 2 calls, input 3k, cache-read 60k, cache-write 4k, output 2k, context 43k');
      chk('main known', bud([known, '--main']).out, 'MAIN: 0 calls');
      const missingMain = bud([path.join(tmp, 'none.jsonl'), '--main']);
      chk('main missing file', missingMain.out, 'MAIN: ? (transcript unreadable)');
      chk('main missing file exit', String(missingMain.status), '0');

      // auto mode: newest transcript of the project dir
      const autoCwd = fs.realpathSync(fs.mkdtempSync(path.join(tmp, 'auto-cwd-')));
      const autoCfg = path.join(tmp, 'auto-cfg');
      const autoDir = path.join(autoCfg, 'projects', autoCwd.replace(/[^A-Za-z0-9]/g, '-'));
      fs.mkdirSync(autoDir, { recursive: true });
      const one = (n) => [launch('tu1'), result('tu1', { status: 'completed', agentId: 'ag1', totalTokens: n })].join('\n') + '\n';
      fs.writeFileSync(path.join(autoDir, 'old.jsonl'), one(5000));
      fs.writeFileSync(path.join(autoDir, 'new.jsonl'), one(12000));
      fs.utimesSync(path.join(autoDir, 'old.jsonl'), new Date(Date.now() - 60000), new Date(Date.now() - 60000));
      fs.utimesSync(path.join(autoDir, 'new.jsonl'), new Date(), new Date());
      const auto = (cfg, extra = [], cwd = autoCwd) => {
        const r = spawnSync(process.execPath, [budgetPath, 'auto', ...extra], { encoding: 'utf8', cwd, env: { ...process.env, CLAUDE_CONFIG_DIR: cfg } });
        return (r.stdout ?? '').trim();
      };
      chk('auto newest', auto(autoCfg), 'BUDGET: spent 12k (1 agent)');
      const emptyCfg = path.join(tmp, 'empty-cfg');
      fs.mkdirSync(emptyCfg, { recursive: true });
      chk('auto empty', auto(emptyCfg), 'BUDGET: spent ? (transcript unreadable)');
      // a newer non-jsonl file in the project dir is ignored
      fs.writeFileSync(path.join(autoDir, 'notes.txt'), 'not a transcript\n');
      fs.utimesSync(path.join(autoDir, 'notes.txt'), new Date(Date.now() + 60000), new Date(Date.now() + 60000));
      chk('auto ignores non-jsonl', auto(autoCfg), 'BUDGET: spent 12k (1 agent)');
      // existing but empty project dir (no jsonl)
      const emptyProjCfg = path.join(tmp, 'empty-proj-cfg');
      fs.mkdirSync(path.join(emptyProjCfg, 'projects', autoCwd.replace(/[^A-Za-z0-9]/g, '-')), { recursive: true });
      chk('auto empty project dir', auto(emptyProjCfg), 'BUDGET: spent ? (transcript unreadable)');
      // --mark prints the size of the newest jsonl
      chk('auto mark', auto(autoCfg, ['--mark']), `BUDGET: mark ${fs.statSync(path.join(autoDir, 'new.jsonl')).size}`);
      // cwd in a subfolder of the keyed project folder walks up to it
      const autoSub = path.join(autoCwd, 'sub');
      fs.mkdirSync(autoSub, { recursive: true });
      chk('auto from subfolder', auto(autoCfg, [], autoSub), 'BUDGET: spent 12k (1 agent)');
    }

    // guard-review smoke
    fs.mkdirSync(path.join(tmp, 'docs', 'prd'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs', 'prd', 'exists.md'), '# x\n');
    fs.mkdirSync(path.join(tmp, 'my proj', 'docs', 'prd'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'my proj', 'docs', 'prd', 'exists.md'), '# x\n');
    const review = (agent, prompt, extraEnv = {}) =>
      runHook('guard-review.mjs', {
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        tool_input: { subagent_type: agent, prompt },
        cwd: tmp,
      }, { CLAUDE_PROJECT_DIR: tmp, ...extraEnv });
    const reviewCases = [
      ['review missing path denied', 'orchestrator:opus-reviewer', 'Review docs/prd/no-such-prd-xyz.md', {}, true],
      ['review existing path allowed', 'orchestrator:opus-reviewer', 'Review docs/prd/exists.md', {}, false],
      ['review haiku-coder missing path allowed', 'orchestrator:haiku-coder', 'Review docs/prd/no-such-prd-xyz.md', {}, false],
      ['review glob only allowed', 'orchestrator:opus-reviewer', 'Review docs/prd/*.md', {}, false],
      ['review url only allowed', 'orchestrator:opus-reviewer', 'Review https://example.com/docs/prd/x.md', {}, false],
      ['review ORCH_GUARD=off allowed', 'orchestrator:opus-reviewer', 'Review docs/prd/no-such-prd-xyz.md', { ORCH_GUARD: 'off' }, false],
      ['review absolute existing allowed', 'orchestrator:opus-reviewer', `Review ${path.join(tmp, 'docs', 'prd', 'exists.md')}`, {}, false],
      ['review absolute missing denied', 'orchestrator:opus-reviewer', `Review ${path.join(tmp, 'docs', 'prd', 'nope.md')}`, {}, true],
      ['review absolute with space existing allowed', 'orchestrator:opus-reviewer', `Review ${path.join(tmp, 'my proj', 'docs', 'prd', 'exists.md')} now`, {}, false],
      ['review quoted absolute with space existing allowed', 'orchestrator:opus-reviewer', `Review "${path.join(tmp, 'my proj', 'docs', 'prd', 'exists.md')}" now`, {}, false],
      ['review absolute with space missing denied', 'orchestrator:opus-reviewer', `Review ${path.join(tmp, 'my proj', 'docs', 'prd', 'nope.md')}`, {}, true],
    ];
    for (const [name, agent, prompt, env, deny] of reviewCases) {
      const g = review(agent, prompt, env);
      if (!g) continue;
      const denied = g.stdout.includes('"permissionDecision":"deny"');
      if (deny && !denied) err('hooks/guard-review.mjs', `smoke "${name}": expected deny`);
      if (!deny && g.stdout.trim() !== '') err('hooks/guard-review.mjs', `smoke "${name}": expected empty stdout`);
    }
    const hp = path.join(root, 'hooks', 'guard-review.mjs');
    if (exists(hp)) {
      const bad = spawnSync(process.execPath, [hp], { input: 'not json', encoding: 'utf8', cwd: root, env: { ...process.env, ORCH_GUARD: '' } });
      if (bad.status !== 0 || bad.stdout.trim() !== '') err('hooks/guard-review.mjs', 'smoke "review invalid json": expected empty stdout and exit 0');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
// 8d. Smoke tests: scripts/trace-tokens.mjs
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-trace-'));
  try {
    const tracePath = path.join(root, 'scripts', 'trace-tokens.mjs');
    if (!exists(tracePath)) {
      err('scripts/trace-tokens.mjs', 'missing, cannot smoke test');
    } else {
      const J = JSON.stringify;
      const d = tmp;
      const L = [{type:'system',subtype:'init',model:'m-main'},{type:'system',subtype:'task_started',tool_use_id:'tu1',subagent_type:'orchestrator:haiku-coder',prompt:'abc'},{type:'assistant',parent_tool_use_id:'tu1',uuid:'u1',message:{id:'s1',content:[{type:'tool_use',id:'x',name:'Bash',input:{}}],usage:{input_tokens:2,cache_creation_input_tokens:4000,cache_read_input_tokens:6000,output_tokens:5}}},{type:'assistant',parent_tool_use_id:'tu1',uuid:'u2',message:{id:'s2',content:[{type:'text',text:'sub text'}],usage:{input_tokens:2,cache_creation_input_tokens:100,cache_read_input_tokens:10000,output_tokens:5}}},{type:'system',subtype:'task_notification',tool_use_id:'tu1',usage:{total_tokens:10900,tool_uses:1}},{type:'result',num_turns:1,total_cost_usd:0.01,result:'x',modelUsage:{'m-main':{inputTokens:1,outputTokens:1,cacheReadInputTokens:1,cacheCreationInputTokens:1}}},{type:'assistant',parent_tool_use_id:null,uuid:'u3',message:{id:'m1',content:[{type:'text',text:'hello'}],usage:{input_tokens:1,output_tokens:1}}},{type:'result',num_turns:3,total_cost_usd:0.1234,result:'done!',modelUsage:{'m-main':{inputTokens:10,outputTokens:500,cacheReadInputTokens:20000,cacheCreationInputTokens:5000},'m-sub':{inputTokens:2,outputTokens:100,cacheReadInputTokens:6000,cacheCreationInputTokens:4000}}}];
      fs.writeFileSync(path.join(d, 't.jsonl'), L.slice(0, 6).map((x) => J(x)).join('\n') + '\nnot json\n' + L.slice(6).map((x) => J(x)).join('\n') + '\n');
      fs.writeFileSync(path.join(d, 'r.json'), J({ startedAt: '2026-11-05T01:02:03Z', suite: { modelOverride: 'm-main', plugins: [{ version: '9.9.9' }] }, cases: [{ name: 'c1', arms: { with: [{ passed: true, costUsd: 0.5, tracePath: path.join(d, 't.jsonl') }], without: [{ passed: false, tracePath: path.join(d, 'none.jsonl') }] } }] }));
      const trace = (file, extra = []) => {
        const r = spawnSync(process.execPath, [tracePath, file, ...extra], { encoding: 'utf8', cwd: root });
        return { out: (r.stdout ?? '').trim(), status: r.status };
      };
      const chk = (name, got, want) => {
        if (got !== want) err('scripts/trace-tokens.mjs', `smoke "${name}": expected "${want}", got "${got}"`);
      };
      chk('trace lines', trace(path.join(d, 't.jsonl')).out, [
        'TRACE: total 36k tokens, cost $0.1234, turns 3, main m-main out 500, reply 5 chars, main text 5 chars',
        'AGENT: orchestrator:haiku-coder startup 10002 cached 6000 total 10900 tools 1 brief 3',
      ].join('\n'));
      chk('md rows', trace(path.join(d, 'r.json'), ['--md']).out, [
        '| 9.9.9 | 2026-11-05 | c1 | m-main | 1 | 36k | 0.5000 | arm with; pass 1/1; agent startup 10.0-10.0k; reply 5 chars |',
        '| 9.9.9 | 2026-11-05 | c1 | m-main | 1 | ? | ? | arm without; pass 0/1; agent startup -; reply ? chars |',
      ].join('\n'));
      const missing = spawnSync(process.execPath, [tracePath, path.join(d, 'none.jsonl')], { encoding: 'utf8', cwd: root });
      chk('missing file', (missing.stdout ?? '').trim(), 'TRACE: unreadable');
      chk('missing file exit', String(missing.status), '0');
      // tracePath must end in .jsonl: a non-.jsonl file is treated as unreadable (no read, no crash)
      fs.writeFileSync(path.join(d, 'x.txt'), fs.readFileSync(path.join(d, 't.jsonl'), 'utf8'));
      fs.writeFileSync(path.join(d, 'r2.json'), J({ suite: { plugins: [{ version: '9.9.9' }] }, cases: [{ name: 'c2', arms: { with: [{ passed: true, tracePath: path.join(d, 'x.txt') }] } }] }));
      const nonJsonl = spawnSync(process.execPath, [tracePath, path.join(d, 'r2.json')], { encoding: 'utf8', cwd: root });
      chk('non-jsonl tracePath', (nonJsonl.stdout ?? '').trim(), 'RUN: c2 with #1 PASS\nTRACE: unreadable');
      chk('non-jsonl tracePath exit', String(nonJsonl.status), '0');
      const nonJsonlMd = spawnSync(process.execPath, [tracePath, path.join(d, 'r2.json'), '--md'], { encoding: 'utf8', cwd: root });
      chk('non-jsonl tracePath md', (nonJsonlMd.stdout ?? '').trim().includes('| ? | ? |'), true);
      // tracePath folder missing (results moved): the trace with the same basename next to result.json is used
      fs.copyFileSync(path.join(d, 't.jsonl'), path.join(d, 'moved-trace.jsonl'));
      fs.writeFileSync(path.join(d, 'moved.json'), J({ suite: { plugins: [{ version: '9.9.9' }] }, cases: [{ name: 'c3', arms: { with: [{ passed: true, tracePath: path.join(d, 'gone-folder', 'moved-trace.jsonl') }] } }] }));
      const moved = trace(path.join(d, 'moved.json')).out.split('\n');
      if (moved[0] !== 'RUN: c3 with #1 PASS' || !moved[1]?.startsWith('TRACE: total 36k tokens')) err('scripts/trace-tokens.mjs', `smoke "moved tracePath fallback": expected RUN line then token lines, got "${moved.slice(0, 2).join(' | ')}"`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// 8e. Smoke tests: scripts/eval-compare.mjs round trip (temp dirs only)
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-cmp-'));
  try {
    const cmpPath = path.join(root, 'scripts', 'eval-compare.mjs');
    if (!exists(cmpPath)) {
      err('scripts/eval-compare.mjs', 'missing, cannot smoke test');
    } else {
      const J = JSON.stringify;
      const tr = path.join(d, 't.jsonl');
      fs.writeFileSync(tr, [{ type: 'system', subtype: 'init', model: 'm' }, { type: 'result', num_turns: 1, total_cost_usd: 0.1, result: 'x', modelUsage: { m: { inputTokens: 1000, outputTokens: 1000, cacheReadInputTokens: 50000, cacheCreationInputTokens: 48000 } } }].map((x) => J(x)).join('\n') + '\n');
      const res = path.join(d, 'r.json');
      fs.writeFileSync(res, J({ suite: { modelOverride: 'm' }, cases: [{ name: 'c1', arms: { with: [{ passed: true, tracePath: tr }] } }] }));
      const run = (...a) => spawnSync(process.execPath, [cmpPath, ...a], { encoding: 'utf8', cwd: root });
      const b = path.join(d, 'b.json');
      const w = run(res, '--write', b);
      let n = 0;
      let base = null;
      try {
        base = JSON.parse(fs.readFileSync(b, 'utf8'));
        n = base.cases.c1.with;
      } catch {
        // reported below
      }
      if (!base || !(n > 0) || w.status !== 0) {
        err('scripts/eval-compare.mjs', `smoke "compare write": exit ${w.status}, expected a baseline with tokens > 0`);
      } else {
        const same = run(res, b);
        base.cases.c1.with = Math.round(n / 1.2);
        fs.writeFileSync(b, J(base));
        const over = run(res, b);
        const loose = run(res, b, '--threshold', '25');
        const bad = run(path.join(d, 'none.json'), b);
        if (same.status !== 0) err('scripts/eval-compare.mjs', `smoke "compare same": expected exit 0, got ${same.status}`);
        if (over.status !== 1 || !/OVER/.test(over.stdout)) err('scripts/eval-compare.mjs', `smoke "compare over": expected exit 1 with OVER, got ${over.status}`);
        if (loose.status !== 0) err('scripts/eval-compare.mjs', `smoke "compare threshold 25": expected exit 0, got ${loose.status}`);
        if (bad.status !== 2) err('scripts/eval-compare.mjs', `smoke "compare unreadable": expected exit 2, got ${bad.status}`);
        const tr2 = path.join(d, 't2.jsonl');
        fs.writeFileSync(tr2, [{ type: 'system', subtype: 'init', model: 'm' }, { type: 'result', num_turns: 1, total_cost_usd: 0.1, result: 'x', modelUsage: { m: { inputTokens: 1000, outputTokens: 1000, cacheReadInputTokens: 50000, cacheCreationInputTokens: 63000 } } }].map((x) => J(x)).join('\n') + '\n');
        const res2 = path.join(d, 'r2.json');
        fs.writeFileSync(res2, J({ suite: { modelOverride: 'm' }, cases: [{ name: 'c1', arms: { with: [{ passed: true, tracePath: tr2 }] } }] }));
        const b2 = path.join(d, 'b2.json');
        fs.writeFileSync(b2, J({ model: 'm', cases: { c1: { with: 100000 } } }));
        const edge = run(res2, b2, '--threshold', '15');
        if (edge.status !== 0) err('scripts/eval-compare.mjs', `smoke "compare base 100000 now 115000 threshold 15": expected exit 0, got ${edge.status}`);
        const res3 = path.join(d, 'r3.json');
        fs.writeFileSync(res3, J({ suite: { modelOverride: 'm' }, cases: [{ name: 'c1', arms: { with: [{ passed: true, tracePath: path.join(d, 'gone.jsonl') }] } }] }));
        const empty = run(res3, b);
        if (empty.status !== 0 || !(empty.stdout ?? '').includes('EVAL-COMPARE: EMPTY')) err('scripts/eval-compare.mjs', `smoke "compare all skipped": expected exit 0 with "EVAL-COMPARE: EMPTY", got ${empty.status}`);
        const emptyStrict = run(res3, b, '--strict');
        if (emptyStrict.status !== 2) err('scripts/eval-compare.mjs', `smoke "compare all skipped --strict": expected exit 2, got ${emptyStrict.status}`);
        // non-.jsonl tracePath (direct or basename fallback) is never read
        fs.writeFileSync(path.join(d, 'x.txt'), fs.readFileSync(tr, 'utf8'));
        const res4 = path.join(d, 'r4.json');
        fs.writeFileSync(res4, J({ suite: { modelOverride: 'm' }, cases: [{ name: 'c1', arms: { with: [{ passed: true, tracePath: path.join(d, 'x.txt') }] } }] }));
        const nonJsonl = run(res4, b);
        if (nonJsonl.status !== 0 || !(nonJsonl.stdout ?? '').includes('EVAL-COMPARE: EMPTY')) err('scripts/eval-compare.mjs', `smoke "compare non-jsonl tracePath": expected exit 0 with "EVAL-COMPARE: EMPTY", got ${nonJsonl.status}`);
        const b3 = path.join(d, 'b3.json');
        fs.writeFileSync(b3, J({ model: 'm', cases: { c1: { with: n }, c2: { with: 100 } } }));
        const missingStrict = run(res, b3, '--strict');
        if (missingStrict.status !== 1 || !/^EVAL-COMPARE: FAIL/m.test(missingStrict.stdout ?? '')) err('scripts/eval-compare.mjs', `smoke "compare missing --strict": expected exit 1 with "EVAL-COMPARE: FAIL", got ${missingStrict.status}`);
      }
    }
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

// 8f. Smoke tests: bad arguments are rejected with exit 2 and a message prefix
{
  const bad = (script, args, prefix, stream = 'stdout') => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], { encoding: 'utf8', cwd: root });
    const got = (r[stream] ?? '').split('\n')[0];
    if (r.status !== 2 || !got.startsWith(prefix)) err(`scripts/${script}`, `smoke "bad arg ${args.join(' ')}": expected exit 2 and "${prefix}", got exit ${r.status} "${got}"`);
  };
  bad('eval-compare.mjs', ['x.json', '--write'], 'EVAL-COMPARE: ERROR missing value for --write');
  bad('budget.mjs', ['x.jsonl', '--limit', '0'], 'BUDGET: ERROR invalid --limit "0"');
  bad('digest.mjs', ['x.jsonl', '--last', '0'], 'digest: invalid --last "0"', 'stderr');
  bad('trace-tokens.mjs', ['--foo'], 'TRACE: ERROR unknown option --foo');
}

// 8g. Smoke tests for untested branches: eval-compare --write skips and default baseline, budget --from alignment, trace-tokens unreadable run
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-branch-'));
  try {
    const J = JSON.stringify;
    const cmpPath = path.join(root, 'scripts', 'eval-compare.mjs');
    const budPath = path.join(root, 'scripts', 'budget.mjs');
    const tracePath = path.join(root, 'scripts', 'trace-tokens.mjs');
    const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: root });
    const tr = path.join(d, 't.jsonl');
    fs.writeFileSync(tr, [{ type: 'system', subtype: 'init', model: 'm' }, { type: 'result', num_turns: 1, total_cost_usd: 0.1, result: 'x', modelUsage: { m: { inputTokens: 1000, outputTokens: 1000, cacheReadInputTokens: 50000, cacheCreationInputTokens: 48000 } } }].map((x) => J(x)).join('\n') + '\n');

    // eval-compare --write: the unreadable arm (null pair) is skipped
    const res = path.join(d, 'r.json');
    fs.writeFileSync(res, J({ suite: { modelOverride: 'm' }, cases: [{ name: 'c1', arms: { with: [{ passed: true, tracePath: tr }], without: [{ passed: true, tracePath: path.join(d, 'gone.jsonl') }] } }] }));
    const wb = path.join(d, 'wb.json');
    const w = run(cmpPath, [res, '--write', wb]);
    let wc = null;
    try { wc = JSON.parse(fs.readFileSync(wb, 'utf8')).cases; } catch { /* reported below */ }
    if (w.status !== 0 || !wc || JSON.stringify(Object.keys(wc)) !== '["c1"]' || JSON.stringify(Object.keys(wc.c1)) !== '["with"]') {
      err('scripts/eval-compare.mjs', `smoke "compare write skips null pairs": expected exit 0 and only c1.with, got exit ${w.status}`);
    }

    // eval-compare default baseline: evals/baseline.json relative to cwd, missing here
    const bcwd = path.join(d, 'no-baseline');
    fs.mkdirSync(bcwd);
    const nb = spawnSync(process.execPath, [cmpPath, res], { encoding: 'utf8', cwd: bcwd });
    if (nb.status !== 2 || !(nb.stdout ?? '').startsWith('EVAL-COMPARE: ERROR baseline unreadable: evals/baseline.json')) {
      err('scripts/eval-compare.mjs', `smoke "compare default baseline missing": expected exit 2 with "EVAL-COMPARE: ERROR baseline unreadable: evals/baseline.json", got exit ${nb.status}`);
    }

    // budget --from mid-line: the partial first line is dropped, so it matches the next line start
    const am = (id, out) => J({ type: 'assistant', message: { id, content: [{ type: 'text', text: 't' }], usage: { input_tokens: 1, output_tokens: out } } });
    const tl = [am('m1', 500), am('m2', 800)];
    const tf = path.join(d, 'x.jsonl');
    fs.writeFileSync(tf, tl.join('\n') + '\n');
    const budAt = (from) => (run(budPath, [tf, '--main', '--from', String(from)]).stdout ?? '').trim();
    const mid = budAt(5);
    const aligned = budAt(Buffer.byteLength(tl[0] + '\n'));
    if (mid !== aligned || !aligned.startsWith('MAIN: 1 calls')) {
      err('scripts/budget.mjs', `smoke "from mid-line": expected the next-line result "${aligned}", got "${mid}"`);
    }

    // trace-tokens: a run whose trace cannot be read prints RUN then exactly TRACE: unreadable
    const ur = path.join(d, 'u.json');
    fs.writeFileSync(ur, J({ suite: { plugins: [{ version: '9.9.9' }] }, cases: [{ name: 'c5', arms: { with: [{ passed: false, tracePath: path.join(d, 'nope.jsonl') }] } }] }));
    const ut = (run(tracePath, [ur]).stdout ?? '').trim();
    if (ut !== 'RUN: c5 with #1 FAIL\nTRACE: unreadable') err('scripts/trace-tokens.mjs', `smoke "unreadable run": expected RUN line then TRACE: unreadable, got "${ut}"`);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

// 9. Eval cases: case.yaml name matches folder, prompt.md and scaffold script exist, graders use a known type with required keys
const GRADER_TYPES = new Set(['regex', 'tool_order', 'tool_used', 'file_exists', 'llm', 'baseline']);
const REQUIRED = { regex: ['pattern'], tool_order: ['before', 'after'], tool_used: ['tool'], file_exists: ['path'], llm: [], baseline: ['baseline_file'] };
for (const c of listDirs('evals').filter((d) => d !== 'results')) {
  const dir = `evals/${c}`, caseFile = `${dir}/case.yaml`;
  if (!exists(path.join(root, caseFile))) { err(caseFile, 'missing'); continue; }
  const cy = readText(path.join(root, caseFile));
  const name = /^name:\s*(\S+)\s*$/m.exec(cy)?.[1];
  if (name !== c) err(caseFile, `name "${name ?? ''}" must match folder "${c}"`);
  const scaffold = /^\s*scaffold_script:\s*(\S+)\s*$/m.exec(cy)?.[1];
  if (scaffold && !exists(path.join(root, dir, scaffold))) err(caseFile, `scaffold_script "${scaffold}" missing`);
  if (!exists(path.join(root, dir, 'prompt.md'))) err(`${dir}/prompt.md`, 'missing');
  const graders = listMd(`${dir}/graders`);
  if (!graders.length) err(`${dir}/graders`, 'no grader files');
  for (const g of graders) {
    const gf = `${dir}/graders/${g}`, fm = frontmatter(gf);
    if (!fm) continue;
    if (!GRADER_TYPES.has(fm.type)) { err(gf, `type "${fm.type ?? ''}" must be one of ${[...GRADER_TYPES].join(', ')}`); continue; }
    for (const k of REQUIRED[fm.type]) if (!fm[k]) err(gf, `${fm.type} grader needs "${k}"`);
    for (const [k, fl] of [['pattern', fm.flags ?? ''], ['input_match', '']]) {
      if (fm[k] && fm[k] !== '(block)') { try { new RegExp(fm[k], fl); } catch (e) { err(gf, `${k} is not a valid RegExp (${e.message})`); } }
    }
  }
}

for (const e of errors) console.log(e);
if (errors.length) {
  console.log(`FAILED: ${errors.length} error(s)`);
  process.exitCode = 1;
} else {
  console.log(`OK: ${skillDirs.length} skills, ${agentFiles.length} agents, version ${version}`);
}
