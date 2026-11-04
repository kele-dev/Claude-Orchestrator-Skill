#!/usr/bin/env node
// PreToolUse hook for Edit/Write/NotebookEdit: denies project edits from the main session while orchestration is on.
// Fails open: on any error or unexpected input it prints nothing and exits 0.
import fs from 'fs';
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

  const root = normalize(path.resolve(input.cwd));
  const file = normalize(path.resolve(input.cwd, target));
  const inside = file === root || file.startsWith(root + '/');
  if (!inside) return false;

  const rel = file.slice(root.length + 1);
  if (rel.startsWith('docs/prd/')) return false;

  if (orchestrationOff(input.transcript_path)) return false;
  return true;
}

// Forward slashes; lowercase on Windows so path comparisons are case-insensitive.
function normalize(p) {
  const s = p.split(path.sep).join('/');
  return process.platform === 'win32' ? s.toLowerCase() : s;
}

// True when the last orchestrator command in the transcript is /orchestrator:off.
function orchestrationOff(transcriptPath) {
  let text;
  try {
    text = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return false;
  }
  const off = text.lastIndexOf('<command-name>/orchestrator:off</command-name>');
  const on = Math.max(
    ...['/orchestrator:on', '/orchestrator:team', '/orchestrator:autopilot']
      .map((c) => text.lastIndexOf(`<command-name>${c}</command-name>`)),
  );
  return off > on;
}
