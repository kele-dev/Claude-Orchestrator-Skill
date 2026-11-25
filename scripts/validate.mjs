#!/usr/bin/env node
// Validates the orchestrator plugin layout, manifests, skills, agents, hooks and cross-references.
// Sections live in scripts/validate/: context (shared helpers), layout, hooks-smoke, scripts-smoke, evals.
import path from 'path';
import { fileURLToPath } from 'url';
import { createContext } from './validate/context.mjs';
import * as layout from './validate/layout.mjs';
import * as hooksSmoke from './validate/hooks-smoke.mjs';
import * as scriptsSmoke from './validate/scripts-smoke.mjs';
import * as maestroSmoke from './validate/maestro-smoke.mjs';
import * as evals from './validate/evals.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sections = { layout, 'hooks-smoke': hooksSmoke, 'scripts-smoke': scriptsSmoke, 'maestro-smoke': maestroSmoke, evals };
const only = process.argv[2] === '--only' ? (process.argv[3] ?? '') : null;
const rootArg = only === null ? process.argv[2] : process.argv[4];
const root = path.resolve(rootArg ?? path.join(scriptDir, '..'));
const ctx = createContext(root);

if (only !== null && !Object.hasOwn(sections, only)) {
  console.log(`unknown section ${only}`);
  process.exit(1);
}
// --only <name> runs layout first (it fills ctx for the other sections), then the named section.
const run = only === null ? Object.keys(sections) : only === 'layout' ? ['layout'] : ['layout', only];
const timings = [];
for (const name of run) {
  const t0 = performance.now();
  try {
    await sections[name].run(ctx);
  } catch (e) {
    ctx.err('scripts/validate.mjs', `section ${name} crashed: ${e?.message ?? e}`);
  }
  timings.push(`${name} ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

const { errors, skillDirs, agentFiles, version } = ctx;

for (const e of errors) console.log(e);
console.log(`sections: ${timings.join(', ')}`);
if (errors.length) {
  console.log(`FAILED: ${errors.length} error(s)`);
  process.exitCode = 1;
} else {
  console.log(`OK: ${skillDirs.length} skills, ${agentFiles.length} agents, version ${version}`);
}
