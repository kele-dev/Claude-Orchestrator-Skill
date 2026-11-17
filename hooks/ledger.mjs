#!/usr/bin/env node
// SubagentStop hook: appends one line per orchestrator delegation ({ts, tier, status, agent_id}) to <store>/delegations.jsonl, capped at 1000 lines once over 256 KB.
// Stats mode: `node ledger.mjs --stats <store>` prints one LEDGER line with the pass rate per tier.
// Store computation duplicates hooks/session-info.mjs (lines 47-60); keep the two in sync. Fails open: any error prints nothing and exits 0; never blocks.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const fmt = (e) => process.env.ORCH_DEBUG === '2' ? String(e?.stack ?? e) : `${e?.name ?? 'Error'}: ${String(e?.message ?? e).replace(/"[^"]*"/g, '"…"').slice(0, 200)}`;
const dbg = (e) => { if (process.env.ORCH_DEBUG === '1' || process.env.ORCH_DEBUG === '2') process.stderr.write(`orchestrator ledger: ${fmt(e)}\n`); };

const TIERS = ['haiku-coder', 'sonnet-dev', 'opus-planner', 'opus-reviewer'];
const CAP_BYTES = 256 * 1024;
const CAP_LINES = 1000;
const NONE = 'LEDGER: no delegations';

const fwd = (p) => p.replace(/\\/g, '/');

// Same rule as hooks/session-info.mjs: git common dir of cwd (else cwd), lowercased, non [a-z0-9] runs -> '-', last 80 chars.
function storeFor(cwd) {
  let main = cwd;
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8',
    }).trim();
    if (common) main = dirname(common);
  } catch (e) {
    dbg(e);
    main = cwd;
  }
  main = fwd(main);
  const key = main.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(-80);
  return fwd(homedir()) + '/.claude/orchestrator/' + key;
}

// Text of the last assistant entry in a JSONL transcript; '' when none.
function lastAssistantText(path) {
  if (typeof path !== 'string' || path === '') return '';
  try {
    const lines = readFileSync(path, 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"assistant"')) continue;
      let entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (entry?.type !== 'assistant') continue;
      const content = entry.message?.content;
      if (typeof content === 'string') return content;
      if (!Array.isArray(content)) return '';
      return content.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n');
    }
  } catch (e) {
    dbg(e);
  }
  return '';
}

// Keeps only the last CAP_LINES lines when the file is over CAP_BYTES.
function capFile(file) {
  try {
    if (!existsSync(file) || statSync(file).size <= CAP_BYTES) return;
    const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l !== '');
    writeFileSync(file, lines.slice(-CAP_LINES).map((l) => l + '\n').join(''));
  } catch (e) {
    dbg(e);
  }
}

function record(input) {
  const tier = String(input?.agent_type ?? '').replace(/^orchestrator:/, '');
  if (!TIERS.includes(tier)) return;
  const cwd = typeof input?.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd();
  const text = typeof input?.last_assistant_message === 'string' ? input.last_assistant_message : lastAssistantText(input?.agent_transcript_path);
  const m = /^\s*STATUS:\s*([A-Z_]+)/m.exec(text);
  const status = m ? m[1] : '?';

  const store = storeFor(cwd);
  mkdirSync(store, { recursive: true });
  const file = join(store, 'delegations.jsonl');
  capFile(file);
  appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), tier, status, agent_id: String(input?.agent_id ?? '') }) + '\n');
}

// Pass rate per tier from <store>/delegations.jsonl; bad lines and unknown tiers are skipped.
function stats(dir) {
  if (typeof dir !== 'string' || dir === '') return NONE;
  const counts = new Map();
  try {
    for (const line of readFileSync(join(dir, 'delegations.jsonl'), 'utf8').split('\n')) {
      if (line.trim() === '') continue;
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        continue;
      }
      if (!TIERS.includes(r?.tier)) continue;
      const c = counts.get(r.tier) ?? { pass: 0, total: 0 };
      c.total++;
      if (r.status === 'SUCCESS' || r.status === 'PASS') c.pass++;
      counts.set(r.tier, c);
    }
  } catch (e) {
    dbg(e);
  }
  const parts = TIERS.filter((t) => counts.has(t)).map((t) => `${t} ${counts.get(t).pass}/${counts.get(t).total} pass`);
  return parts.length ? `LEDGER: ${parts.join(', ')}` : NONE;
}

if (process.argv[2] === '--stats') {
  try {
    process.stdout.write(stats(process.argv[3]) + '\n');
  } catch (e) {
    dbg(e);
    process.stdout.write(NONE + '\n');
  }
} else {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', () => {
    try {
      record(JSON.parse(raw));
    } catch (e) {
      // fail open
      dbg(e);
    }
  });
}
