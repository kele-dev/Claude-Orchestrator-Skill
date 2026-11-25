#!/usr/bin/env node
// Validates the orchestrator plugin layout, manifests, skills, agents, hooks and cross-references.
// Sections live in scripts/validate/: context (shared helpers), layout, hooks-smoke, scripts-smoke, maestro-smoke, evals.
// Default: layout runs in-process, the other sections run as parallel child processes with private temp dirs.
// ORCH_VALIDATE_SERIAL=1 runs everything serially in-process; --only <name> [root] runs layout plus one section.
// --child (internal, used with --only) makes a section print only its errors and a SECTION_MS marker.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createContext } from './validate/context.mjs';
import * as layout from './validate/layout.mjs';
import * as hooksSmoke from './validate/hooks-smoke.mjs';
import * as scriptsSmoke from './validate/scripts-smoke.mjs';
import * as maestroSmoke from './validate/maestro-smoke.mjs';
import * as evals from './validate/evals.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sections = { layout, 'hooks-smoke': hooksSmoke, 'scripts-smoke': scriptsSmoke, 'maestro-smoke': maestroSmoke, evals };
const args = process.argv.slice(2);
const only = args[0] === '--only' ? (args[1] ?? '') : null;
const child = only !== null && args[2] === '--child';
const rootArg = only === null ? args[0] : args[child ? 3 : 2];
const root = path.resolve(rootArg ?? path.join(scriptDir, '..'));
const ctx = createContext(root);

if (only !== null && !Object.hasOwn(sections, only)) {
  console.log(`unknown section ${only}`);
  process.exit(1);
}
// --only <name> runs layout first (it fills ctx for the other sections), then the named section.
const names = Object.keys(sections);
const parallel = only === null && process.env.ORCH_VALIDATE_SERIAL !== '1';
const run = only === null ? (parallel ? ['layout'] : names) : only === 'layout' ? ['layout'] : ['layout', only];
const timings = [];
const T0 = performance.now();
let afterLayout = 0;
let secMs = 0;
for (const name of run) {
  const t0 = performance.now();
  try {
    await sections[name].run(ctx);
  } catch (e) {
    ctx.err('scripts/validate.mjs', `section ${name} crashed: ${e?.message ?? e}`);
  }
  if (name === 'layout') afterLayout = ctx.errors.length;
  secMs = performance.now() - t0;
  timings.push(`${name} ${(secMs / 1000).toFixed(1)} s`);
}

// Runs one section in a child process with a private temp dir (short prefix: git rejects long worktree paths on Windows).
// Resolves to the section's error entries, its pre-error stdout lines (notes) and its own timing.
function runChild(name) {
  let tmp;
  return new Promise((resolve) => {
    try {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ov-${name.slice(0, 3)}-`));
    } catch (e) {
      resolve({ errs: [`ERROR scripts/validate.mjs: section ${name} could not create temp dir: ${e?.message ?? e}`], notes: [], ms: 0 });
      return;
    }
    let out = '';
    let errText = '';
    const done = (code) => {
      const lines = out.split(/\r?\n/).filter(Boolean);
      const m = lines.map((l) => /^SECTION_MS (\S+) (\d+(?:\.\d+)?)$/.exec(l)).find(Boolean);
      const errs = [];
      const notes = [];
      for (const l of lines) {
        if (l.startsWith('ERROR ')) errs.push(l);
        else if (l.startsWith('SECTION_MS ')) continue;
        else if (errs.length) errs[errs.length - 1] += '\n' + l;
        else notes.push(l);
      }
      if (code !== 0 || !m) {
        const first = errText.split(/\r?\n/).find(Boolean);
        errs.push(`ERROR scripts/validate.mjs: section ${name} crashed in child (exit ${code})${first ? `: ${first}` : ''}`);
      } else if (errText.trim()) process.stderr.write(errText);
      resolve({ errs, notes, ms: m ? Number(m[2]) : 0 });
    };
    const env = { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp };
    const cp = spawn(process.execPath, [fileURLToPath(import.meta.url), '--only', name, '--child', root], { env });
    cp.stdout.setEncoding('utf8');
    cp.stderr.setEncoding('utf8');
    cp.stdout.on('data', (d) => (out += d));
    cp.stderr.on('data', (d) => (errText += d));
    cp.on('error', (e) => { errText += e.message; done(-1); });
    cp.on('close', (code) => done(code ?? -1));
  }).finally(() => {
    if (tmp) try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  });
}

if (child) {
  if (ctx.errors.length > afterLayout) console.log(ctx.errors.slice(afterLayout).join('\n'));
  console.log(`SECTION_MS ${only} ${secMs.toFixed(0)}`);
  process.exitCode = 0;
} else {
  if (parallel) {
    const rest = names.filter((n) => n !== 'layout');
    const results = await Promise.all(rest.map(runChild));
    for (const note of new Set(results.flatMap((r) => r.notes))) console.log(note);
    rest.forEach((n, i) => {
      ctx.errors.push(...results[i].errs);
      timings.push(`${n} ${(results[i].ms / 1000).toFixed(1)} s`);
    });
    timings[timings.length - 1] += `, total ${((performance.now() - T0) / 1000).toFixed(1)} s`;
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
}
