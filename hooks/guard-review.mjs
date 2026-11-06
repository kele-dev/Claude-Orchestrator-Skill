#!/usr/bin/env node
// PreToolUse hook for Agent|Task: denies orchestrator:opus-reviewer when a PRD path in its prompt does not exist yet.
// Fails open on any error or unknown input (prints nothing, exits 0).
import fs from 'fs';
import path from 'path';

const PRD_PATH = /(?<![A-Za-z0-9_.\/\\:-])(?:\/|\.{1,2}\/)?(?:[A-Za-z0-9_.-]+[\/\\])*docs[\/\\]prd[\/\\][A-Za-z0-9_.-]+\.md(?!\.?[A-Za-z0-9_\/-])/g;

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);
    const missing = findMissing(input);
    if (missing !== null) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `orchestrator: ${missing} does not exist yet. Save the PRD first (the main session may Write to docs/prd/), confirm with ls, then launch orchestrator:opus-reviewer.`,
        },
      }));
    }
  } catch {
    // fail open
  }
});

// Returns the first PRD path that does not exist, or null to allow.
function findMissing(input) {
  if (process.env.ORCH_GUARD === 'off') return null;
  const toolInput = input.tool_input;
  if (toolInput?.subagent_type !== 'orchestrator:opus-reviewer') return null;
  if (typeof toolInput.prompt !== 'string') return null;

  const paths = toolInput.prompt.match(PRD_PATH) ?? [];
  for (const p of paths) {
    if (!exists(p, input.cwd)) return p;
  }
  return null;
}

function exists(p, cwd) {
  if (path.isAbsolute(p)) return fs.existsSync(p);

  const bases = [];
  if (typeof cwd === 'string') bases.push(cwd);
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (typeof env === 'string' && env !== '') bases.push(env);
  if (bases.length === 0) return true;

  return bases.some((base) => fs.existsSync(path.resolve(base, p)));
}
