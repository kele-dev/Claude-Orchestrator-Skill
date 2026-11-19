#!/usr/bin/env node
// SessionStart hook: prints hooks/rules.md to stdout (replaces `cat`, which is not available on every shell).
import { readFileSync } from 'node:fs';
process.stdout.write(readFileSync(new URL('./rules.md', import.meta.url), 'utf8'));
