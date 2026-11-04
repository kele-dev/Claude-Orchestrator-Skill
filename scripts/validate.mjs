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
for (const f of ['skills/on/modes.md', 'skills/on/reference.md', 'skills/learn/legacy.md']) {
  if (!exists(path.join(root, f))) err(f, 'required file missing');
}
const headingChecks = [
  ['skills/team/SKILL.md', '## Budget'],
  ['skills/autopilot/SKILL.md', '## Budget'],
  ['skills/learn/SKILL.md', '## Store'],
];
for (const [f, h] of headingChecks) {
  if (!exists(path.join(root, f))) continue;
  if (!readText(path.join(root, f)).split(/\r?\n/).some((l) => l.startsWith(h))) err(f, `missing heading "${h}"`);
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
  for (const [name, file, extra, deny] of guardCases) {
    const g = guard(file, extra);
    if (!g) continue;
    const denied = g.stdout.includes('"permissionDecision":"deny"');
    if (deny && !denied) err('hooks/guard-edit.mjs', `smoke "${name}": expected deny`);
    if (!deny && g.stdout.trim() !== '') err('hooks/guard-edit.mjs', `smoke "${name}": expected empty stdout`);
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
  const markers = [sidA, sidB].map((s) => path.join(os.tmpdir(), `orchestrator-long-${s}`));
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
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const m of markers) fs.rmSync(m, { force: true });
  }
}

for (const e of errors) console.log(e);
if (errors.length) {
  console.log(`FAILED: ${errors.length} error(s)`);
  process.exitCode = 1;
} else {
  console.log(`OK: ${skillDirs.length} skills, ${agentFiles.length} agents, version ${version}`);
}
