// Shared transcript (JSONL) helpers for digest.mjs and budget.mjs.
import { readFileSync } from 'node:fs';

// Returns string[] lines; throws if unreadable. With from > 0, starts at that byte offset
// and drops the partial first line unless the byte before the offset is a newline.
export function readTranscript(file, from = 0) {
  const buf = readFileSync(file);
  if (!(from > 0)) return buf.toString('utf8').split('\n');
  if (from >= buf.length) return [];
  const text = buf.subarray(from).toString('utf8');
  const lines = text.split('\n');
  if (buf[from - 1] !== 0x0a) lines.shift();
  return lines;
}

// Yields parsed objects; skips blank/unparsable lines and sidechain entries.
export function* entries(lines, types = null) {
  for (const line of lines) {
    if (!line.trim()) continue;
    if (types && !types.some((t) => line.includes(`"type":"${t}"`))) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (!o || o.isSidechain === true) continue;
    if (types && !types.includes(o.type)) continue;
    yield o;
  }
}

export function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n');
}
