// Sections 8b-8j: smoke tests for scripts/*.mjs (digest, long-session, budget, guard-review, trace-tokens, eval-compare, eval-select, otel-export, plan-dag).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

export async function run(ctx) {
const { root, err, exists, readText, runHook, rmQuiet } = ctx;

// 8b. Script smoke tests: digest.mjs and long-session.mjs
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-validate-'));
  const sidA = `validate-${process.pid}-${Date.now()}`;
  const sidB = `${sidA}-b`;
  const sidC = `${sidA}-c`;
  const sidD = `${sidA}-d`;
  const sidE = `${sidA}-e`;
  const markers = [sidA, sidB, sidC, sidD, sidE, `${sidA}-f`, `${sidA}-m`, `${sidA}-n`].flatMap((s) => [path.join(os.tmpdir(), `orchestrator-long-${s}`), path.join(os.tmpdir(), `orchestrator-long-${s}.count`), path.join(os.tmpdir(), `orchestrator-long-${s}.growth`)]);
  markers.push(...['g', 'h', 'i', 'j', 'k'].flatMap((s) => [path.join(os.tmpdir(), `orchestrator-long-${sidA}-${s}`), path.join(os.tmpdir(), `orchestrator-long-${sidA}-${s}.count`), path.join(os.tmpdir(), `orchestrator-long-${sidA}-${s}.growth`)]));
  try {
    const digestPath = path.join(root, 'scripts', 'digest.mjs');
    if (!exists(digestPath)) {
      err('scripts/digest.mjs', 'missing, cannot smoke test');
    } else {
      const transcript = path.join(tmp, 'digest.jsonl');
      const lines = [
        { type: 'user', message: { content: [{ type: 'text', text: '<system-reminder>reminder-x</system-reminder>hello' }] } },
        { type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'world' }, { type: 'tool_use', id: 't1', name: 'Bash', input: {} }] } },
        { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
        { type: 'assistant', isSidechain: true, message: { id: 'm2', content: [{ type: 'text', text: 'secret' }] } },
        { type: 'user', isMeta: true, message: { content: 'meta' } },
        { type: 'user', message: { content: '<command-message>x</command-message><command-name>/orchestrator:on</command-name><command-args>do X</command-args>' } },
        { type: 'user', message: { content: 'talk about <command-name> tags' } },
        { type: 'user', message: { content: '<system-reminder><command-name>/x</command-name></system-reminder>real question' } },
      ];
      fs.writeFileSync(transcript, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
      const d = spawnSync(process.execPath, [digestPath, transcript], { encoding: 'utf8', cwd: root });
      if (d.status !== 0) err('scripts/digest.mjs', `smoke "digest": exit ${d.status}, stderr: ${(d.stderr ?? '').split('\n')[0]}`);
      const out = d.stdout ?? '';
      for (const want of ['U: hello', 'A: world', 'U: /orchestrator:on do X', 'U: talk about <command-name> tags', 'U: real question']) {
        if (!out.includes(want)) err('scripts/digest.mjs', `smoke "digest": expected "${want}" in stdout`);
      }
      for (const bad of ['system-reminder', 'secret', 'meta', 'U: /x']) {
        if (out.includes(bad)) err('scripts/digest.mjs', `smoke "digest": stdout must not contain "${bad}"`);
      }
    }

    const longTranscript = path.join(tmp, 'long.jsonl');
    fs.writeFileSync(longTranscript, 'x'.repeat(10));
    const longPayload = (sid) => ({ hook_event_name: 'UserPromptSubmit', session_id: sid, transcript_path: longTranscript, cwd: root });
    let r1 = runHook('long-session.mjs', longPayload(sidA), { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '' });
    if (r1 && r1.stdout.trim() !== '') err('hooks/long-session.mjs', 'smoke "long 10 bytes": expected empty stdout');
    let r2 = runHook('long-session.mjs', longPayload(sidB), { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '5' });
    if (r2 && !r2.stdout.includes('systemMessage')) err('hooks/long-session.mjs', 'smoke "long limit 5": expected systemMessage in stdout');
    let r3 = runHook('long-session.mjs', longPayload(sidB), { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '5' });
    if (r3 && r3.stdout.trim() !== '') err('hooks/long-session.mjs', 'smoke "long repeat": expected empty stdout (marker exists)');
    const delegTranscript = path.join(tmp, 'deleg.jsonl');
    const delegLines = [
      { type: 'user', message: { content: 'x'.repeat(300 * 1024) } },
      { type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'x', prompt: 'p' } }] } },
      { type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'x', prompt: 'p' } }] } },
    ];
    fs.writeFileSync(delegTranscript, delegLines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    const r6 = runHook('long-session.mjs', { hook_event_name: 'UserPromptSubmit', session_id: sidE, transcript_path: delegTranscript, cwd: root }, { ORCH_LONG: '', ORCH_LONG_TOKENS: '', ORCH_LONG_BYTES: '999999999', ORCH_LONG_DELEGATIONS: '2' });
    if (r6 && !r6.stdout.includes('2 delegations')) err('hooks/long-session.mjs', 'smoke "long delegations": expected "2 delegations" in stdout');
    const sidF = `${sidA}-f`;
    const sidFCount = path.join(os.tmpdir(), `orchestrator-long-${sidF}.count`);
    const incTranscript = path.join(tmp, 'inc.jsonl');
    const incLine = JSON.stringify({ type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'x', prompt: 'p' } }] } }) + '\n';
    fs.writeFileSync(incTranscript, incLine);
    const incPayload = { hook_event_name: 'UserPromptSubmit', session_id: sidF, transcript_path: incTranscript, cwd: root };
    const incEnv = { ORCH_LONG: '', ORCH_LONG_TOKENS: '', ORCH_LONG_BYTES: '999999999', ORCH_LONG_DELEGATIONS: '2' };
    const r7 = runHook('long-session.mjs', incPayload, incEnv);
    if (r7 && r7.stdout.trim() !== '') err('hooks/long-session.mjs', 'smoke "long incremental 1": expected empty stdout');
    if (!fs.existsSync(sidFCount)) err('hooks/long-session.mjs', 'smoke "long incremental 1": expected .count file');
    fs.appendFileSync(incTranscript, incLine);
    const r8 = runHook('long-session.mjs', incPayload, incEnv);
    if (r8 && !r8.stdout.includes('2 delegations')) err('hooks/long-session.mjs', 'smoke "long incremental 2": expected "2 delegations" in stdout');
    if (fs.existsSync(sidFCount)) err('hooks/long-session.mjs', 'smoke "long incremental 2": expected .count file removed');

    // IC-020: with ORCH_STATE_DIR empty, markers go to the private per-user dir (0700 on non-Windows)
    const sidS = `${sidA}-s`;
    const stateTag = String(process.getuid?.() ?? os.userInfo().username).replace(/[^A-Za-z0-9_-]/g, '');
    const stateMarker = path.join(os.tmpdir(), `orchestrator-${stateTag}`, `orchestrator-long-${sidS}`);
    const rs = runHook('long-session.mjs', longPayload(sidS), { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '5', ORCH_STATE_DIR: '' });
    if (rs && !rs.stdout.includes('systemMessage')) err('hooks/long-session.mjs', 'smoke "long state dir": expected systemMessage in stdout');
    if (!fs.existsSync(stateMarker)) err('hooks/long-session.mjs', 'smoke "long state dir": expected marker in per-user state dir');
    if (process.platform !== 'win32' && fs.existsSync(stateMarker) && (fs.statSync(path.dirname(stateMarker)).mode & 0o777) !== 0o700) err('hooks/long-session.mjs', 'smoke "long state dir": expected state dir mode 0700');
    fs.rmSync(stateMarker, { force: true });
    fs.rmSync(`${stateMarker}.count`, { force: true });

    const usageTranscript = (cacheRead2) => {
      const usageLines = [
        { type: 'assistant', message: { usage: { input_tokens: 10, cache_read_input_tokens: 1000 } } },
        { type: 'assistant', message: { usage: { input_tokens: 10, cache_read_input_tokens: cacheRead2 } } },
      ];
      return usageLines.map((l) => JSON.stringify(l)).join('\n') + '\n';
    };
    const growthPath = path.join(tmp, 'growth.jsonl');
    fs.writeFileSync(growthPath, usageTranscript(131000));
    const r4 = runHook('long-session.mjs', { hook_event_name: 'UserPromptSubmit', session_id: sidC, transcript_path: growthPath, cwd: root }, { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '999999999', ORCH_LONG_TOKENS: '' });
    if (r4 && (!r4.stdout.includes('systemMessage') || !r4.stdout.includes('+130k'))) err('hooks/long-session.mjs', 'smoke "long usage growth": expected systemMessage with "+130k" in stdout');
    const flatPath = path.join(tmp, 'flat.jsonl');
    fs.writeFileSync(flatPath, usageTranscript(11000));
    const r5 = runHook('long-session.mjs', { hook_event_name: 'UserPromptSubmit', session_id: sidD, transcript_path: flatPath, cwd: root }, { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '5', ORCH_LONG_TOKENS: '' });
    if (r5 && r5.stdout.trim() !== '') err('hooks/long-session.mjs', 'smoke "long usage flat": expected empty stdout (usage present overrides bytes)');

    {
      // usage growth is incremental: the scanned offset and first/last usage are cached; only appended bytes are read on the next prompt
      const usageLine = (cacheRead) => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 10, cache_read_input_tokens: cacheRead } } }) + '\n';
      const incGrowth = path.join(tmp, 'inc-growth.jsonl');
      const growthCache = path.join(os.tmpdir(), `orchestrator-long-${sidA}-m.growth`);
      const growthEnv = { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '999999999', ORCH_LONG_TOKENS: '' };
      const growthRun = (sid) => runHook('long-session.mjs', { hook_event_name: 'UserPromptSubmit', session_id: sid, transcript_path: incGrowth, cwd: root }, growthEnv);
      fs.writeFileSync(incGrowth, [10000, 10100, 10200].map(usageLine).join(''));
      const g1 = growthRun(`${sidA}-m`);
      if (g1 && g1.stdout.trim() !== '') err('hooks/long-session.mjs', 'smoke "long growth incremental 1": expected empty stdout');
      let cached = null;
      try {
        cached = JSON.parse(fs.readFileSync(growthCache, 'utf8'));
      } catch {
        err('hooks/long-session.mjs', 'smoke "long growth incremental 1": expected .growth cache file');
      }
      if (cached && cached.offset !== fs.statSync(incGrowth).size) err('hooks/long-session.mjs', 'smoke "long growth incremental 1": expected cached offset at end of file');
      // same-length edit of the first line, before the cached offset: a full re-read would see a different first usage
      fs.writeFileSync(incGrowth, [99999, 10100, 10200].map(usageLine).join(''));
      fs.appendFileSync(incGrowth, usageLine(141000));
      const g2 = growthRun(`${sidA}-m`);
      if (g2 && !g2.stdout.includes('+131k')) err('hooks/long-session.mjs', 'smoke "long growth incremental 2": expected "+131k" from the cached first usage plus appended bytes');
      // shrunk file: cache is ignored and the bounded read gives the right answer
      fs.writeFileSync(path.join(os.tmpdir(), `orchestrator-long-${sidA}-n.growth`), JSON.stringify({ offset: 9999, first: 1, last: 2, check: '' }));
      fs.writeFileSync(incGrowth, [10000, 141000].map(usageLine).join(''));
      const g3 = growthRun(`${sidA}-n`);
      if (g3 && !g3.stdout.includes('+131k')) err('hooks/long-session.mjs', 'smoke "long growth shrunk file": expected "+131k" via the bounded read');
    }

    {
      // writeAtomic: replaces content, leaves no temp file, never follows a symlink at the target, fails silently on a stale temp file
      const { writeAtomic } = await import(pathToFileURL(path.join(root, 'hooks', 'lib.mjs')).href);
      const wa = path.join(tmp, 'atomic.txt');
      fs.writeFileSync(wa, 'old');
      writeAtomic(wa, 'new');
      if (fs.readFileSync(wa, 'utf8') !== 'new') err('hooks/lib.mjs', 'writeAtomic: expected the target replaced with new content');
      if (fs.readdirSync(tmp).some((f) => f.startsWith('atomic.txt.') && f.endsWith('.tmp'))) err('hooks/lib.mjs', 'writeAtomic: expected no leftover temp file');
      const victim = path.join(tmp, 'atomic-victim.txt');
      const link = path.join(tmp, 'atomic-link.txt');
      fs.writeFileSync(victim, 'keep');
      let linked = false;
      try { fs.symlinkSync(victim, link); linked = true; } catch { /* no symlink permission: skip */ }
      if (linked) {
        writeAtomic(link, 'new');
        if (fs.readFileSync(victim, 'utf8') !== 'keep') err('hooks/lib.mjs', 'writeAtomic: expected a symlink target to stay untouched');
      }
      const stale = path.join(tmp, 'atomic-stale.txt');
      fs.writeFileSync(stale, 'old');
      fs.writeFileSync(`${stale}.${process.pid}.tmp`, 'x');
      writeAtomic(stale, 'new');
      if (fs.readFileSync(stale, 'utf8') !== 'old') err('hooks/lib.mjs', 'writeAtomic: expected a silent no-op when the temp file already exists');
    }

    // long repeat smoke: [suffix, ORCH_LONG_REPEAT, write marker first, [growth, expect ('' = empty stdout), noReminder]]
    const repeatSteps = [
      ['g', '', false, [[130000, '+130k', true], [130000, '', false], [260000, 'reminder 1 of 2', false], [260000, '', false], [400000, 'reminder 2 of 2', false], [900000, '', false]]],
      ['h', 'off', false, [[260000, '+260k', true], [500000, '', false]]],
      ['i', '', true, [[130000, '', false], [260000, 'reminder 1 of 2', false]]],
      ['j', '', false, [[450000, '+450k', true], [460000, '', false]]],
      ['k', '200000,abc,50000', false, [[130000, '+130k', false], [210000, 'reminder 1 of 1', false], [999000, '', false]]],
    ];
    const repeatPath = path.join(tmp, 'repeat.jsonl');
    for (const [sfx, rep, pre, steps] of repeatSteps) {
      if (pre) fs.writeFileSync(path.join(os.tmpdir(), `orchestrator-long-${sidA}-${sfx}`), '');
      steps.forEach(([growth, want, noReminder], idx) => {
        const n = idx + 1;
        fs.writeFileSync(repeatPath, usageTranscript(growth + 1000));
        const rr = runHook('long-session.mjs', { hook_event_name: 'UserPromptSubmit', session_id: `${sidA}-${sfx}`, transcript_path: repeatPath, cwd: root }, { ORCH_LONG: '', ORCH_LONG_DELEGATIONS: '', ORCH_LONG_BYTES: '999999999', ORCH_LONG_TOKENS: '', ORCH_LONG_REPEAT: rep });
        if (!rr) return;
        const o = rr.stdout ?? '';
        const okWant = want === '' ? o.trim() === '' : o.includes(want);
        const okRem = !noReminder || !o.includes('reminder');
        if (!okWant || !okRem) err('hooks/long-session.mjs', `smoke "long repeat ${sfx} step ${n}": expected ${want === '' ? 'empty stdout' : `"${want}"`}${noReminder ? ' without "reminder"' : ''}`);
      });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const m of markers) fs.rmSync(m, { force: true });
  }
}

