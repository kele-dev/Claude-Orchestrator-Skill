// Sections 8z and 9: eval fixture modes and eval case/grader checks.
import path from 'path';
import { spawnSync } from 'child_process';

export function run(ctx) {
const { root, err, exists, readText, frontmatter, listDirs, listMd } = ctx;

// 8z. Eval fixture scripts must be tracked as executable (mode 100755)
{
  const ls = spawnSync('git', ['ls-files', '-s', '--', 'evals/*/fixture.sh'], { cwd: root, encoding: 'utf8' });
  if (ls.error || ls.status !== 0) {
    console.log('note: git unavailable or not a repository, skipping fixture.sh mode check');
  } else {
    for (const line of ls.stdout.split(/\r?\n/).filter(Boolean)) {
      const m = line.match(/^(\d+) \S+ \d\t(.+)$/);
      if (m && m[1] !== '100755') err(m[2], `tracked mode ${m[1]}, expected 100755 (git update-index --chmod=+x)`);
    }
  }
}

// 9. Eval cases: case.yaml name matches folder, prompt.md and scaffold script exist, graders use a known type with required keys
// evals/touches.json: keys match the case folders and every prefix is an existing path
{
  const tf = 'evals/touches.json';
  let touches = null;
  if (!exists(path.join(root, tf))) err(tf, 'missing');
  else {
    try { touches = JSON.parse(readText(path.join(root, tf))); } catch (e) { err(tf, `cannot parse JSON (${e.message})`); }
  }
  if (touches && typeof touches === 'object' && !Array.isArray(touches)) {
    const cases = listDirs('evals').filter((d) => d !== 'results');
    const keys = Object.keys(touches);
    const missing = cases.filter((c) => !keys.includes(c));
    const extra = keys.filter((k) => !cases.includes(k));
    if (missing.length || extra.length) err(tf, `keys must match case folders (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`);
    for (const k of keys) {
      if (!Array.isArray(touches[k])) { err(tf, `${k}: value must be an array of path prefixes`); continue; }
      for (const p of touches[k]) if (!exists(path.join(root, p))) err(tf, `${k}: prefix "${p}" does not exist`);
    }
  }
}
const GRADER_TYPES = new Set(['regex', 'tool_order', 'tool_used', 'file_exists', 'llm', 'baseline']);
const REQUIRED = { regex: ['pattern'], tool_order: ['before', 'after'], tool_used: ['tool'], file_exists: ['path'], llm: [], baseline: ['baseline_file'] };
// Grader frontmatter as a tree: top-level "key: value" plus indented "key: value" children (nested keys such as target.source).
function graderTree(text) {
  const lines = text.split(/\r?\n/);
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  const tree = {};
  let parent = null;
  for (const line of end === -1 ? [] : lines.slice(1, end)) {
    const m = /^(\s*)([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const raw = m[3].trim();
    const quoted = raw.length >= 2 && ((raw[0] === '"' && raw.at(-1) === '"') || (raw[0] === "'" && raw.at(-1) === "'"));
    const val = quoted ? raw.slice(1, -1) : raw;
    if (m[1] === '') {
      tree[m[2]] = val === '' ? {} : val;
      parent = val === '' ? tree[m[2]] : null;
    } else if (parent) parent[m[2]] = val;
  }
  return tree;
}
const GRADER_ENUMS = { match: ['contains', 'not_contains'], source: ['file'] };
const GRADER_TARGETS = new Set(['trace']);
// Pure check of a parsed grader tree: recurses into nested keys, checks enums, flags, target, and min/max bounds.
function graderProblems(node, where = '') {
  const out = [];
  for (const [k, v] of Object.entries(node)) {
    const at = where ? `${where}.${k}` : k;
    if (v && typeof v === 'object') {
      if (k === 'target' && v.source === 'file' && !v.path) out.push(`${at} needs "path" when source is file`);
      out.push(...graderProblems(v, at));
      continue;
    }
    if (GRADER_ENUMS[k] && !GRADER_ENUMS[k].includes(v)) out.push(`${at} "${v}" must be one of ${GRADER_ENUMS[k].join(', ')}`);
    if (k === 'target' && !GRADER_TARGETS.has(v)) out.push(`${at} "${v}" must be "trace" or a nested source block`);
    if (k === 'flags' && !/^[dgimsuvy]*$/.test(v)) out.push(`${at} "${v}" has invalid RegExp flags`);
    if ((k === 'min' || k === 'max') && !/^\d+$/.test(v)) out.push(`${at} "${v}" must be a non-negative integer`);
  }
  if (!where && /^\d+$/.test(node.min ?? '') && /^\d+$/.test(node.max ?? '') && Number(node.min) > Number(node.max)) out.push(`min ${node.min} exceeds max ${node.max}`);
  return out;
}
{
  // Negative tests: pure in-memory mutations of a valid grader tree; each must be flagged.
  const base = { type: 'tool_used', tool: 'Agent', min: '1', max: '2', match: 'contains', flags: 'i', target: { source: 'file', path: 'a.txt' } };
  if (graderProblems(base).length) err('scripts/validate.mjs', `grader self-test: valid tree flagged (${graderProblems(base).join('; ')})`);
  const cases = [
    ['bad match enum', { ...base, match: 'sometimes' }, 'match'],
    ['bad flags', { ...base, flags: 'iz' }, 'flags'],
    ['bad target scalar', { ...base, target: 'output' }, 'target'],
    ['bad nested source enum', { ...base, target: { source: 'network', path: 'a' } }, 'target.source'],
    ['nested file target without path', { ...base, target: { source: 'file' } }, 'path'],
    ['non-numeric min', { ...base, min: 'x' }, 'min'],
    ['negative max', { ...base, max: '-1' }, 'max'],
    ['min above max', { ...base, min: '3', max: '2' }, 'exceeds'],
  ];
  for (const [label, tree, needle] of cases) {
    if (!graderProblems(tree).some((p) => p.includes(needle))) err('scripts/validate.mjs', `grader self-test "${label}": expected a problem mentioning "${needle}"`);
  }
}
for (const c of listDirs('evals').filter((d) => d !== 'results')) {
  const dir = `evals/${c}`, caseFile = `${dir}/case.yaml`;
  if (!exists(path.join(root, caseFile))) { err(caseFile, 'missing'); continue; }
  const cy = readText(path.join(root, caseFile));
  const name = /^name:\s*(\S+)\s*$/m.exec(cy)?.[1];
  if (name !== c) err(caseFile, `name "${name ?? ''}" must match folder "${c}"`);
  const scaffold = /^\s*scaffold_script:\s*(\S+)\s*$/m.exec(cy)?.[1];
  if (scaffold && !exists(path.join(root, dir, scaffold))) err(caseFile, `scaffold_script "${scaffold}" missing`);
  if (!exists(path.join(root, dir, 'prompt.md'))) err(`${dir}/prompt.md`, 'missing');
  const graders = listMd(`${dir}/graders`);
  if (!graders.length) err(`${dir}/graders`, 'no grader files');
  for (const g of graders) {
    const gf = `${dir}/graders/${g}`, fm = frontmatter(gf);
    if (!fm) continue;
    if (!GRADER_TYPES.has(fm.type)) { err(gf, `type "${fm.type ?? ''}" must be one of ${[...GRADER_TYPES].join(', ')}`); continue; }
    for (const k of REQUIRED[fm.type]) if (!fm[k]) err(gf, `${fm.type} grader needs "${k}"`);
    for (const p of graderProblems(graderTree(readText(path.join(root, gf))))) err(gf, p);
    for (const [k, fl] of [['pattern', fm.flags ?? ''], ['input_match', '']]) {
      if (fm[k] && fm[k] !== '(block)') { try { new RegExp(fm[k], fl); } catch (e) { err(gf, `${k} is not a valid RegExp (${e.message})`); } }
    }
  }
}
}
