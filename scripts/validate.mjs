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
const root = path.resolve(process.argv[2] ?? path.join(scriptDir, '..'));
const ctx = createContext(root);

for (const mod of [layout, hooksSmoke, scriptsSmoke, maestroSmoke, evals]) await mod.run(ctx);

const { errors, skillDirs, agentFiles, version } = ctx;

for (const e of errors) console.log(e);
if (errors.length) {
  console.log(`FAILED: ${errors.length} error(s)`);
  process.exitCode = 1;
} else {
  console.log(`OK: ${skillDirs.length} skills, ${agentFiles.length} agents, version ${version}`);
}
