#!/usr/bin/env node
// PostToolUse hook for Bash/PowerShell: trims long command output, keeping error lines and the tail.
// Fails open: on any error or unexpected input it prints nothing and exits 0.
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);
    const command = input?.tool_input?.command;
    const response = input?.tool_response;
    if (process.env.ORCH_NO_TRIM === '1') return;
    if (typeof command === 'string' && command.includes('# notrim')) return;
    if (typeof response?.stdout !== 'string') return;

    const strip = (s) => (typeof s === 'string' ? s.replace(/\r?\n$/, '') : '');
    const text = [strip(response.stdout), strip(response.stderr)].filter((s) => s !== '').join('\n');
    if (text === '') return;
    const stdout = trim(text);
    if (stdout === null) return;

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: {
          stdout,
          stderr: '',
          interrupted: response.interrupted ?? false,
          isImage: false,
        },
      },
    }));
  } catch {
    // fail open
  }
});

// Returns the trimmed text, or null when no rule applied.
function trim(text) {
  const out = trimLines(text);
  const result = out ?? text;
  if (result.length > 30000) {
    const cut = result.length - 26000;
    return `${result.slice(0, 6000)}\n[orchestrator: cut ${cut} chars; add "# notrim" to the command for full output]\n${result.slice(-20000)}`;
  }
  return out;
}

function trimLines(text) {
  const lines = text.split('\n');
  if (lines.length <= 80) return null;

  const posInt = (v, d) => (/^[1-9]\d*$/.test(v ?? '') ? Number(v) : d);
  const tailN = posInt(process.env.ORCH_TRIM_TAIL, 30);
  const errN = posInt(process.env.ORCH_TRIM_ERRORS, 10);
  const matched = lines
    .slice(0, lines.length - tailN)
    .filter((l) => /error|fail|exception|panic|traceback|assert/i.test(l))
    .slice(0, errN);
  const tail = lines.slice(-tailN);
  const dropped = lines.length - matched.length - tail.length;

  const body = matched.length ? [...matched, '...'] : [];
  return [
    `[orchestrator: trimmed ${dropped} of ${lines.length} lines; add "# notrim" to the command for full output]`,
    ...body,
    ...tail,
  ].join('\n');
}
