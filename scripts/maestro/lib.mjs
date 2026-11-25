// Maestro shared helpers: config, quota ledger, classifiers, prompt builder, patch apply.
// No side effects at import. I/O happens only inside the functions below.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const HOUR_MS = 60 * 60 * 1000;

const DEFAULTS = {
  enabled: false,
  codex: { model: '', effort: 'high', ignoreUserConfig: true, windowsSandbox: 'elevated', timeoutMin: 30 },
  gemini: { model: '', effort: 'high', timeoutMin: 10, dailyRuns: 100, maxPromptKB: 400 },
  profiles: {
    code: { worker: 'codex', effort: 'high' },
    fix: { worker: 'codex', effort: 'medium' },
    review: { worker: 'gemini', effort: 'high' },
    read: { worker: 'gemini', effort: 'medium' },
  },
};

const SECRET_PATTERNS = [
  /^\.env/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /\.jks$/,
  /\.keystore$/,
  /^id_rsa/,
  /^id_ed25519/,
  /^id_ecdsa/,
  /^\.npmrc$/,
  /^\.netrc$/,
  /^\.pypirc$/,
  /^secrets\./,
  /^credentials/,
];

const CODEX_LIMIT_RE = /out of credits|usage limit|rate limit|quota|try again (in|at)/i;
const GEMINI_QUOTA_RE = /429|RESOURCE_EXHAUSTED|quota|rate limit/i;
const GEMINI_DENIED_RE = /no output produced|auto-denied/i;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, over) {
  const out = isPlainObject(base) ? { ...base } : {};
  if (!isPlainObject(over)) return out;
  for (const key of Object.keys(over)) {
    const v = over[key];
    out[key] = isPlainObject(v) && isPlainObject(out[key]) ? deepMerge(out[key], v) : v;
  }
  return out;
}

function readJson(file) {
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
}

function globalConfigFile(home) {
  return join(home, '.claude', 'orchestrator', 'maestro.json');
}

function ledgerFile(home) {
  return join(home, '.claude', 'orchestrator', 'maestro-quota.json');
}

