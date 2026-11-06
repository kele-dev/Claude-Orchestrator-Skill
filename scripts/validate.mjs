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
for (const f of ['skills/on/modes.md', 'skills/on/reference.md', 'skills/learn/legacy.md', 'skills/status/caps.md', 'skills/learn/reference.md']) {
  if (!exists(path.join(root, f))) err(f, 'required file missing');
}
const headingChecks = [
  ['skills/team/SKILL.md', '## Budget'],
  ['skills/autopilot/SKILL.md', '## Budget'],
  ['skills/learn/SKILL.md', '## Store'],
  ['skills/learn/reference.md', '## Store command'],
  ['skills/learn/reference.md', '## Manual commands'],
];
for (const [f, h] of headingChecks) {
  if (!exists(path.join(root, f))) continue;
  if (!readText(path.join(root, f)).split(/\r?\n/).some((l) => l.startsWith(h))) err(f, `missing heading "${h}"`);
}
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
    env: { ...process.env, ORCH_GUARD: '', ORCH_NO_TRIM: '', CLAUDE_PROJECT_DIR: root, ...extraEnv },
  });
}
{
  const lines = Array.from({ length: 150 }, (_, i) => (i === 69 ? 'Error: boom'.padEnd(50, '.') : 'x'.repeat(50)));
  const stdout = lines.join('\n');
  const trimPayload = (command) => ({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command },
    tool_response: { stdout, stderr: '', interrupted: false },
    cwd: root,
  });
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

  r = runHook('session-info.mjs', { hook_event_name: 'SessionStart', source: 'startup', cwd: root });
  if (r && (r.status !== 0 || !r.stdout.includes('Orchestrator store:'))) {
    err('hooks/session-info.mjs', `smoke "session-info": exit ${r.status}, expected "Orchestrator store:" in stdout`);
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
      const missingRes = bud([path.join(tmp, 'none.jsonl')]);
      chk('missing file', missingRes.out, 'BUDGET: spent ? (transcript unreadable)');
      chk('missing file exit', String(missingRes.status), '0');
      const size = fs.statSync(m).size;
      chk('mark', bud([m, '--mark']).out, `BUDGET: mark ${size}`);
      fs.appendFileSync(m, U.join('\n') + '\n');
      chk('from mark', bud([m, '--from', String(size)]).out, 'BUDGET: spent ? (1 agent, 1 without usage)');

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
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
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