// 8c. Smoke tests: scripts/budget.mjs and hooks/guard-review.mjs
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-budget-'));
  try {
    const budgetPath = path.join(root, 'scripts', 'budget.mjs');
    if (!exists(budgetPath)) {
      err('scripts/budget.mjs', 'missing, cannot smoke test');
    } else {
      const J = JSON.stringify;
      const launch = (id, name) => J({ type: 'assistant', message: { id: 'm' + id, content: [{ type: 'tool_use', id, name: name || 'Agent', input: { subagent_type: 'orchestrator:haiku-coder', prompt: 'p' } }] } });
      const result = (id, tur) => J({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'r' }] }, toolUseResult: tur });
      const block = (a, n) => '<task-notification>\n<task-id>' + a + '</task-id>\n<status>completed</status>\n<usage><subagent_tokens>' + n + '</subagent_tokens><tool_uses>3</tool_uses></usage>\n</task-notification>';
      const qop = (a, n) => J({ type: 'queue-operation', operation: 'enqueue', content: block(a, n) });
      const unote = (a, n) => J({ type: 'user', message: { content: block(a, n) } });
      const A = [launch('tu1'), result('tu1', { status: 'async_launched', agentId: 'ag1' }), qop('ag1', 12000), unote('ag1', 12000), launch('tu2', 'Task'), result('tu2', { status: 'completed', agentId: 'ag2', totalTokens: 30500 }), J({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'tool_use', id: 'tu9', name: 'Agent', input: {} }] } }), unote('agX', 99999), unote('ag1', 15000)];
      const U = [launch('tu3'), result('tu3', { status: 'async_launched', agentId: 'ag3' })];
      const w = (f, L) => fs.writeFileSync(path.join(tmp, f), L.length ? L.join('\n') + '\n' : '');
      w('known.jsonl', A);
      w('mixed.jsonl', A.concat(U));
      w('m.jsonl', A);
      const bud = (args) => {
        const r = spawnSync(process.execPath, [budgetPath, ...args], { encoding: 'utf8', cwd: root });
        return { out: (r.stdout ?? '').trim(), status: r.status };
      };
      const chk = (name, got, want) => {
        if (got !== want) err('scripts/budget.mjs', `smoke "${name}": expected "${want}", got "${got}"`);
      };
      const known = path.join(tmp, 'known.jsonl');
      const mixed = path.join(tmp, 'mixed.jsonl');
      const m = path.join(tmp, 'm.jsonl');
      chk('known', bud([known]).out, 'BUDGET: spent 46k (2 agents)');
      chk('mixed limit 40k', bud([mixed, '--limit', '40k']).out, 'BUDGET: spent 46k+? (3 agents, 1 without usage) of 40k: OVER');
      chk('known limit 100000k', bud([known, '--limit', '100000k']).out, 'BUDGET: spent 46k (2 agents) of 100000k: UNDER');
      chk('mixed limit 100000k', bud([mixed, '--limit', '100000k']).out, 'BUDGET: spent 46k+? (3 agents, 1 without usage) of 100000k: UNKNOWN');
      chk('mark unreadable',bud([path.join(tmp, 'none.jsonl'), '--mark']).out, 'BUDGET: mark ? (transcript unreadable)');
      chk('from invalid mark', bud([known, '--from', '?', '--limit', '10k']).out, 'BUDGET: spent ? (no valid mark) of 10k: UNKNOWN');
      const missingRes = bud([path.join(tmp, 'none.jsonl')]);
      chk('missing file', missingRes.out, 'BUDGET: spent ? (transcript unreadable)');
      chk('missing file exit', String(missingRes.status), '0');
      const size = fs.statSync(m).size;
      chk('mark', bud([m, '--mark']).out, `BUDGET: mark ${size}`);
      fs.appendFileSync(m, U.join('\n') + '\n');
      chk('from mark', bud([m, '--from', String(size)]).out, 'BUDGET: spent ? (1 agent, 1 without usage)');

      // --main: last usage per message.id, sidechain skipped, context = last message input + cache
      const am = (id, u, extra = {}) => J({ type: 'assistant', ...extra, message: { id, content: [{ type: 'text', text: 't' }], usage: u } });
      w('main.jsonl', [
        am('m1', { input_tokens: 1000, cache_read_input_tokens: 20000, cache_creation_input_tokens: 3000, output_tokens: 500 }),
        am('m1', { input_tokens: 1000, cache_read_input_tokens: 20000, cache_creation_input_tokens: 3000, output_tokens: 800 }),
        am('m2', { input_tokens: 2000, cache_read_input_tokens: 40000, cache_creation_input_tokens: 1000, output_tokens: 1200 }),
        am('m3', { input_tokens: 99999 }, { isSidechain: true }),
      ]);
      chk('main', bud([path.join(tmp, 'main.jsonl'), '--main']).out, 'MAIN: 2 calls, input 3k, cache-read 60k, cache-write 4k, output 2k, context 43k');
      chk('main known', bud([known, '--main']).out, 'MAIN: 0 calls');
      const missingMain = bud([path.join(tmp, 'none.jsonl'), '--main']);
      chk('main missing file', missingMain.out, 'MAIN: ? (transcript unreadable)');
      chk('main missing file exit', String(missingMain.status), '0');
      w('mainbreak.jsonl', [
        am('b1', { input_tokens: 1000, cache_read_input_tokens: 50000, cache_creation_input_tokens: 0, output_tokens: 100 }),
        am('b2', { input_tokens: 1000, cache_read_input_tokens: 50000, cache_creation_input_tokens: 0, output_tokens: 100 }),
        am('b3', { input_tokens: 1000, cache_read_input_tokens: 1000, cache_creation_input_tokens: 49000, output_tokens: 100 }),
      ]);
      const mainBreak = bud([path.join(tmp, 'mainbreak.jsonl'), '--main']).out;
      chk('main cache-break', mainBreak, 'MAIN: 3 calls, input 3k, cache-read 101k, cache-write 49k, output 0k, context 51k, cache-breaks 1 (calls 3)');
      w('maincompact.jsonl', [
        am('c1', { input_tokens: 1000, cache_read_input_tokens: 50000, output_tokens: 100 }),
        am('c2', { input_tokens: 1000, cache_read_input_tokens: 5000, cache_creation_input_tokens: 2000, output_tokens: 100 }),
      ]);
      const mainCompact = bud([path.join(tmp, 'maincompact.jsonl'), '--main']).out;
      chk('main compaction no break', String(mainCompact.includes('cache-breaks')), 'false');

      // auto mode: newest transcript of the project dir
      const autoCwd = fs.realpathSync(fs.mkdtempSync(path.join(tmp, 'auto-cwd-')));
      const autoCfg = path.join(tmp, 'auto-cfg');
      const autoDir = path.join(autoCfg, 'projects', autoCwd.replace(/[^A-Za-z0-9]/g, '-'));
      fs.mkdirSync(autoDir, { recursive: true });
      const one = (n) => [launch('tu1'), result('tu1', { status: 'completed', agentId: 'ag1', totalTokens: n })].join('\n') + '\n';
      fs.writeFileSync(path.join(autoDir, 'old.jsonl'), one(5000));
      fs.writeFileSync(path.join(autoDir, 'new.jsonl'), one(12000));
      fs.utimesSync(path.join(autoDir, 'old.jsonl'), new Date(Date.now() - 60000), new Date(Date.now() - 60000));
      fs.utimesSync(path.join(autoDir, 'new.jsonl'), new Date(), new Date());
      const auto = (cfg, extra = [], cwd = autoCwd) => {
        const r = spawnSync(process.execPath, [budgetPath, 'auto', ...extra], { encoding: 'utf8', cwd, env: { ...process.env, CLAUDE_CONFIG_DIR: cfg } });
        return (r.stdout ?? '').trim();
      };
      chk('auto newest', auto(autoCfg), 'BUDGET: spent 12k (1 agent)');
      const autoQuiet = spawnSync(process.execPath, [budgetPath, 'auto'], { encoding: 'utf8', cwd: autoCwd, env: { ...process.env, ORCH_DEBUG: '', CLAUDE_CONFIG_DIR: autoCfg } });
      chk('auto stderr silent by default', (autoQuiet.stderr ?? '').trim(), '');
      const autoLoud = spawnSync(process.execPath, [budgetPath, 'auto', '--verbose'], { encoding: 'utf8', cwd: autoCwd, env: { ...process.env, ORCH_DEBUG: '', CLAUDE_CONFIG_DIR: autoCfg } });
      chk('auto --verbose prints path', String((autoLoud.stderr ?? '').startsWith('budget: auto -> ')), 'true');
      const emptyCfg = path.join(tmp, 'empty-cfg');
      fs.mkdirSync(emptyCfg, { recursive: true });
      chk('auto empty', auto(emptyCfg), 'BUDGET: spent ? (transcript unreadable)');
      // a newer non-jsonl file in the project dir is ignored
      fs.writeFileSync(path.join(autoDir, 'notes.txt'), 'not a transcript\n');
      fs.utimesSync(path.join(autoDir, 'notes.txt'), new Date(Date.now() + 60000), new Date(Date.now() + 60000));
      chk('auto ignores non-jsonl', auto(autoCfg), 'BUDGET: spent 12k (1 agent)');
      // existing but empty project dir (no jsonl)
      const emptyProjCfg = path.join(tmp, 'empty-proj-cfg');
      fs.mkdirSync(path.join(emptyProjCfg, 'projects', autoCwd.replace(/[^A-Za-z0-9]/g, '-')), { recursive: true });
      chk('auto empty project dir', auto(emptyProjCfg), 'BUDGET: spent ? (transcript unreadable)');
      // --mark prints the size of the newest jsonl
      chk('auto mark', auto(autoCfg, ['--mark']), `BUDGET: mark ${fs.statSync(path.join(autoDir, 'new.jsonl')).size}`);
      // cwd in a subfolder of the keyed project folder walks up to it
      const autoSub = path.join(autoCwd, 'sub');
      fs.mkdirSync(autoSub, { recursive: true });
      chk('auto from subfolder', auto(autoCfg, [], autoSub), 'BUDGET: spent 12k (1 agent)');
      // session launched above the repo: the transcript lives under the parent dir slug, cwd is inside a git repo below it
      if (spawnSync('git', ['--version']).status === 0) {
        const above = fs.realpathSync(fs.mkdtempSync(path.join(tmp, 'above-')));
        const repoDir = path.join(above, 'repo');
        fs.mkdirSync(repoDir, { recursive: true });
        if (spawnSync('git', ['init', '-q'], { cwd: repoDir }).status === 0) {
          const aboveCfg = path.join(tmp, 'above-cfg');
          const slug = (d) => d.replace(/[^A-Za-z0-9]/g, '-');
          const parentProj = path.join(aboveCfg, 'projects', slug(above));
          fs.mkdirSync(parentProj, { recursive: true });
          fs.writeFileSync(path.join(parentProj, 'parent.jsonl'), one(7000));
          chk('auto parent of git top level', auto(aboveCfg, [], repoDir), 'BUDGET: spent 7k (1 agent)');
          // the closest match still wins over the parent one
          const repoProj = path.join(aboveCfg, 'projects', slug(repoDir));
          fs.mkdirSync(repoProj, { recursive: true });
          fs.writeFileSync(path.join(repoProj, 'repo.jsonl'), one(3000));
          fs.utimesSync(path.join(repoProj, 'repo.jsonl'), new Date(Date.now() - 60000), new Date(Date.now() - 60000));
          chk('auto closest match preferred', auto(aboveCfg, [], repoDir), 'BUDGET: spent 3k (1 agent)');
        }
      }
    }

    // guard-review smoke
    fs.mkdirSync(path.join(tmp, 'docs', 'prd'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs', 'prd', 'exists.md'), '# x\n');
    fs.mkdirSync(path.join(tmp, 'my proj', 'docs', 'prd'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'my proj', 'docs', 'prd', 'exists.md'), '# x\n');
    const review = (agent, prompt, extraEnv = {}) =>
      runHook('guard-review.mjs', {
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        tool_input: { subagent_type: agent, prompt },
        cwd: tmp,
      }, { CLAUDE_PROJECT_DIR: tmp, ...extraEnv });
    const reviewCases = [
      ['review missing path denied', 'orchestrator:opus-reviewer', 'Review docs/prd/no-such-prd-xyz.md', {}, true],
      ['review existing path allowed', 'orchestrator:opus-reviewer', 'Review docs/prd/exists.md', {}, false],
      ['review haiku-coder missing path allowed', 'orchestrator:haiku-coder', 'Review docs/prd/no-such-prd-xyz.md', {}, false],
      ['review glob only allowed', 'orchestrator:opus-reviewer', 'Review docs/prd/*.md', {}, false],
      ['review url only allowed', 'orchestrator:opus-reviewer', 'Review https://example.com/docs/prd/x.md', {}, false],
      ['review ORCH_GUARD=off allowed', 'orchestrator:opus-reviewer', 'Review docs/prd/no-such-prd-xyz.md', { ORCH_GUARD: 'off' }, false],
      ['review absolute existing allowed', 'orchestrator:opus-reviewer', `Review ${path.join(tmp, 'docs', 'prd', 'exists.md')}`, {}, false],
      ['review absolute missing denied', 'orchestrator:opus-reviewer', `Review ${path.join(tmp, 'docs', 'prd', 'nope.md')}`, {}, true],
      ['review absolute with space existing allowed', 'orchestrator:opus-reviewer', `Review ${path.join(tmp, 'my proj', 'docs', 'prd', 'exists.md')} now`, {}, false],
      ['review quoted absolute with space existing allowed', 'orchestrator:opus-reviewer', `Review "${path.join(tmp, 'my proj', 'docs', 'prd', 'exists.md')}" now`, {}, false],
      ['review absolute with space missing denied', 'orchestrator:opus-reviewer', `Review ${path.join(tmp, 'my proj', 'docs', 'prd', 'nope.md')}`, {}, true],
    ];
    for (const [name, agent, prompt, env, deny] of reviewCases) {
      const g = review(agent, prompt, env);
      if (!g) continue;
      const denied = g.stdout.includes('"permissionDecision":"deny"');
      if (deny && !denied) err('hooks/guard-review.mjs', `smoke "${name}": expected deny`);
      if (!deny && g.stdout.trim() !== '') err('hooks/guard-review.mjs', `smoke "${name}": expected empty stdout`);
    }
    // timing guard: the PRD_PATH regex must stay linear on long path-like prompts (measured ~3 ms at 100k chars)
    for (const [name, frag] of [['a/ runs', 'a/'], ['docs/prd fragments', 'docs/prd/']]) {
      const t0 = Date.now();
      const g = review('orchestrator:opus-reviewer', frag.repeat(Math.ceil(400000 / frag.length)));
      if (!g) continue;
      const ms = Date.now() - t0;
      if (g.stdout.trim() !== '') err('hooks/guard-review.mjs', `timing "${name}": expected empty stdout`);
      if (ms > 3000) err('hooks/guard-review.mjs', `timing "${name}": 400k-char prompt took ${ms} ms (limit 3000), PRD_PATH may be superlinear`);
    }
    const hp = path.join(root, 'hooks', 'guard-review.mjs');
    if (exists(hp)) {
      const bad = spawnSync(process.execPath, [hp], { input: 'not json', encoding: 'utf8', cwd: root, env: { ...process.env, ORCH_GUARD: '' } });
      if (bad.status !== 0 || bad.stdout.trim() !== '') err('hooks/guard-review.mjs', 'smoke "review invalid json": expected empty stdout and exit 0');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
// 8d. Smoke tests: scripts/trace-tokens.mjs
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-trace-'));
  try {
    const tracePath = path.join(root, 'scripts', 'trace-tokens.mjs');
    if (!exists(tracePath)) {
      err('scripts/trace-tokens.mjs', 'missing, cannot smoke test');
    } else {
      const J = JSON.stringify;
      const d = tmp;
      const L = [{type:'system',subtype:'init',model:'m-main'},{type:'system',subtype:'task_started',tool_use_id:'tu1',subagent_type:'orchestrator:haiku-coder',prompt:'abc'},{type:'assistant',parent_tool_use_id:'tu1',uuid:'u1',message:{id:'s1',content:[{type:'tool_use',id:'x',name:'Bash',input:{}}],usage:{input_tokens:2,cache_creation_input_tokens:4000,cache_read_input_tokens:6000,output_tokens:5}}},{type:'assistant',parent_tool_use_id:'tu1',uuid:'u2',message:{id:'s2',content:[{type:'text',text:'sub text'}],usage:{input_tokens:2,cache_creation_input_tokens:100,cache_read_input_tokens:10000,output_tokens:5}}},{type:'system',subtype:'task_notification',tool_use_id:'tu1',usage:{total_tokens:10900,tool_uses:1}},{type:'result',num_turns:1,total_cost_usd:0.01,result:'x',modelUsage:{'m-main':{inputTokens:1,outputTokens:1,cacheReadInputTokens:1,cacheCreationInputTokens:1}}},{type:'assistant',parent_tool_use_id:null,uuid:'u3',message:{id:'m1',content:[{type:'text',text:'hello'}],usage:{input_tokens:1,output_tokens:1}}},{type:'result',num_turns:3,total_cost_usd:0.1234,result:'done!',modelUsage:{'m-main':{inputTokens:10,outputTokens:500,cacheReadInputTokens:20000,cacheCreationInputTokens:5000},'m-sub':{inputTokens:2,outputTokens:100,cacheReadInputTokens:6000,cacheCreationInputTokens:4000}}}];
      fs.writeFileSync(path.join(d, 't.jsonl'), L.slice(0, 6).map((x) => J(x)).join('\n') + '\nnot json\n' + L.slice(6).map((x) => J(x)).join('\n') + '\n');
      fs.writeFileSync(path.join(d, 'r.json'), J({ startedAt: '2026-11-05T01:02:03Z', suite: { modelOverride: 'm-main', plugins: [{ version: '9.9.9' }] }, cases: [{ name: 'c1', arms: { with: [{ passed: true, costUsd: 0.5, tracePath: path.join(d, 't.jsonl') }], without: [{ passed: false, tracePath: path.join(d, 'none.jsonl') }] } }] }));
      const trace = (file, extra = []) => {
        const r = spawnSync(process.execPath, [tracePath, file, ...extra], { encoding: 'utf8', cwd: root });
        return { out: (r.stdout ?? '').trim(), status: r.status };
      };
      const chk = (name, got, want) => {
        if (got !== want) err('scripts/trace-tokens.mjs', `smoke "${name}": expected "${want}", got "${got}"`);
      };
      chk('trace lines', trace(path.join(d, 't.jsonl')).out, [
        'TRACE: total 36k tokens, cost $0.1234, turns 3, main m-main out 500, reply 5 chars, main text 5 chars',
        'AGENT: orchestrator:haiku-coder startup 10002 cached 6000 total 10900 tools 1 brief 3',
      ].join('\n'));
      chk('md rows', trace(path.join(d, 'r.json'), ['--md']).out, [
        '| 9.9.9 | 2026-11-05 | c1 | m-main | 1 | 36k | 0.5000 | arm with; pass 1/1; agent startup 10.0-10.0k; reply 5 chars |',
        '| 9.9.9 | 2026-11-05 | c1 | m-main | 1 | ? | ? | arm without; pass 0/1; agent startup -; reply ? chars |',
      ].join('\n'));
      const missing = spawnSync(process.execPath, [tracePath, path.join(d, 'none.jsonl')], { encoding: 'utf8', cwd: root });
      chk('missing file', (missing.stdout ?? '').trim(), 'TRACE: unreadable');
      chk('missing file exit', String(missing.status), '0');
      // tracePath must end in .jsonl: a non-.jsonl file is treated as unreadable (no read, no crash)
      fs.writeFileSync(path.join(d, 'x.txt'), fs.readFileSync(path.join(d, 't.jsonl'), 'utf8'));
      fs.writeFileSync(path.join(d, 'r2.json'), J({ suite: { plugins: [{ version: '9.9.9' }] }, cases: [{ name: 'c2', arms: { with: [{ passed: true, tracePath: path.join(d, 'x.txt') }] } }] }));
      const nonJsonl = spawnSync(process.execPath, [tracePath, path.join(d, 'r2.json')], { encoding: 'utf8', cwd: root });
      chk('non-jsonl tracePath', (nonJsonl.stdout ?? '').trim(), 'RUN: c2 with #1 PASS\nTRACE: unreadable');
      chk('non-jsonl tracePath exit', String(nonJsonl.status), '0');
      const nonJsonlMd = spawnSync(process.execPath, [tracePath, path.join(d, 'r2.json'), '--md'], { encoding: 'utf8', cwd: root });
      chk('non-jsonl tracePath md', (nonJsonlMd.stdout ?? '').trim().includes('| ? | ? |'), true);
      // tracePath folder missing (results moved): the trace with the same basename next to result.json is used
      fs.copyFileSync(path.join(d, 't.jsonl'), path.join(d, 'moved-trace.jsonl'));
      fs.writeFileSync(path.join(d, 'moved.json'), J({ suite: { plugins: [{ version: '9.9.9' }] }, cases: [{ name: 'c3', arms: { with: [{ passed: true, tracePath: path.join(d, 'gone-folder', 'moved-trace.jsonl') }] } }] }));
      const moved = trace(path.join(d, 'moved.json')).out.split('\n');
      if (moved[0] !== 'RUN: c3 with #1 PASS' || !moved[1]?.startsWith('TRACE: total 36k tokens')) err('scripts/trace-tokens.mjs', `smoke "moved tracePath fallback": expected RUN line then token lines, got "${moved.slice(0, 2).join(' | ')}"`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// 8e. Smoke tests: scripts/eval-compare.mjs round trip (temp dirs only)
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-cmp-'));
  try {
    const cmpPath = path.join(root, 'scripts', 'eval-compare.mjs');
    if (!exists(cmpPath)) {
      err('scripts/eval-compare.mjs', 'missing, cannot smoke test');
    } else {
      const J = JSON.stringify;
      const tr = path.join(d, 't.jsonl');
      fs.writeFileSync(tr, [{ type: 'system', subtype: 'init', model: 'm' }, { type: 'result', num_turns: 1, total_cost_usd: 0.1, result: 'x', modelUsage: { m: { inputTokens: 1000, outputTokens: 1000, cacheReadInputTokens: 50000, cacheCreationInputTokens: 48000 } } }].map((x) => J(x)).join('\n') + '\n');
      const res = path.join(d, 'r.json');
      fs.writeFileSync(res, J({ suite: { modelOverride: 'm' }, cases: [{ name: 'c1', arms: { with: [{ passed: true, tracePath: tr }] } }] }));
      const run = (...a) => spawnSync(process.execPath, [cmpPath, ...a], { encoding: 'utf8', cwd: root });
      const b = path.join(d, 'b.json');
      const w = run(res, '--write', b);
      let n = 0;
      let base = null;
      try {
        base = JSON.parse(fs.readFileSync(b, 'utf8'));
        n = base.cases.c1.with;
      } catch {
        // reported below
      }
      if (!base || !(n > 0) || w.status !== 0) {
        err('scripts/eval-compare.mjs', `smoke "compare write": exit ${w.status}, expected a baseline with tokens > 0`);
      } else {
        const same = run(res, b);
        base.cases.c1.with = Math.round(n / 1.2);
        fs.writeFileSync(b, J(base));
        const over = run(res, b);
        const loose = run(res, b, '--threshold', '25');
        const bad = run(path.join(d, 'none.json'), b);
        if (same.status !== 0) err('scripts/eval-compare.mjs', `smoke "compare same": expected exit 0, got ${same.status}`);
        if (over.status !== 1 || !/OVER/.test(over.stdout)) err('scripts/eval-compare.mjs', `smoke "compare over": expected exit 1 with OVER, got ${over.status}`);
        if (loose.status !== 0) err('scripts/eval-compare.mjs', `smoke "compare threshold 25": expected exit 0, got ${loose.status}`);
        if (bad.status !== 2) err('scripts/eval-compare.mjs', `smoke "compare unreadable": expected exit 2, got ${bad.status}`);
        const tr2 = path.join(d, 't2.jsonl');
        fs.writeFileSync(tr2, [{ type: 'system', subtype: 'init', model: 'm' }, { type: 'result', num_turns: 1, total_cost_usd: 0.1, result: 'x', modelUsage: { m: { inputTokens: 1000, outputTokens: 1000, cacheReadInputTokens: 50000, cacheCreationInputTokens: 63000 } } }].map((x) => J(x)).join('\n') + '\n');
        const res2 = path.join(d, 'r2.json');
        fs.writeFileSync(res2, J({ suite: { modelOverride: 'm' }, cases: [{ name: 'c1', arms: { with: [{ passed: true, tracePath: tr2 }] } }] }));
        const b2 = path.join(d, 'b2.json');
        fs.writeFileSync(b2, J({ model: 'm', cases: { c1: { with: 100000 } } }));
        const edge = run(res2, b2, '--threshold', '15');
        if (edge.status !== 0) err('scripts/eval-compare.mjs', `smoke "compare base 100000 now 115000 threshold 15": expected exit 0, got ${edge.status}`);
        const res3 = path.join(d, 'r3.json');
        fs.writeFileSync(res3, J({ suite: { modelOverride: 'm' }, cases: [{ name: 'c1', arms: { with: [{ passed: true, tracePath: path.join(d, 'gone.jsonl') }] } }] }));
        const empty = run(res3, b);
        if (empty.status !== 0 || !(empty.stdout ?? '').includes('EVAL-COMPARE: EMPTY')) err('scripts/eval-compare.mjs', `smoke "compare all skipped": expected exit 0 with "EVAL-COMPARE: EMPTY", got ${empty.status}`);
        const emptyStrict = run(res3, b, '--strict');
        if (emptyStrict.status !== 2) err('scripts/eval-compare.mjs', `smoke "compare all skipped --strict": expected exit 2, got ${emptyStrict.status}`);
        // non-.jsonl tracePath (direct or basename fallback) is never read
        fs.writeFileSync(path.join(d, 'x.txt'), fs.readFileSync(tr, 'utf8'));
        const res4 = path.join(d, 'r4.json');
        fs.writeFileSync(res4, J({ suite: { modelOverride: 'm' }, cases: [{ name: 'c1', arms: { with: [{ passed: true, tracePath: path.join(d, 'x.txt') }] } }] }));
        const nonJsonl = run(res4, b);
        if (nonJsonl.status !== 0 || !(nonJsonl.stdout ?? '').includes('EVAL-COMPARE: EMPTY')) err('scripts/eval-compare.mjs', `smoke "compare non-jsonl tracePath": expected exit 0 with "EVAL-COMPARE: EMPTY", got ${nonJsonl.status}`);
        const b3 = path.join(d, 'b3.json');
        fs.writeFileSync(b3, J({ model: 'm', cases: { c1: { with: n }, c2: { with: 100 } } }));
        const missingStrict = run(res, b3, '--strict');
        if (missingStrict.status !== 1 || !/^EVAL-COMPARE: FAIL/m.test(missingStrict.stdout ?? '')) err('scripts/eval-compare.mjs', `smoke "compare missing --strict": expected exit 1 with "EVAL-COMPARE: FAIL", got ${missingStrict.status}`);
      }
    }
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

// 8f. Smoke tests: bad arguments are rejected with exit 2 and a message prefix
{
  const bad = (script, args, prefix, stream = 'stdout') => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], { encoding: 'utf8', cwd: root });
    const got = (r[stream] ?? '').split('\n')[0];
    if (r.status !== 2 || !got.startsWith(prefix)) err(`scripts/${script}`, `smoke "bad arg ${args.join(' ')}": expected exit 2 and "${prefix}", got exit ${r.status} "${got}"`);
  };
  bad('eval-compare.mjs', ['x.json', '--write'], 'EVAL-COMPARE: ERROR missing value for --write');
  bad('budget.mjs', ['x.jsonl', '--limit', '0'], 'BUDGET: ERROR invalid --limit "0"');
  bad('digest.mjs', ['x.jsonl', '--last', '0'], 'digest: invalid --last "0"', 'stderr');
  bad('trace-tokens.mjs', ['--foo'], 'TRACE: ERROR unknown option --foo');
}

// 8g. Smoke tests for untested branches: eval-compare --write skips and default baseline, budget --from alignment, trace-tokens unreadable run
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-branch-'));
  try {
    const J = JSON.stringify;
    const cmpPath = path.join(root, 'scripts', 'eval-compare.mjs');
    const budPath = path.join(root, 'scripts', 'budget.mjs');
    const tracePath = path.join(root, 'scripts', 'trace-tokens.mjs');
    const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: root });
    const tr = path.join(d, 't.jsonl');
    fs.writeFileSync(tr, [{ type: 'system', subtype: 'init', model: 'm' }, { type: 'result', num_turns: 1, total_cost_usd: 0.1, result: 'x', modelUsage: { m: { inputTokens: 1000, outputTokens: 1000, cacheReadInputTokens: 50000, cacheCreationInputTokens: 48000 } } }].map((x) => J(x)).join('\n') + '\n');

    // eval-compare --write: the unreadable arm (null pair) is skipped
    const res = path.join(d, 'r.json');
    fs.writeFileSync(res, J({ suite: { modelOverride: 'm' }, cases: [{ name: 'c1', arms: { with: [{ passed: true, tracePath: tr }], without: [{ passed: true, tracePath: path.join(d, 'gone.jsonl') }] } }] }));
    const wb = path.join(d, 'wb.json');
    const w = run(cmpPath, [res, '--write', wb]);
    let wc = null;
    try { wc = JSON.parse(fs.readFileSync(wb, 'utf8')).cases; } catch { /* reported below */ }
    if (w.status !== 0 || !wc || JSON.stringify(Object.keys(wc)) !== '["c1"]' || JSON.stringify(Object.keys(wc.c1)) !== '["with"]') {
      err('scripts/eval-compare.mjs', `smoke "compare write skips null pairs": expected exit 0 and only c1.with, got exit ${w.status}`);
    }

    // eval-compare default baseline: evals/baseline.json relative to cwd, missing here
    const bcwd = path.join(d, 'no-baseline');
    fs.mkdirSync(bcwd);
    const nb = spawnSync(process.execPath, [cmpPath, res], { encoding: 'utf8', cwd: bcwd });
    if (nb.status !== 2 || !(nb.stdout ?? '').startsWith('EVAL-COMPARE: ERROR baseline unreadable: evals/baseline.json')) {
      err('scripts/eval-compare.mjs', `smoke "compare default baseline missing": expected exit 2 with "EVAL-COMPARE: ERROR baseline unreadable: evals/baseline.json", got exit ${nb.status}`);
    }

    // budget --from mid-line: the partial first line is dropped, so it matches the next line start
    const am = (id, out) => J({ type: 'assistant', message: { id, content: [{ type: 'text', text: 't' }], usage: { input_tokens: 1, output_tokens: out } } });
    const tl = [am('m1', 500), am('m2', 800)];
    const tf = path.join(d, 'x.jsonl');
    fs.writeFileSync(tf, tl.join('\n') + '\n');
    const budAt = (from) => (run(budPath, [tf, '--main', '--from', String(from)]).stdout ?? '').trim();
    const mid = budAt(5);
    const aligned = budAt(Buffer.byteLength(tl[0] + '\n'));
    if (mid !== aligned || !aligned.startsWith('MAIN: 1 calls')) {
      err('scripts/budget.mjs', `smoke "from mid-line": expected the next-line result "${aligned}", got "${mid}"`);
    }

    // trace-tokens: a run whose trace cannot be read prints RUN then exactly TRACE: unreadable
    const ur = path.join(d, 'u.json');
    fs.writeFileSync(ur, J({ suite: { plugins: [{ version: '9.9.9' }] }, cases: [{ name: 'c5', arms: { with: [{ passed: false, tracePath: path.join(d, 'nope.jsonl') }] } }] }));
    const ut = (run(tracePath, [ur]).stdout ?? '').trim();
    if (ut !== 'RUN: c5 with #1 FAIL\nTRACE: unreadable') err('scripts/trace-tokens.mjs', `smoke "unreadable run": expected RUN line then TRACE: unreadable, got "${ut}"`);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

// 8h. Smoke tests: scripts/eval-select.mjs picks eval cases from changed files
{
  const sel = (args) => spawnSync(process.execPath, [path.join(root, 'scripts', 'eval-select.mjs'), ...args], { encoding: 'utf8', cwd: root });
  const lines = (r) => (r.stdout ?? '').split('\n').filter(Boolean);
  for (const [f, want] of [['skills/status/SKILL.md', ['status-slash']], ['skills/help/SKILL.md', []], ['README.md', []], ['evals/chat-terse/prompt.md', ['chat-terse']]]) {
    const r = sel(['--files', f]);
    if (r.status !== 0 || JSON.stringify(lines(r)) !== JSON.stringify(want)) err('scripts/eval-select.mjs', `smoke "select ${f}": expected [${want.join(', ')}] with exit 0, got exit ${r.status} [${lines(r).join(', ')}]`);
  }
  for (const [f, n] of [['hooks/guard-edit.mjs', 12], ['skills/init/SKILL.md', 12], ['agents/haiku-coder.md', 9], ['evals/touches.json', 12], ['scripts/eval-compare.mjs', 12], ['.github/workflows/eval.yml', 12]]) {
    const r = sel(['--files', f]);
    if (r.status !== 0 || lines(r).length !== n) err('scripts/eval-select.mjs', `smoke "select ${f}": expected ${n} cases with exit 0, got exit ${r.status} and ${lines(r).length} cases`);
  }
  const none = sel([]);
  if (none.status !== 2) err('scripts/eval-select.mjs', `smoke "select no args": expected exit 2, got ${none.status}`);
  for (const args of [['--base', '--output=x'], ['--base', 'HEAD;rm']]) {
    const r = sel(args);
    if (r.status !== 2) err('scripts/eval-select.mjs', `smoke "select ${args.join(' ')}": expected exit 2, got ${r.status}`);
  }
  const allCases = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'evals', 'touches.json'), 'utf8'))).sort().join(',');
  for (const [f, want] of [
    ['README.md', ['selected=', 'case=*', 'skip=true', 'partial=false']],
    ['skills/status/SKILL.md', ['selected=status-slash', 'case=status-slash', 'skip=false', 'partial=true']],
    ['skills/learn/SKILL.md', ['selected=on-learned-errors,on-learned-errors-write', 'case={on-learned-errors,on-learned-errors-write}', 'skip=false', 'partial=true']],
    ['hooks/x.mjs', [`selected=${allCases}`, 'case=*', 'skip=false', 'partial=false']],
    ['"hooks/x.mjs"', [`selected=${allCases}`, 'case=*', 'skip=false', 'partial=false']],
  ]) {
    const r = sel(['--files', f, '--plan']);
    if (r.status !== 0 || JSON.stringify(lines(r)) !== JSON.stringify(want)) err('scripts/eval-select.mjs', `smoke "plan ${f}": expected [${want.join(' | ')}] with exit 0, got exit ${r.status} [${lines(r).join(' | ')}]`);
  }
  const headNone = sel(['--base', 'HEAD']);
  if (headNone.status !== 0 || (headNone.stdout ?? '') !== '') err('scripts/eval-select.mjs', `smoke "select --base HEAD": expected exit 0 and empty output, got exit ${headNone.status}`);
  const headPlan = sel(['--base', 'HEAD', '--plan']);
  if (headPlan.status !== 0 || !lines(headPlan).includes('skip=true')) err('scripts/eval-select.mjs', `smoke "plan --base HEAD": expected exit 0 and skip=true, got exit ${headPlan.status}`);
}