function localDay(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Global config first, then project config (per key). `enabled` comes from the project only.
export function loadConfig({ home, store }) {
  const globalCfg = readJson(globalConfigFile(home));
  const projectCfg = store ? readJson(join(store, 'maestro.json')) : {};
  const { enabled: _ignoredGlobalEnabled, ...globalRest } = globalCfg;
  const { enabled: projectEnabled, ...projectRest } = projectCfg;
  let cfg = deepMerge(DEFAULTS, globalRest);
  cfg = deepMerge(cfg, projectRest);
  cfg.enabled = projectEnabled === true;
  return cfg;
}

// Merges a patch into the project config file and writes it atomically.
export function saveProjectConfig(store, patch) {
  const file = join(store, 'maestro.json');
  const merged = deepMerge(readJson(file), patch);
  writeAtomic(file, JSON.stringify(merged, null, 2) + '\n');
  return merged;
}

export function readLedger(home) {
  const saved = readJson(ledgerFile(home));
  return {
    codex: { blockedUntil: null, lastError: '', ...(saved.codex || {}) },
    gemini: { day: '', runs: 0, blockedUntil: null, lastError: '', ...(saved.gemini || {}) },
  };
}

export function writeLedger(home, ledger) {
  writeAtomic(ledgerFile(home), JSON.stringify(ledger, null, 2) + '\n');
}

// Returns whether a worker may run now. Resets the Gemini day counter when the local day changed.
export function ledgerBlocked(ledger, worker, now, dailyRuns) {
  const next = JSON.parse(JSON.stringify(ledger));
  if (worker === 'codex') {
    const until = next.codex.blockedUntil ? Date.parse(next.codex.blockedUntil) : NaN;
    if (until > now.getTime()) {
      return { blocked: true, reason: next.codex.lastError || `codex blocked until ${next.codex.blockedUntil}`, ledger: next };
    }
    return { blocked: false, reason: '', ledger: next };
  }
  if (worker === 'gemini') {
    const day = localDay(now);
    if (next.gemini.day !== day) {
      next.gemini.day = day;
      next.gemini.runs = 0;
    }
    const until = next.gemini.blockedUntil ? Date.parse(next.gemini.blockedUntil) : NaN;
    if (until > now.getTime()) {
      return { blocked: true, reason: next.gemini.lastError || `gemini blocked until ${next.gemini.blockedUntil}`, ledger: next };
    }
    if (next.gemini.runs >= dailyRuns) {
      return { blocked: true, reason: `gemini daily runs limit reached (${dailyRuns})`, ledger: next };
    }
    return { blocked: false, reason: '', ledger: next };
  }
  throw new Error(`unknown worker: ${worker}`);
}

// "try again at <time>" when it parses, else now + 5 h.
export function parseResetTime(message, now) {
  const m = /try again at\s+(\S+)/i.exec(String(message || ''));
  if (m) {
    const t = Date.parse(m[1].replace(/[.,;]+$/, ''));
    if (!Number.isNaN(t)) return new Date(t);
  }
  return new Date(now.getTime() + 5 * HOUR_MS);
}

function sumUsage(input, output) {
  return { input: input || 0, output: output || 0 };
}

export function classifyCodex({ exitCode, events }) {
  let tokens = sumUsage(0, 0);
  let failure = '';
  let quota = '';
  let completed = false;
  for (const ev of events || []) {
    if (ev && ev.type === 'turn.completed') {
      completed = true;
      if (ev.usage) tokens = sumUsage(ev.usage.input_tokens, ev.usage.output_tokens);
    }
    if (ev && (ev.type === 'turn.failed' || ev.type === 'error')) {
      const msg = String(ev.error?.message ?? ev.message ?? '');
      if (CODEX_LIMIT_RE.test(msg)) quota = msg;
      else failure = msg;
    }
  }
  if (quota && (exitCode !== 0 || !completed)) return { status: 'QUOTA', error: quota, tokens };
  if (exitCode !== 0) return { status: 'FAIL', error: failure || `exit code ${exitCode}`, tokens };
  if (!completed && failure) return { status: 'FAIL', error: failure, tokens };
  if (!completed) return { status: 'FAIL', error: 'no turn.completed', tokens };
  return { status: 'ok', error: '', tokens };
}

export function classifyGemini({ exitCode, result, stderr }) {
  const err = result?.error == null ? '' : String(result.error);
  const errText = result?.error == null ? '' : typeof result.error === 'string' ? err : JSON.stringify(result.error);
  const usage = result?.usage || {};
  const tokens = sumUsage(usage.input_tokens, usage.output_tokens);
  if (GEMINI_QUOTA_RE.test(String(stderr || '')) || GEMINI_QUOTA_RE.test(errText)) {
    return { status: 'QUOTA', findings: [], tokens, error: errText || String(stderr || '').trim() };
  }
  if (exitCode !== 0) {
    return { status: 'FAIL', findings: [], tokens, error: errText || String(stderr || '').trim() || `exit code ${exitCode}` };
  }
  if (!result) return { status: 'FAIL', findings: [], tokens, error: 'no result event' };
  if (result.status === 'ERROR') return { status: 'FAIL', findings: [], tokens, error: errText || 'result status ERROR' };
  if (result.structured_output == null || GEMINI_DENIED_RE.test(String(stderr || ''))) {
    return { status: 'DENIED', findings: [], tokens, error: '' };
  }
  const findings = Array.isArray(result.structured_output.findings) ? result.structured_output.findings : [];
  return { status: 'ok', findings, tokens, error: '' };
}

export function isSecretPath(p) {
  const name = String(p).split(/[\\/]/).pop().toLowerCase();
  return SECRET_PATTERNS.some((re) => re.test(name));
}

function unquoteGitPath(s) {
  const bytes = [];
  const body = s.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== '\\') { bytes.push(...Buffer.from(ch, 'utf8')); continue; }
    const n = body[++i];
    const oct = /^[0-7]{3}/.exec(body.slice(i, i + 3));
    if (oct) { bytes.push(parseInt(oct[0], 8)); i += 2; continue; }
    const map = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11 };
    if (n in map) bytes.push(map[n]);
    else bytes.push(...Buffer.from(String(n ?? ''), 'utf8'));
  }
  return Buffer.from(bytes).toString('utf8');
}

