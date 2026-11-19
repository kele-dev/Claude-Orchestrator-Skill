// Shared context for the validator modules: helpers used by more than one section plus the error list.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

export function createContext(root) {
  const errors = [];
  const err = (file, msg, line) => errors.push(`ERROR ${file}${line ? `:${line}` : ''}: ${msg}`);
  const exists = (p) => fs.existsSync(p);
  const readText = (p) => fs.readFileSync(p, 'utf8').replace(/^﻿/, '');

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

  const lfBytes = (t) => Buffer.byteLength(t.replace(/\r\n/g, '\n'));

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
// Best-effort cleanup: never let a failed removal mask the real result.
const rmQuiet = (p, opts = {}) => {
  try {
    fs.rmSync(p, { force: true, ...opts });
  } catch {
    // ignore
  }
};
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

  // Values produced by one section and read by a later one are set on ctx by the producing module.
  return { root, errors, err, exists, readText, readJson, frontmatter, listDirs, listMd, lfBytes, runHook, rmQuiet, BIG_STDOUT, trimPayload, sessionInfo };
}

