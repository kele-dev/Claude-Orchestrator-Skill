#!/usr/bin/env node
// PreToolUse hook for Edit/Write/NotebookEdit: denies project edits from the main session while orchestration is on.
// Fails open on malformed input or hook errors (prints nothing, exits 0). Default mode is "on": no on/off info, or an unreadable transcript, means edits are denied.
// Counts consecutive main-session denials per session in the temp dir; from the 3rd on, the deny reason tells the model to stop retrying. An allowed main-session call resets the count.
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';
import path from 'path';
import { makeDbg, readBytes, readStdin } from './lib.mjs';

const dbg = makeDbg('guard-edit');

readStdin((raw) => {
  try {
    const input = JSON.parse(raw);
    if (shouldDeny(input)) {
      const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
      const streak = bumpDenyStreak(input);
      let reason = `orchestrator: the main session must not edit ${target} (project file). Delegate this change to orchestrator:haiku-coder. docs/prd/ is writable: the main session may Write/Edit PRD files there itself (e.g. a PRD from orchestrator:opus-planner). /orchestrator:off disables this guard. Set ORCH_GUARD=off to bypass. Explain this to the user in their language.`;
      if (streak >= DENY_STREAK) reason += ` This is denial ${streak} in a row: stop retrying edits; delegate the change to orchestrator:haiku-coder or ask the user how to proceed.`;
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      }));
    } else if (!(typeof input.agent_id === 'string' && input.agent_id !== '')) {
      resetDenyStreak(input);
    }
  } catch (e) {
    // fail open
    dbg(e);
  }
});

const DENY_STREAK = 3;

// Per-session counter file in the temp dir; empty session id means no counter.
function denyFile(input) {
  const sid = String(input.session_id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  return sid === '' ? null : path.join(os.tmpdir(), `orchestrator-deny-${sid}`);
}

// Adds one to the streak and returns it. Never throws: counter errors must not block the deny.
function bumpDenyStreak(input) {
  try {
    const file = denyFile(input);
    if (file === null) return 0;
    let count = 0;
    try {
      count = Number.parseInt(fs.readFileSync(file, 'utf8'), 10);
    } catch {
      count = 0;
    }
    if (!Number.isInteger(count) || count < 0) count = 0;
    count += 1;
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, String(count));
    fs.renameSync(tmp, file);
    return count;
  } catch (e) {
    dbg(e);
    return 0;
  }
}

function resetDenyStreak(input) {
  try {
    const file = denyFile(input);
    if (file !== null) fs.rmSync(file, { force: true });
  } catch (e) {
    dbg(e);
  }
}

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
  } catch (e) {
    dbg(e);
    // not a git repo
  }
  return cwd;
}

// Forward slashes, no trailing slash; lowercase on Windows and macOS so comparisons are case-insensitive.
function normalize(p) {
  let s = p.split(path.sep).join('/');
  if (process.platform === 'win32' || process.platform === 'darwin') s = s.toLowerCase();
  return s.replace(/\/+$/, '');
}

// True only when the most recent real orchestrator command/Skill call in the transcript is off.
function orchestrationOff(transcriptPath) {
  const WINDOW = 512 * 1024;
  let text;
  let size = 0;
  let len = 0;
  let skip = 0;
  let partial = false;
  try {
    const fd = fs.openSync(transcriptPath, 'r');
    try {
      size = fs.fstatSync(fd).size;
      len = Math.min(size, WINDOW);
      text = readBytes(fd, size - len, len).toString('utf8');
      partial = size > len;
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    dbg(e);
    return false;
  }
  if (partial) {
    const nl = text.indexOf('\n');
    skip = nl === -1 ? len : nl + 1;
    text = nl === -1 ? '' : text.slice(nl + 1);
  }
  let mode = lastMode(text);
  if (mode === null && partial && skip > 0) mode = scanOlder(transcriptPath, size - len + skip);
  return mode === 'off';
}

// Scan [0, end) backwards in fixed chunks (bounded memory and time) for the latest mode marker.
function scanOlder(transcriptPath, end) {
  const CHUNK = 1024 * 1024;
  const MAX_CARRY = 32 * 1024 * 1024;
  const deadline = Date.now() + 2000;
  let fd;
  try {
    fd = fs.openSync(transcriptPath, 'r');
    let pos = end;
    let carry = Buffer.alloc(0);
    while (pos > 0 && Date.now() < deadline) {
      const start = Math.max(0, pos - CHUNK);
      const data = Buffer.concat([readBytes(fd, start, pos - start), carry]);
      let body = data;
      if (start > 0) {
        const i = data.indexOf(10);
        if (i === -1) {
          carry = data.length > MAX_CARRY ? Buffer.alloc(0) : data;
          pos = start;
          continue;
        }
        carry = data.subarray(0, i);
        body = data.subarray(i + 1);
      } else {
        carry = Buffer.alloc(0);
      }
      const mode = lastMode(body.toString('utf8'));
      if (mode) return mode;
      pos = start;
    }
  } catch (e) {
    dbg(e);
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
  }
  return null;
}

function lastMode(text) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!(l.includes('<command-name>/orchestrator:') || (l.includes('"Skill"') && l.includes('orchestrator:')))) continue;
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
    if (s === null) return null;
    s = s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
    if (!s.trimStart().startsWith('<command-message>')) return null;
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
