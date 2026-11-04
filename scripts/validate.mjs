#!/usr/bin/env node
// Validates the orchestrator plugin layout, manifests, skills, agents, hooks and cross-references.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

for (const e of errors) console.log(e);
if (errors.length) {
  console.log(`FAILED: ${errors.length} error(s)`);
  process.exitCode = 1;
} else {
  console.log(`OK: ${skillDirs.length} skills, ${agentFiles.length} agents, version ${version}`);
}
