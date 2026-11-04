#!/usr/bin/env node
// PostToolUse hook for Bash/PowerShell: trims long command output, keeping error lines and the tail.
// Fails open: on any error or unexpected input it prints nothing and exits 0.
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  try {
    if (raw.length < 3000) return;
    const input = JSON.parse(raw);
    const command = input?.tool_input?.command;
    const response = input?.tool_response;
    if (process.env.ORCH_NO_TRIM === '1') return;
    if (typeof command === 'string' && command.includes('# notrim')) return;
    if (typeof response?.stdout !== 'string') return;

    const strip = (s) => (typeof s === 'string' ? s.replace(/\r?\n$/, '') : '');
    const text = [strip(response.stdout), strip(response.stderr)].filter((s) => s !== '').join('\n');
    if (text === '') return;
    const noLines = (typeof command === 'string' && /(^|[|;&(]\s*)(git\s+(diff|show|log\b[^|]*-p)|cat|jq|Get-Content|type)\b/.test(command))
      || /^(\{|\[\s*($|[{"\d\]]))/.test((text.split('\n').find((l) => l.trim() !== '') ?? '').trimStart());
    const stdout = trim(text, noLines);
    if (stdout === null) return;

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: { ...response, stdout, stderr: '' },
      },
    }));
  } catch {
    // fail open
  }
});

// Returns the trimmed text, or null when no rule applied.
function trim(text, noLines) {
  const out = noLines ? null : trimLines(text);
  const result = out ?? text;
  if (result.length > 30000) {
    const cut = result.length - 26000;
    return `${result.slice(0, 6000)}\n[orchestrator: cut ${cut} chars; add "# notrim" to the command for full output]\n${result.slice(-20000)}`;
  }
  return out;
}

function trimLines(text) {
  const lines = text.split('\n');
  if (lines.length <= 80 || text.length <= 4000) return null;

  const posInt = (v, d) => (/^[1-9]\d*$/.test(v ?? '') ? Number(v) : d);
  const tailN = posInt(process.env.ORCH_TRIM_TAIL, 30);
  const errN = posInt(process.env.ORCH_TRIM_ERRORS, 10);
  const head = lines.slice(0, 3);
  const matched = lines
    .slice(3, Math.max(3, lines.length - tailN))
    .filter((l) => /error|fail|exception|panic|traceback|assert|not ok|✗|✖|×|^E\s|warning:/i.test(l))
    .slice(0, errN);
  const tail = lines.slice(Math.max(3, lines.length - tailN));
  const dropped = lines.length - head.length - matched.length - tail.length;

  const body = matched.length ? [...matched, '...'] : ['...'];
  return [
    `[orchestrator: trimmed ${dropped} of ${lines.length} lines; add "# notrim" to the command for full output]`,
    ...head,
    ...body,
    ...tail,
  ].join('\n');
}
