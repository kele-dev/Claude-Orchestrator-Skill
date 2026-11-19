#!/usr/bin/env node
// PreToolUse hook for Agent|Task: denies orchestrator:opus-reviewer when a PRD path in its prompt does not exist yet.
// Fails open on any error or unknown input (prints nothing, exits 0).
import fs from 'fs';
import path from 'path';
import { makeDbg, readStdin } from './lib.mjs';

const PRD_PATH = /(?<![A-Za-z0-9_.\/\\:-])(?:[A-Za-z]:[\/\\]|\/|\.{1,2}\/)?(?:[A-Za-z0-9_.-]+[\/\\])*docs[\/\\]prd[\/\\][A-Za-z0-9_.-]+\.md(?!\.?[A-Za-z0-9_\/-])/g;
const dbg = makeDbg('guard-review');

readStdin((raw) => {
  try {
    const input = JSON.parse(raw);
    const missing = findMissing(input);
    if (missing !== null) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `orchestrator: ${missing} does not exist yet. Save the PRD first (the main session may Write to docs/prd/), confirm with ls, then launch orchestrator:opus-reviewer. Set ORCH_GUARD=off to bypass. Explain this to the user in their language.`,
        },
      }));
    }
  } catch (e) {
    // fail open
    dbg(e);
  }
});

// Returns the first PRD path that does not exist, or null to allow.
function findMissing(input) {
  if (process.env.ORCH_GUARD === 'off') return null;
  const toolInput = input.tool_input;
  if (toolInput?.subagent_type !== 'orchestrator:opus-reviewer') return null;
  if (typeof toolInput.prompt !== 'string') return null;

  const prompt = toolInput.prompt;
  for (const m of prompt.matchAll(PRD_PATH)) {
    const lineStart = prompt.lastIndexOf('\n', m.index - 1) + 1;
    const before = prompt.slice(lineStart, m.index);
    if (!exists(m[0], input.cwd, before)) return m[0];
  }
  return null;
}

function exists(p, cwd, before = '') {
  if (path.isAbsolute(p)) return fs.existsSync(p) || leftExtend(before, p);

  const bases = [];
  if (typeof cwd === 'string') bases.push(cwd);
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (typeof env === 'string' && env !== '') bases.push(env);
  if (bases.length === 0) return true;

  return bases.some((base) => fs.existsSync(path.resolve(base, p))) || leftExtend(before, p);
}

// A path with spaces is matched only from its last space on; try the absolute roots
// that start earlier on the same line (at most 20 candidates).
function leftExtend(before, p) {
  let tries = 0;
  for (let i = 0; i < before.length; i++) {
    const prev = i > 0 ? before[i - 1] : '';
    const drive = /^[A-Za-z]:[\\/]/.test(before.slice(i)) && !/[A-Za-z0-9]/.test(prev);
    const posix = before[i] === '/' && (i === 0 || /[\s"'`(]/.test(prev));
    if (!drive && !posix) continue;
    if (++tries > 20) break;
    if (fs.existsSync(before.slice(i) + p)) return true;
  }
  return false;
}
