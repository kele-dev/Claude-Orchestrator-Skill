#!/usr/bin/env node
// PreToolUse hook for Edit/Write/NotebookEdit: denies project edits from the main session while orchestration is on.
// Fails open on malformed input (prints nothing, exits 0). With no on/off info in the transcript the default is "on".
import fs from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  try {
    if (shouldDeny(JSON.parse(raw))) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'orchestrator: the main session must not edit project files. Delegate this change to orchestrator:haiku-coder (PRD files under docs/prd/ are allowed). /orchestrator:off disables this guard.',
        },
      }));
    }
  } catch {
    // fail open
  }
});

function shouldDeny(input) {
  if (process.env.ORCH_GUARD === 'off') return false;
  if (typeof input.agent_id === 'string' && input.agent_id !== '') return false;

  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof target !== 'string' || target === '') return false;
  if (typeof input.cwd !== 'string') return false;

  const root = normalize(path.resolve(projectRoot(input.cwd)));
  const file = normalize(path.resolve(input.cwd, target));
  const inside = file === root || file.startsWith(root + '/');
  if (!inside) return false;

  const rel = file.slice(root.length + 1);
  if (/^(\.claude\/worktrees\/[^/]+\/)?docs\/prd\//.test(rel)) return false;

  if (orchestrationOff(input.transcript_path)) return false;
  return true;
}

function projectRoot(cwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (typeof env === 'string' && env !== '') return env;
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8',
    }).trim();
    if (top) return top;
  } catch {
    // not a git repo
  }
  return cwd;
}

// Forward slashes, no trailing slash; lowercase on Windows so comparisons are case-insensitive.
function normalize(p) {
  let s = p.split(path.sep).join('/');
  if (process.platform === 'win32') s = s.toLowerCase();
  return s.replace(/\/+$/, '');
}

// True only when the most recent real orchestrator command/Skill call in the transcript is off.
function orchestrationOff(transcriptPath) {
  const WINDOW = 512 * 1024;
  let text;
  let size = 0;
  let partial = false;
  try {
    const fd = fs.openSync(transcriptPath, 'r');
    try {
      size = fs.fstatSync(fd).size;
      const len = Math.min(size, WINDOW);
      const buf = Buffer.alloc(len);
      let got = 0;
      while (got < len) {
        const n = fs.readSync(fd, buf, got, len - got, size - len + got);
        if (n <= 0) break;
        got += n;
      }
      text = buf.toString('utf8', 0, got);
      partial = size > len;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
  if (partial) {
    const nl = text.indexOf('\n');
    text = nl === -1 ? '' : text.slice(nl + 1);
  }
  let mode = lastMode(text);
  if (mode === null && partial) {
    try {
      mode = lastMode(fs.readFileSync(transcriptPath, 'utf8'));
    } catch {
      return false;
    }
  }
  return mode === 'off';
}

function lastMode(text) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('orchestrator:')) continue;
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const mode = modeOf(entry);
    if (mode) return mode;
  }
  return null;
}

function modeOf(entry) {
  const content = entry?.message?.content;
  if (entry?.type === 'user') {
    let s = null;
    if (typeof content === 'string') s = content;
    else if (Array.isArray(content)) {
      const first = content.find((p) => p?.type === 'text');
      if (typeof first?.text === 'string') s = first.text;
    }
    if (s === null || !s.trimStart().startsWith('<command-message>')) return null;
    const m = /<command-name>\/orchestrator:(on|off|team|autopilot)<\/command-name>/.exec(s);
    return m ? m[1] : null;
  }
  if (entry?.type === 'assistant' && Array.isArray(content)) {
    for (const p of content) {
      if (p?.type === 'tool_use' && p.name === 'Skill' && typeof p.input?.skill === 'string') {
        const m = /^orchestrator:(on|off|team|autopilot)$/.exec(p.input.skill);
        if (m) return m[1];
      }
    }
  }
  return null;
}
