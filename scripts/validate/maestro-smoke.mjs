// Section 8m: smoke tests for scripts/maestro-run.mjs and scripts/maestro/lib.mjs (mock codex and agy, temp HOME, temp git repo).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const CODEX_MOCK = `import fs from 'fs';
import path from 'path';
const a = process.argv.slice(2);
const val = (f) => a[a.indexOf(f) + 1];
if (a[0] === '--version') { console.log('codex-cli 0.172.0'); process.exit(0); }
if (a[0] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }
fs.appendFileSync(process.env.MOCK_MARKER, 'codex\\n');
const joined = a.join(' ');
if (process.env.MOCK_ARGV_FILE) fs.writeFileSync(process.env.MOCK_ARGV_FILE, JSON.stringify(a));
for (const need of ['exec', '--ephemeral', '--json', '--output-schema', 'sandbox_workspace_write.exclude_slash_tmp=true', 'sandbox_workspace_write.exclude_tmpdir_env_var=true', 'workspace-write']) {
  if (!joined.includes(need)) process.exit(6);
}
const dir = val('-C');
const out = val('-o');
const mode = process.env.MOCK_MODE;
process.stdin.resume();
process.stdin.on('data', () => {});
process.stdin.on('end', () => {
  if (mode === 'quota') {
    console.log(JSON.stringify({ type: 'turn.failed', error: { message: 'Your workspace is out of credits. Ask your workspace owner to refill in order to continue.' } }));
    process.exit(1);
  }
  if (process.env.MOCK_ASSERT_FILE) {
    const t = fs.readFileSync(path.join(dir, process.env.MOCK_ASSERT_FILE), 'utf8');
    if (!t.includes(process.env.MOCK_ASSERT_TEXT)) process.exit(3);
  }
  const f = process.env.MOCK_FILE;
  fs.appendFileSync(path.join(dir, f), 'changed by codex\\n');
  if (mode === 'extra') fs.writeFileSync(path.join(dir, 'extra.txt'), 'extra\\n');
  if (mode === 'repoedit') fs.appendFileSync(path.join(process.env.MOCK_REPO, 'a.txt'), 'user edit\\n');
  fs.writeFileSync(out, JSON.stringify({ status: 'done', files_changed: [f], tests: '', notes: 'mock' }));
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1234, output_tokens: 56 } }));
  process.exit(0);
});
`;

const AGY_MOCK = `import fs from 'fs';
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('1.5.16'); process.exit(0); }
if (a[0] === 'models') { console.log('gemini-4-neon-high\\tNeon High\\nclaude-opus-5-5-high\\tOpus\\ngemini-4-neon-medium\\tNeon Medium'); process.exit(0); }
fs.appendFileSync(process.env.MOCK_MARKER, 'agy\\n');
for (const need of ['--print=', '--input-format', '--output-format', '--settings', '--json-schema', '--model']) {
  if (!a.includes(need)) process.exit(6);
}
if (fs.readdirSync(process.cwd()).length !== 0) process.exit(7);
let stdin = '';
process.stdin.on('data', (d) => { stdin += d; });
process.stdin.on('end', () => {
  const ev = JSON.parse(stdin.split('\\n')[0]);
  if (ev.event !== 'user' || ev.message.role !== 'user') process.exit(4);
  const prompt = ev.message.content;
  if (process.env.MOCK_STDIN_FILE) fs.writeFileSync(process.env.MOCK_STDIN_FILE, prompt);
  if (process.env.MOCK_EXPECT && !prompt.includes(process.env.MOCK_EXPECT)) process.exit(4);
  if (process.env.MOCK_FORBID && prompt.includes(process.env.MOCK_FORBID)) process.exit(5);
  console.log(JSON.stringify({ event: 'progress', text: 'thinking' }));
  if (process.env.MOCK_MODE === 'denied') {
    console.error('jetski: no output produced - a tool required the "command" permission');
    console.log(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: '', structured_output: null, usage: { input_tokens: 10, output_tokens: 1 } } }));
    process.exit(0);
  }
  console.log(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'ok', structured_output: { status: 'done', findings: [{ file: 'a.txt', line: 1, severity: 'low', issue: 'mock finding' }], notes: '' }, usage: { input_tokens: 1000, output_tokens: 50 } } }));
  process.exit(0);
});
`;

export async function run(ctx) {
  const { root, err, exists } = ctx;
  const runnerPath = path.join(root, 'scripts', 'maestro-run.mjs');
  const libPath = path.join(root, 'scripts', 'maestro', 'lib.mjs');
  if (!exists(runnerPath) || !exists(libPath)) {
    err('scripts/maestro-run.mjs', 'missing, cannot smoke test');
    return;
  }
  const RUN = 'scripts/maestro-run.mjs';
  const LIB = 'scripts/maestro/lib.mjs';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const chk = (file, name, got, want) => {
    if (!same(got, want)) err(file, `${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  };

  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'orch-maestro-')));
  try {
    // ---- T1 acceptance examples (pure functions) ----
    const lib = await import(pathToFileURL(libPath).href);
    const L = (name, got, want) => chk(LIB, name, got, want);
    const quotaMsg = 'Your workspace is out of credits. Ask your workspace owner to refill in order to continue.';
    L('classifyCodex quota', lib.classifyCodex({ exitCode: 1, events: [{ type: 'turn.failed', error: { message: quotaMsg } }] }).status, 'QUOTA');
    const cok = lib.classifyCodex({ exitCode: 0, events: [{ type: 'turn.completed', usage: { input_tokens: 226681, output_tokens: 1420 } }] });
    L('classifyCodex ok status', cok.status, 'ok');
    L('classifyCodex ok tokens', cok.tokens, { input: 226681, output: 1420 });
    L('classifyCodex retried rate limit then completed', lib.classifyCodex({ exitCode: 0, events: [{ type: 'error', message: 'stream error: rate limit, retrying' }, { type: 'turn.completed', usage: { input_tokens: 5, output_tokens: 1 } }] }).status, 'ok');
    L('classifyCodex exit 2', lib.classifyCodex({ exitCode: 2, events: [] }).status, 'FAIL');
    L('classifyGemini denied', lib.classifyGemini({ exitCode: 0, result: { status: 'SUCCESS', structured_output: null }, stderr: 'jetski: no output produced — a tool required the "command" permission' }).status, 'DENIED');
    L('classifyGemini ok', lib.classifyGemini({ exitCode: 0, result: { status: 'SUCCESS', structured_output: { status: 'done', findings: [] } }, stderr: '' }).status, 'ok');
    L('classifyGemini quota', lib.classifyGemini({ exitCode: 1, result: null, stderr: 'Error: 429 RESOURCE_EXHAUSTED' }).status, 'QUOTA');
    L('classifyGemini fail', lib.classifyGemini({ exitCode: 1, result: null, stderr: 'flag needs an argument: -p' }).status, 'FAIL');
    L('isSecretPath .env.local', lib.isSecretPath('.env.local'), true);
    L('isSecretPath keys/id_rsa', lib.isSecretPath('keys/id_rsa'), true);
    L('isSecretPath a/b/.npmrc', lib.isSecretPath('a/b/.npmrc'), true);
    L('isSecretPath src/env.ts', lib.isSecretPath('src/env.ts'), false);
    const avail = ['gemini-4-neon-high', 'gemini-4-neon-medium'];
    L('resolveGeminiModel high', lib.resolveGeminiModel({ wanted: '', effort: 'high', available: avail }), 'gemini-4-neon-high');
    L('resolveGeminiModel low falls back to high', lib.resolveGeminiModel({ wanted: '', effort: 'low', available: avail }), 'gemini-4-neon-high');
    let threw = false;
    try { lib.resolveGeminiModel({ wanted: 'claude-opus-5-5-high', effort: 'high', available: avail }); } catch { threw = true; }
    L('resolveGeminiModel rejects claude', threw, true);
    const bp = lib.buildReviewPrompt({ instructions: 'review', files: [{ path: 'a.js', text: 'x\ny' }], diff: '', maxKB: 10 });
    L('buildReviewPrompt file header', bp.prompt.includes('=== FILE: a.js ==='), true);
    L('buildReviewPrompt line 1', bp.prompt.includes('1\tx'), true);
    L('buildReviewPrompt line 2', bp.prompt.includes('2\ty'), true);
    const bs = lib.buildReviewPrompt({ instructions: 'review', files: [{ path: '.env', text: 'SECRET_TOKEN=abc123' }], diff: '', maxKB: 10 });
    L('buildReviewPrompt skipped', bs.skipped, ['.env']);
    L('buildReviewPrompt secret text absent', bs.prompt.includes('SECRET_TOKEN'), false);
    const now = new Date('2026-11-25T10:00:00Z');
    L('parseResetTime explicit', lib.parseResetTime('Usage limit reached. Try again at 2026-11-25T18:00:00Z.', now).getTime(), Date.parse('2026-11-25T18:00:00Z'));
    L('parseResetTime default', lib.parseResetTime('out of credits', now).getTime(), now.getTime() + 5 * 3600 * 1000);

    // ---- temp environment ----
    const home = path.join(tmp, 'home');
    const repo = path.join(tmp, 'repo');
    const bin = path.join(tmp, 'bin');
    for (const d of [home, repo, bin]) fs.mkdirSync(d, { recursive: true });
    const codexMock = path.join(bin, 'codex-mock.mjs');
    const agyMock = path.join(bin, 'agy-mock.mjs');
    fs.writeFileSync(codexMock, CODEX_MOCK);
    fs.writeFileSync(agyMock, AGY_MOCK);
    const marker = path.join(tmp, 'marker.txt');
    const argvFile = path.join(tmp, 'codex-argv.json');
    const ledgerFile = path.join(home, '.claude', 'orchestrator', 'maestro-quota.json');
    const gitEnv = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
    const baseEnv = {
      ...process.env, ...gitEnv, HOME: home, USERPROFILE: home, MAESTRO_CODEX_BIN: codexMock, MAESTRO_AGY_BIN: agyMock,
      MOCK_MARKER: marker, MOCK_ARGV_FILE: argvFile, MOCK_STDIN_FILE: '', MOCK_REPO: repo, MOCK_MODE: '', MOCK_FILE: '', MOCK_ASSERT_FILE: '', MOCK_ASSERT_TEXT: '', MOCK_EXPECT: '', MOCK_FORBID: '',
    };
    const git = (args, cwd = repo, input) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, env: baseEnv, input });
    const maestro = (args, env = {}) => {
      const r = spawnSync(process.execPath, [runnerPath, ...args], { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 120000, env: { ...baseEnv, ...env } });
      const lines = (r.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
      let json = null;
      try { json = JSON.parse(lines[lines.length - 1]); } catch { /* reported by the caller */ }
      return { json, lines: lines.length, status: r.status, stderr: r.stderr ?? '' };
    };
    const calls = () => (fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').split('\n').filter(Boolean).length : 0);
    const clearMarker = () => fs.rmSync(marker, { force: true });
    const rd = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
    const wr = (f, t) => fs.writeFileSync(path.join(repo, f), t);
    const index = () => git(['ls-files', '-s']).stdout;
    const treeState = () => JSON.stringify({ s: git(['status', '--porcelain=v1', '--untracked-files=all']).stdout, a: rd('a.txt'), b: rd('b.txt'), c: rd('c.txt'), i: index() });
    const resetRepo = () => { git(['reset', '-q', '--hard']); git(['clean', '-fdq']); };

    const A0 = 'line1\nline2\nline3\n';
    git(['init', '-q']);
    git(['config', 'core.autocrlf', 'false']);
    git(['config', 'user.name', 't']);
    git(['config', 'user.email', 't@t']);
    wr('a.txt', A0);
    wr('b.txt', 'b1\nb2\n');
    wr('c.txt', 'c1\nc2\n');
    wr('.env', 'SECRET_TOKEN=abc123\n');
    git(['add', '-A']);
    const cm = git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init']);
    if (cm.status !== 0) {
      err(RUN, `temp repo commit failed: ${(cm.stderr ?? '').trim()}`);
      return;
    }
    const briefFile = path.join(tmp, 'brief.md');
    fs.writeFileSync(briefFile, 'Append a line.\n');
    const promptFile = path.join(tmp, 'prompt.md');
    fs.writeFileSync(promptFile, 'Review the files.\n');

    const R = (name, got, want) => chk(RUN, name, got, want);
    const codex = (task, files, env, extra = []) => maestro(['codex', '--task', task, '--brief', briefFile, '--files', files, ...extra], env);

    // ---- setup, enable ----
    const su = maestro(['setup']);
    R('setup cmd', su.json?.cmd, 'setup');
    R('setup one line', su.lines, 1);
    R('setup codex login', su.json?.codex?.login, 'ChatGPT');
    R('setup gemini models', su.json?.gemini?.models, ['gemini-4-neon-high', 'gemini-4-neon-medium']);
    R('setup not enabled', su.json?.enabled, false);
    const en = maestro(['enable']);
    R('enable', [en.json?.cmd, en.json?.enabled], ['enable', true]);

    // ---- codex pass ----
    clearMarker();
    const idx0 = index();
    const p1 = codex('pass-a', 'a.txt', { MOCK_MODE: 'pass', MOCK_FILE: 'a.txt' });
    R('codex pass status', p1.json?.status, 'PASS');
    R('codex pass files', p1.json?.files, ['a.txt']);
    R('codex pass tokens', p1.json?.tokens, { input: 1234, output: 56 });
    R('codex pass selfReport', p1.json?.selfReport?.status, 'done');
    R('codex pass marker', calls(), 1);
    if (process.platform === 'win32') {
      let seen = [];
      try { seen = JSON.parse(fs.readFileSync(argvFile, 'utf8')); } catch { /* reported below */ }
      R('codex win32 windows.sandbox flag', seen.includes('windows.sandbox="elevated"'), true);
    }
    R('codex pass working tree', rd('a.txt'), A0 + 'changed by codex\n');
    R('codex pass index unchanged', index(), idx0);
    if (p1.json?.status !== 'PASS') err(RUN, `codex pass: error "${p1.json?.error}", stderr "${p1.stderr.trim().split('\n')[0]}"`);

    // ---- sequential: second task sees the first change ----
    const p2 = codex('pass-b', 'b.txt', { MOCK_MODE: 'pass', MOCK_FILE: 'b.txt', MOCK_ASSERT_FILE: 'a.txt', MOCK_ASSERT_TEXT: 'changed by codex' });
    R('codex sequential status', p2.json?.status, 'PASS');
    R('codex sequential b.txt', rd('b.txt'), 'b1\nb2\nchanged by codex\n');
    R('codex sequential a.txt kept', rd('a.txt'), A0 + 'changed by codex\n');
    R('codex sequential index unchanged', index(), idx0);

    // ---- dirty start ----
    resetRepo();
    wr('a.txt', A0 + 'dirty\n');
    const dirtyA = rd('a.txt');
    const p3 = codex('dirty', 'b.txt', { MOCK_MODE: 'pass', MOCK_FILE: 'b.txt', MOCK_ASSERT_FILE: 'a.txt', MOCK_ASSERT_TEXT: 'dirty' });
    R('codex dirty status', p3.json?.status, 'PASS');
    R('codex dirty a.txt byte-identical', rd('a.txt'), dirtyA);
    R('codex dirty b.txt changed', rd('b.txt'), 'b1\nb2\nchanged by codex\n');
    R('codex dirty index unchanged', index(), idx0);

    // ---- edit during the run ----
    resetRepo();
    const idxClean = index();
    const p4 = codex('edit-during', 'b.txt', { MOCK_MODE: 'repoedit', MOCK_FILE: 'b.txt' });
    R('codex edit-during status', p4.json?.status, 'VIOLATION');
    R('codex edit-during keeps user edit', rd('a.txt'), A0 + 'user edit\n');
    R('codex edit-during nothing applied', rd('b.txt'), 'b1\nb2\n');
    R('codex edit-during index unchanged', index(), idxClean);

    // ---- extra file ----
    resetRepo();
    const before = treeState();
    const p5 = codex('extra', 'b.txt', { MOCK_MODE: 'extra', MOCK_FILE: 'b.txt' });
    R('codex extra status', p5.json?.status, 'VIOLATION');
    R('codex extra extraFiles', p5.json?.extraFiles, ['extra.txt']);
    R('codex extra tree byte-identical', treeState(), before);

    // ---- quota ----
    resetRepo();
    clearMarker();
    const q1 = codex('quota', 'a.txt', { MOCK_MODE: 'quota', MOCK_FILE: 'a.txt' });
    R('codex quota status', q1.json?.status, 'QUOTA');
    R('codex quota marker', calls(), 1);
    let led = null;
    try { led = JSON.parse(fs.readFileSync(ledgerFile, 'utf8')); } catch { /* reported below */ }
    R('codex quota blockedUntil in the future', Date.parse(led?.codex?.blockedUntil ?? '') > Date.now(), true);
    clearMarker();
    const q2 = codex('quota-again', 'a.txt', { MOCK_MODE: 'pass', MOCK_FILE: 'a.txt' });
    R('codex quota second status', q2.json?.status, 'QUOTA');
    R('codex quota second no call', calls(), 0);
    R('codex quota tree untouched', rd('a.txt'), A0);

    // ---- gemini ----
    clearMarker();
    const g1 = maestro(['gemini', '--task', 'rev', '--prompt', promptFile, '--files', 'a.txt,.env', '--diff', 'HEAD'], { MOCK_MODE: 'pass', MOCK_EXPECT: '=== FILE: a.txt ===', MOCK_FORBID: 'SECRET_TOKEN' });
    R('agy pass status', g1.json?.status, 'PASS');
    R('agy pass model', g1.json?.model, 'gemini-4-neon-high');
    R('agy pass findings', g1.json?.findings?.map((f) => f.issue), ['mock finding']);
    R('agy pass skipped', g1.json?.skipped, ['.env']);
    R('agy pass marker', calls(), 1);
    if (g1.json?.status !== 'PASS') err(RUN, `agy pass: error "${g1.json?.error}"`);
    const g2 = maestro(['gemini', '--task', 'den', '--prompt', promptFile, '--files', 'a.txt'], { MOCK_MODE: 'denied' });
    R('agy denied status', g2.json?.status, 'DENIED');
    try { led = JSON.parse(fs.readFileSync(ledgerFile, 'utf8')); } catch { led = null; }
    R('agy runs counted', led?.gemini?.runs, 2);

    // ---- gemini secret filter: diff.noprefix, modified .env, rename away from .env ----
    resetRepo();
    git(['config', 'diff.noprefix', 'true']);
    wr('.env', 'SECRET_TOKEN=abc123\nSECRET_NEW=zzz999\n');
    wr('a.txt', A0 + 'visible change\n');
    const stdinFile = path.join(tmp, 'agy-stdin.txt');
    const promptSeen = () => (fs.existsSync(stdinFile) ? fs.readFileSync(stdinFile, 'utf8') : '');
    const g3 = maestro(['gemini', '--task', 'noprefix', '--prompt', promptFile, '--diff', 'HEAD'], { MOCK_MODE: 'pass', MOCK_STDIN_FILE: stdinFile });
    R('agy noprefix status', g3.json?.status, 'PASS');
    R('agy noprefix .env skipped', g3.json?.skipped?.includes('.env'), true);
    R('agy noprefix secret text absent', /SECRET_TOKEN|SECRET_NEW|zzz999|abc123/.test(promptSeen()), false);
    R('agy noprefix visible change kept', promptSeen().includes('visible change'), true);
    resetRepo();
    fs.rmSync(stdinFile, { force: true });
    git(['mv', '.env', 'config.txt']);
    const g4 = maestro(['gemini', '--task', 'rename', '--prompt', promptFile, '--diff', 'HEAD'], { MOCK_MODE: 'pass', MOCK_STDIN_FILE: stdinFile });
    R('agy rename status', g4.json?.status, 'PASS');
    R('agy rename secret text absent', /SECRET_TOKEN|abc123/.test(promptSeen()), false);
    git(['config', '--unset', 'diff.noprefix']);
    resetRepo();
    R('agy empty folder removed after run', fs.existsSync(path.join(g4.json?.log ?? '', '..', '..', 'empty', g4.json?.runId ?? 'x')), false);

    // ---- model guard, disabled ----
    clearMarker();
    const mg = maestro(['gemini', '--task', 'guard', '--prompt', promptFile, '--model', 'claude-opus-5-5-high'], { MOCK_MODE: 'pass' });
    R('model guard status', mg.json?.status, 'FAIL');
    R('model guard error', /only gemini models/.test(mg.json?.error ?? ''), true);
    R('model guard no call', calls(), 0);
    const dis = maestro(['disable']);
    R('disable', [dis.json?.cmd, dis.json?.enabled], ['disable', false]);
    const d1 = codex('off', 'a.txt', { MOCK_MODE: 'pass', MOCK_FILE: 'a.txt' });
    const d2 = maestro(['gemini', '--task', 'off', '--prompt', promptFile], { MOCK_MODE: 'pass' });
    R('disabled codex status', d1.json?.status, 'DISABLED');
    R('disabled gemini status', d2.json?.status, 'DISABLED');
    R('disabled no call', calls(), 0);

    // ---- applyPatch direct test (CONFLICT is not reachable through the runner) ----
    resetRepo();
    wr('a.txt', 'line1\ntwo\nline3\n');
    const patchFile = path.join(tmp, 'p.diff');
    fs.writeFileSync(patchFile, git(['diff']).stdout);
    resetRepo();
    const okAp = lib.applyPatch({ tree: repo, patchFile });
    R('applyPatch clean ok', okAp.ok, true);
    R('applyPatch clean content', rd('a.txt'), 'line1\ntwo\nline3\n');
    R('applyPatch clean index unchanged', index(), idxClean);
    resetRepo();
    wr('a.txt', 'line1\nother\nline3\n');
    const confl = rd('a.txt');
    const idxC = index();
    const bad = lib.applyPatch({ tree: repo, patchFile });
    R('applyPatch conflict ok flag', bad.ok, false);
    R('applyPatch conflict has error', typeof bad.error === 'string' && bad.error.length > 0, true);
    R('applyPatch conflict file byte-identical', rd('a.txt'), confl);
    R('applyPatch conflict index unchanged', index(), idxC);
  } catch (e) {
    err('scripts/maestro-run.mjs', `smoke crashed: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