// 8i. Smoke tests: scripts/otel-export.mjs writes GenAI spans without message content (temp dir only)
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-otel-'));
  try {
    const exportPath = path.join(root, 'scripts', 'otel-export.mjs');
    const fails = (m) => err('scripts/otel-export.mjs', `smoke ${m}`);
    if (!exists(exportPath)) {
      fails('missing, cannot smoke test');
    } else {
      const J = JSON.stringify;
      const transcript = path.join(tmp, 'otel.jsonl');
      fs.writeFileSync(transcript, [
        J({ type: 'assistant', timestamp: '2026-01-01T00:00:00Z', message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'SECRET-CMD' } }], usage: { input_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0, output_tokens: 50 } } }),
        J({ type: 'user', timestamp: '2026-01-01T00:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'SECRET-OUT' }] } }),
        J({ type: 'assistant', timestamp: '2026-01-01T00:00:03Z', message: { id: 'm2', content: [{ type: 'tool_use', id: 't2', name: 'Agent', input: { subagent_type: 'orchestrator:haiku-coder', prompt: 'SECRET-PROMPT' } }], usage: { input_tokens: 10, cache_read_input_tokens: 1100, cache_creation_input_tokens: 0, output_tokens: 20 } } }),
        J({ type: 'user', timestamp: '2026-01-01T00:00:09Z', message: { content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'SECRET-ERR' }] } }),
        J({ type: 'assistant', isSidechain: true, timestamp: '2026-01-01T00:00:10Z', message: { id: 's1', content: [{ type: 'text', text: 'SECRET-SIDE' }], usage: { input_tokens: 99999 } } }),
      ].join('\n') + '\n');
      const r = spawnSync(process.execPath, [exportPath, transcript], { encoding: 'utf8', cwd: root });
      if (r.status !== 0) fails(`exit ${r.status}, expected 0`);
      let doc = null;
      try { doc = JSON.parse(r.stdout); } catch { fails('output is not JSON'); }
      if (doc) {
        const spans = doc.resourceSpans?.[0]?.scopeSpans?.[0]?.spans ?? [];
        const attr = (s, k) => s.attributes.find((a) => a.key === k)?.value;
        const rootSpan = spans.find((s) => !s.parentSpanId);
        const bash = spans.find((s) => s.name === 'execute_tool Bash');
        const agent = spans.find((s) => s.name === 'invoke_agent orchestrator:haiku-coder');
        const dur = bash ? Number(BigInt(bash.endTimeUnixNano) - BigInt(bash.startTimeUnixNano)) : null;
        const chk = (name, ok) => { if (!ok) fails(`"${name}" failed`); };
        chk('3 spans', spans.length === 3);
        chk('root input_tokens 2210', rootSpan && attr(rootSpan, 'gen_ai.usage.input_tokens')?.intValue === '2210');
        chk('root output_tokens 70', rootSpan && attr(rootSpan, 'gen_ai.usage.output_tokens')?.intValue === '70');
        chk('span names', bash && agent);
        chk('children parent is root', rootSpan && spans.filter((s) => s.parentSpanId).every((s) => s.parentSpanId === rootSpan.spanId));
        chk('Bash duration 2s', dur === 2000000000);
        chk('Agent status error', agent?.status?.code === 2);
        chk('no content captured', !r.stdout.includes('SECRET'));
      }
      const missing = spawnSync(process.execPath, [exportPath, path.join(tmp, 'none.jsonl')], { encoding: 'utf8', cwd: root });
      if (missing.status !== 2) fails(`missing file: expected exit 2, got ${missing.status}`);
      // IC-109: no span before 2020; a missing timestamp takes the last earlier one; an unfinished call ends at the last timestamp; no-timestamp transcript uses the file mtime
      const y2020 = BigInt(Date.parse('2020-01-01T00:00:00Z')) * 1000000n;
      const t109 = path.join(tmp, 'ic109.jsonl');
      fs.writeFileSync(t109, [
        J({ type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { content: 'hi' } }),
        J({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'a', name: 'Bash', input: {} }] } }),
        J({ type: 'user', timestamp: '2026-01-01T00:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 'a', content: 'x' }] } }),
        J({ type: 'assistant', timestamp: '2026-01-01T00:00:03Z', message: { id: 'm2', content: [{ type: 'tool_use', id: 'b', name: 'Read', input: {} }] } }),
        J({ type: 'assistant', timestamp: '2026-01-01T00:00:08Z', message: { id: 'm3', content: [{ type: 'text', text: 'x' }] } }),
      ].join('\n') + '\n');
      const r109 = spawnSync(process.execPath, [exportPath, t109], { encoding: 'utf8', cwd: root });
      if (r109.status !== 0) fails(`IC-109 exit ${r109.status}, expected 0`);
      let s109 = [];
      try { s109 = JSON.parse(r109.stdout).resourceSpans[0].scopeSpans[0].spans; } catch { fails('IC-109 output is not JSON'); }
      const bash109 = s109.find((s) => s.name === 'execute_tool Bash');
      const read109 = s109.find((s) => s.name === 'execute_tool Read');
      if (s109.some((s) => BigInt(s.startTimeUnixNano) < y2020 || BigInt(s.endTimeUnixNano) < y2020)) fails('IC-109 span before 2020');
      if (!bash109 || bash109.startTimeUnixNano !== String(BigInt(Date.parse('2026-01-01T00:00:00Z')) * 1000000n)) fails('IC-109 Bash start is not the last known timestamp');
      if (!read109 || read109.endTimeUnixNano !== String(BigInt(Date.parse('2026-01-01T00:00:08Z')) * 1000000n)) fails('IC-109 unfinished Read does not end at the last timestamp');
      if (read109 && read109.status !== undefined) fails('IC-109 unfinished Read has a status');
      const t109b = path.join(tmp, 'ic109b.jsonl');
      fs.writeFileSync(t109b, J({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'c', name: 'Grep', input: {} }] } }) + '\n');
      const r109b = spawnSync(process.execPath, [exportPath, t109b], { encoding: 'utf8', cwd: root });
      if (r109b.status !== 0) fails(`IC-109 no-timestamp exit ${r109b.status}, expected 0`);
      else if (JSON.parse(r109b.stdout).resourceSpans[0].scopeSpans[0].spans.some((s) => BigInt(s.startTimeUnixNano) < y2020)) fails('IC-109 no-timestamp transcript starts before 2020');
      // IC-110: a failing --out write exits 3 with a one-line message and no stack trace
      const w110 = spawnSync(process.execPath, [exportPath, transcript, '--out', tmp], { encoding: 'utf8', cwd: root });
      if (w110.status !== 3) fails(`IC-110 expected exit 3, got ${w110.status}`);
      if (!/cannot write output/.test(w110.stderr)) fails('IC-110 message missing');
      if (/\n\s+at /.test(w110.stderr)) fails('IC-110 stack trace printed');
      const ok110 = spawnSync(process.execPath, [exportPath, transcript, '--out', path.join(tmp, 'out.json')], { encoding: 'utf8', cwd: root });
      if (ok110.status !== 0) fails(`IC-110 normal --out exit ${ok110.status}, expected 0`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// 8j. Smoke tests: scripts/plan-dag.mjs derives file-disjoint waves from the PRD task table (temp dir only)
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-dag-'));
  try {
    const planPath = path.join(root, 'scripts', 'plan-dag.mjs');
    const fails = (m) => err('scripts/plan-dag.mjs', `smoke ${m}`);
    if (!exists(planPath)) {
      fails('missing, cannot smoke test');
    } else {
      const run = (args) => spawnSync(process.execPath, [planPath, ...args], { encoding: 'utf8', cwd: root });
      const prd = path.join(tmp, 'prd.md');
      fs.writeFileSync(prd, [
        '| Task | Files | Verify |',
        '|---|---|---|',
        '| A | `src/a.js`, `test/a.test.js` | x |',
        '| B | `src/b.js` | x |',
        '| C | `src/a.js:10-20` | x |',
        '| D | `docs/` | x |',
        '| E | `docs/guide.md` | x |',
      ].join('\n') + '\n');
      const r = run([prd]);
      const want = ['WAVE 1: A [src/a.js, test/a.test.js], B [src/b.js], D [docs/]', 'WAVE 2: C [src/a.js], E [docs/guide.md]', 'PLAN: 5 tasks, 2 waves, max 3 lanes'];
      if (r.status !== 0 || r.stdout !== `${want.join('\n')}\n`) fails(`default lanes: expected exit 0 and exact plan, got exit ${r.status}: ${JSON.stringify(r.stdout)}`);
      const r2 = run([prd, '--lanes', '2']);
      const want2 = ['WAVE 1: A [src/a.js, test/a.test.js], B [src/b.js]', 'WAVE 2: C [src/a.js], D [docs/]', 'WAVE 3: E [docs/guide.md]', 'PLAN: 5 tasks, 3 waves, max 2 lanes'];
      if (r2.status !== 0 || r2.stdout !== `${want2.join('\n')}\n`) fails(`--lanes 2: expected exit 0 and exact plan, got exit ${r2.status}: ${JSON.stringify(r2.stdout)}`);
      const j = run([prd, '--json']);
      let doc = null;
      try { doc = JSON.parse(j.stdout); } catch { fails('--json output is not JSON'); }
      if (doc && (j.status !== 0 || doc.waves?.length !== 2)) fails(`--json: expected exit 0 and 2 waves, got exit ${j.status}`);
      const noFiles = path.join(tmp, 'nofiles.md');
      fs.writeFileSync(noFiles, '| Task | Verify |\n|---|---|\n| A | x |\n');
      const nf = run([noFiles]);
      if (nf.status !== 2) fails(`no Files column: expected exit 2, got ${nf.status}`);
      const badLanes = run([prd, '--lanes', '9']);
      if (badLanes.status !== 2) fails(`--lanes 9: expected exit 2, got ${badLanes.status}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
}
