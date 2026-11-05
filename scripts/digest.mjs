#!/usr/bin/env node
// Digest a Claude Code transcript (JSONL) into a short U:/A: text view.
// Usage: node scripts/digest.mjs <transcript.jsonl> [--last N]   (default N = 60)
// Keeps only user/assistant text; drops tool calls/results, sidechains, meta lines and system wrappers.
import { readTranscript, entries, textOf } from './transcript.mjs';

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--last');
const li = args.indexOf('--last');
const v = li >= 0 ? args[li + 1] : args.find((a) => a.startsWith('--last='))?.slice('--last='.length);
const last = /^[1-9]\d*$/.test(v ?? '') ? Number(v) : 60;
const MAX = 2000;

let lines;
try {
  lines = readTranscript(file);
} catch (e) {
  process.stderr.write(`digest: cannot read ${file ?? '(no file)'}: ${e.message}\n`);
  process.exit(1);
}

const WRAPPERS = ['command-message', 'command-name', 'local-command-stdout', 'local-command-stderr', 'local-command-caveat'];

function clean(text) {
  let t = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  for (const w of WRAPPERS) t = t.replace(new RegExp(`<${w}>[\\s\\S]*?<\\/${w}>`, 'g'), '');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

const msgs = []; // { role, id, text }
for (const o of entries(lines, ['user', 'assistant'])) {
  if (o.isMeta === true) continue;
  const m = o.message || {};
  const raw = textOf(m.content).replace(/\r\n?/g, '\n');
  const bare = raw.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  const cmd = o.type === 'user' && bare.trimStart().startsWith('<command-') ? bare.match(/<command-name>([\s\S]*?)<\/command-name>/) : null;
  let text;
  if (cmd) {
    const name = (cmd[1] ?? '').trim().replace(/^\/+/, '');
    const cargs = (bare.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1] ?? '').trim();
    text = name || cargs ? `/${name}${cargs ? ' ' + cargs : ''}` : '';
  } else {
    text = clean(raw);
  }
  if (!text) continue;
  const role = o.type;
  const id = role === 'assistant' ? (m.id ?? null) : null;
  const prev = msgs[msgs.length - 1];
  if (role === 'assistant' && prev && prev.role === 'assistant' && prev.id === id) {
    prev.text += '\n' + text;
  } else {
    msgs.push({ role, id, text });
  }
}

const out = msgs.slice(-last).map((x) => {
  let t = x.text;
  if (t.length > MAX) t = t.slice(0, MAX) + ' [...]';
  return `${x.role === 'user' ? 'U' : 'A'}: ${t}`;
});
process.stdout.write(out.join('\n\n') + (out.length ? '\n' : ''));
