#!/usr/bin/env node
// UserPromptSubmit hook: warns once per session when the transcript is long (size or delegation count).
// Fails open: on any error or unexpected input it prints nothing and exits 0.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  try {
    const out = run(JSON.parse(raw));
    if (out) process.stdout.write(out + '\n');
  } catch {
    // fail open
  }
});

const posInt = (v, d) => (/^[1-9]\d*$/.test(v ?? '') ? Number(v) : d);

function run(input) {
  if (process.env.ORCH_LONG === 'off') return '';

  const id = String(input?.session_id ?? '').replace(/[^A-Za-z0-9-]/g, '');
  if (id === '') return '';
  const marker = join(tmpdir(), `orchestrator-long-${id}`);
  if (existsSync(marker)) return '';

  const path = input?.transcript_path;
  if (typeof path !== 'string' || path === '') return '';

  const bytesLimit = posInt(process.env.ORCH_LONG_BYTES, 2 * 1024 * 1024);
  const delegLimit = posInt(process.env.ORCH_LONG_DELEGATIONS, 30);

  const size = statSync(path).size;
  let delegations = 0;
  if (size >= 256 * 1024) {
    try {
      let count = 0;
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line.includes('"subagent_type"')) continue;
        let entry;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }
        if (entry?.type !== 'assistant' || entry.isSidechain) continue;
        const content = entry.message?.content;
        if (!Array.isArray(content)) continue;
        count += content.filter((p) => p?.type === 'tool_use' && (p.name === 'Agent' || p.name === 'Task')).length;
      }
      delegations = count;
    } catch {
      delegations = 0;
    }
  }
  if (size < bytesLimit && delegations < delegLimit) return '';

  writeFileSync(marker, '');
  const line = `orchestrator: this session is long (${(size / 1048576).toFixed(1)} MB, ${delegations} delegations). Write a checkpoint per orchestrator:resume and continue in a new session with /orchestrator:resume.`;
  return JSON.stringify({
    systemMessage: line,
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: line },
  });
}