// Every path a diff section names (old and new, quoted or not, rename lines). Defense in depth.
function headerPaths(section) {
  const out = new Set();
  const head = /^diff --git (.*)$/m.exec(section);
  if (head) {
    const rest = head[1];
    const quoted = rest.match(/"(?:[^"\\]|\\.)*"/g) || [];
    if (quoted.length) {
      for (const q of quoted) out.add(unquoteGitPath(q).replace(/^[ab]\//, ''));
      const plain = rest.replace(/"(?:[^"\\]|\\.)*"/g, ' ').trim();
      for (const t of plain.split(/\s+/).filter(Boolean)) out.add(t.replace(/^[ab]\//, ''));
    } else {
      const m = /^a\/(.+?) b\/(.+)$/.exec(rest);
      if (m) { out.add(m[1]); out.add(m[2]); }
      else {
        // no prefix (diff.noprefix): "X X" or "X Y"; test the halves and every token
        const half = rest.length >> 1;
        out.add(rest.slice(0, half).trim());
        out.add(rest.slice(half).trim());
        for (const t of rest.split(' ')) if (t) out.add(t);
      }
    }
  }
  for (const m of section.matchAll(/^(?:rename|copy) (?:from|to) (.+)$/gm)) {
    out.add(m[1].startsWith('"') ? unquoteGitPath(m[1]) : m[1]);
  }
  for (const m of section.matchAll(/^(?:---|\+\+\+) (?!\/dev\/null)(.+)$/gm)) {
    const p = m[1].startsWith('"') ? unquoteGitPath(m[1]) : m[1];
    out.add(p.replace(/^[ab]\//, ''));
  }
  return [...out].filter(Boolean);
}

// Builds the Gemini prompt: instructions, numbered file blocks, then the diff. Secret paths are skipped.
export function buildReviewPrompt({ instructions, files, diff, maxKB }) {
  const skipped = new Set();
  const parts = [String(instructions || '').trimEnd()];
  for (const f of files || []) {
    if (isSecretPath(f.path)) {
      skipped.add(f.path);
      continue;
    }
    const lines = String(f.text).split(/\r?\n/).map((line, i) => `${i + 1}\t${line}`);
    parts.push(`=== FILE: ${f.path} ===`, ...lines);
  }
  if (diff) {
    for (const section of String(diff).split(/^(?=diff --git )/m)) {
      if (!section.trim()) continue;
      const secret = headerPaths(section).filter((p) => isSecretPath(p));
      if (secret.length) {
        for (const p of secret) skipped.add(p);
        continue;
      }
      parts.push(section.trimEnd());
    }
  }
  const prompt = parts.join('\n') + '\n';
  if (Buffer.byteLength(prompt, 'utf8') > maxKB * 1024) throw new Error('prompt too large');
  return { prompt, skipped: [...skipped] };
}

export function resolveGeminiModel({ wanted, effort, available }) {
  if (wanted) {
    if (!String(wanted).startsWith('gemini-')) throw new Error('only gemini models are allowed');
    return wanted;
  }
  const gem = (available || []).filter((id) => id.startsWith('gemini-'));
  if (gem.length === 0) throw new Error('no gemini model available');
  return gem.find((id) => id.endsWith(`-${effort}`)) || gem.find((id) => id.endsWith('-high')) || gem[0];
}

export function denyAllSettings() {
  return {
    permissions: {
      deny: [
        'write_file(*)',
        'read_file(*)',
        'command(*)',
        'read_url(*)',
        'execute_url(*)',
        'download_url(*)',
        'mcp(*)',
      ],
    },
    allowNonWorkspaceAccess: false,
  };
}

// Checks, then applies, a patch in `tree` (working tree only). Never shell, never --3way.
export function applyPatch({ tree, patchFile }) {
  const file = resolve(patchFile);
  const opts = { cwd: tree, windowsHide: true, encoding: 'utf8' };
  const check = spawnSync('git', ['apply', '--check', '--whitespace=nowarn', file], opts);
  if (check.error || check.status !== 0) {
    return { ok: false, error: String(check.error?.message || check.stderr || check.stdout || 'git apply --check failed').trim() };
  }
  const apply = spawnSync('git', ['apply', '--whitespace=nowarn', file], opts);
  if (apply.error || apply.status !== 0) {
    return { ok: false, error: String(apply.error?.message || apply.stderr || apply.stdout || 'git apply failed').trim() };
  }
  return { ok: true, error: '' };
}
