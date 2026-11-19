// Shared transcript (JSONL) helpers for digest.mjs and budget.mjs.
import { closeSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';

// Returns string[] lines; throws if unreadable. With from > 0, reads only the bytes from that offset on (plus the one byte before it)
// and drops the partial first line unless the byte before the offset is a newline.
export function readTranscript(file, from = 0) {
  if (!(from > 0)) return readFileSync(file).toString('utf8').split('\n');
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    if (from >= size) return [];
    const buf = Buffer.alloc(size - from + 1);
    let got = 0;
    while (got < buf.length) {
      const n = readSync(fd, buf, got, buf.length - got, from - 1 + got);
      if (n <= 0) break;
      got += n;
    }
    const lines = buf.toString('utf8', 1, got).split('\n');
    if (buf[0] !== 0x0a) lines.shift();
    return lines;
  } finally {
    closeSync(fd);
  }
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
