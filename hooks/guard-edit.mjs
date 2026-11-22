#!/usr/bin/env node
// PreToolUse hook for Edit/Write/NotebookEdit: denies project edits from the main session while orchestration is on.
// Fails open on malformed input or hook errors (prints nothing, exits 0). Default mode is "on": no on/off info, or an unreadable transcript, means edits are denied.
// Counts consecutive main-session denials per session in the private state dir (lib stateDir); from the 3rd on, the deny reason tells the model to stop retrying. An allowed main-session call resets the count.
import fs from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { makeDbg, orchestrationOff, readStdin, stateDir, writeAtomic } from './lib.mjs';

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

// Per-session counter file in the private state dir; empty session id or no usable state dir means no counter.
function denyFile(input) {
  const sid = String(input.session_id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  const dir = sid === '' ? null : stateDir();
  return dir === null ? null : path.join(dir, `orchestrator-deny-${sid}`);
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
    writeAtomic(file, String(count));
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
