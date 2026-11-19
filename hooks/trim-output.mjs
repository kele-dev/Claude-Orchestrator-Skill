#!/usr/bin/env node
// PostToolUse hook for Bash/PowerShell: trims long command output, keeping error lines and the tail.
// Fails open: on any error or unexpected input it prints nothing and exits 0.
import { makeDbg, posInt, readStdin } from './lib.mjs';

const dbg = makeDbg('trim-output');
readStdin((raw) => {
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
      || /^(\{|\[\s*($|[{"\]]))/.test((text.split('\n').find((l) => l.trim() !== '') ?? '').trimStart());
    const readCmd = typeof command === 'string' && /(^|[;&]\s*)(ls|find|git\s+ls-files|grep|rg|head|tail|sed\s+-n|wc|Get-ChildItem|Select-String)\b/.test(command.trimStart());
    const code = response.exit_code ?? response.exitCode;
    const stdout = trim(text, noLines, readCmd, Number.isInteger(code) && code !== 0);
    if (stdout === null) return;

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: { ...response, stdout, stderr: '' },
      },
    }));
  } catch (e) {
    // fail open
    dbg(e);
  }
});

// Returns the trimmed text, or null when no rule applied.
function trim(text, noLines, readCmd, exitFailed) {
  const out = noLines ? null : trimLines(text, readCmd ? 300 : 80, exitFailed);
  const result = out ?? text;
  if (result.length > 30000) {
    const cut = result.length - 26000;
    return `${result.slice(0, 6000)}\n[orchestrator: cut ${cut} chars; add "# notrim" to the command for full output]\n${result.slice(-20000)}`;
  }
  return out;
}

const ERROR_LINE = /error|fail|exception|panic|traceback|assert|not ok|✗|✖|×|^E\s|warning:/i;
const HEAD_FAILED = 10;

// When the command failed (non-zero exit code, or an error line anywhere), keep the first HEAD_FAILED lines instead of 3:
// failure lines without a keyword (e.g. "fatal: ...") usually come first.
function trimLines(text, maxLines, exitFailed = false) {
  const lines = text.split('\n');
  if (lines.length <= maxLines || text.length <= 4000) return null;

  const tailN = posInt(process.env.ORCH_TRIM_TAIL, 30);
  const errN = posInt(process.env.ORCH_TRIM_ERRORS, 10);
  const failed = exitFailed || lines.some((l) => ERROR_LINE.test(l));
  const headN = failed ? HEAD_FAILED : 3;
  const head = lines.slice(0, headN);
  const matched = lines
    .slice(headN, Math.max(headN, lines.length - tailN))
    .filter((l) => ERROR_LINE.test(l))
    .slice(0, errN);
  const tail = lines.slice(Math.max(headN, lines.length - tailN));
  const dropped = lines.length - head.length - matched.length - tail.length;

  const body = matched.length ? [...matched, '...'] : ['...'];
  return [
    `[orchestrator: trimmed ${dropped} of ${lines.length} lines; add "# notrim" to the command for full output]`,
    ...head,
    ...body,
    ...tail,
  ].join('\n');
}
