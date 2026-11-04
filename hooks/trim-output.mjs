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

    const text = response.stdout + (response.stderr ? '\n' + response.stderr : '');
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

// Returns the trimmed text, or null when the output is short enough to keep as-is.
function trim(text) {
  const lines = text.split('\n');
  if (lines.length <= 80) return null;

  const matched = lines
    .slice(0, lines.length - 40)
    .filter((l) => /error|fail|exception|panic|traceback|assert/i.test(l))
    .slice(0, 20);
  const tail = lines.slice(-40);
  const dropped = lines.length - matched.length - tail.length;

  const body = matched.length ? [...matched, '...'] : [];
  return [
    `[orchestrator: trimmed ${dropped} of ${lines.length} lines; add "# notrim" to the command for full output]`,
    ...body,
    ...tail,
  ].join('\n');
}
