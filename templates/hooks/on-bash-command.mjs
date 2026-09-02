#!/usr/bin/env node
/**
 * on-bash-command.mjs — the Bash-command hook primitive.
 *
 * The counterpart to on-file-change.mjs, for hooks that react to a command
 * rather than a file write. Same reason for existing: the built-in hook
 * templates read the command with `jq`, and a stock Windows install — the
 * primary platform here — has neither `jq` nor a POSIX shell, so those hooks
 * silently did nothing. Node is already required to run dev-suite's MCP servers.
 *
 * Usage
 *   node .claude/hooks/on-bash-command.mjs [filters] --log <file>
 *   node .claude/hooks/on-bash-command.mjs [filters] --block "<reason>"
 *   node .claude/hooks/on-bash-command.mjs [filters] -- <command> [args...]
 *
 * Filters
 * Matching
 *   --contains a,b,c      the path contains any of these (case-insensitive)
 *   --endswith .x,name.y  the path ends with any of these
 *
 * The two are OR'd together: a file matches if any listed value matches. There
 * is deliberately no regex flag. Every filter these hooks have ever needed is a
 * substring or a suffix, and taking a pattern from the command line meant
 * compiling an unbounded external string on every tool call — a sink worth
 * removing rather than guarding.
 *
 * Runs of whitespace in the command are collapsed before matching, so
 * `--contains "git commit"` catches `git   commit` too.
 *
 * Actions
 *   --log <file>      append a timestamped line, then exit 0
 *   --block "<why>"   refuse the call: exit 2 with the reason on stderr
 *   -- <command>      run it; {command} in the arguments is replaced with the
 *                     intercepted command, otherwise it is appended
 *
 * Options
 *   --strict          propagate the command's failure as exit 2
 *
 * Exit codes follow the documented hook contract: 2 blocks a PreToolUse call,
 * anything else is non-blocking. Fail-open everywhere: an unexpected payload or
 * an unwritable log is never a reason to fail the tool call.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function quoteForShell(value) {
  // A plain character set, not a regex: every layer between this source and the
  // file it lands in is one more chance to eat a backslash.
  const SHELL_SPECIAL = " \t\n\r\"'`$&|<>()!^;*?[]{},";
  if (![...value].some(ch => SHELL_SPECIAL.includes(ch))) return value;
  if (process.platform === 'win32') return `"${value.replace(/"/g, '""')}"`;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Does this path match the filters the caller gave?
 *
 * No filters means "everything". Values are compared case-insensitively against
 * the project-relative, forward-slashed path.
 */
function matchesFilters(value, opts) {
  const haystack = value.toLowerCase();
  const contains = opts.contains ?? [];
  const endswith = opts.endswith ?? [];
  if (contains.length === 0 && endswith.length === 0) return true;
  if (contains.some(needle => haystack.includes(needle))) return true;
  return endswith.some(suffix => haystack.endsWith(suffix));
}

/** Split a comma-separated flag value into lowercase, non-empty parts. */
function csv(value) {
  return String(value ?? '')
    .split(',')
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);
}

function parseArgs(argv) {
  const opts = { contains: [], endswith: [], block: null, log: null, strict: false, command: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') { opts.command = argv.slice(i + 1); break; }
    else if (arg === '--contains') opts.contains = csv(argv[++i]);
    else if (arg === '--endswith') opts.endswith = csv(argv[++i]);
    else if (arg === '--block') opts.block = argv[++i] ?? 'This command is not allowed here';
    else if (arg === '--log') opts.log = argv[++i] ?? null;
    else if (arg === '--strict') opts.strict = true;
  }
  return opts;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const raw = await readStdin();
  if (!raw.trim()) return 0;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return 0;
  }

  const command = payload?.tool_input?.command;
  if (typeof command !== 'string' || command.length === 0) return 0;

  // Collapse whitespace so a filter written as "git commit" also catches the
  // same command typed with extra spaces or a newline.
  const flattened = command.replace(/\s+/g, ' ').trim();
  if (!matchesFilters(flattened, opts)) return 0;

  if (opts.block !== null) {
    // Exit 2 is the only code that blocks; the templates used to use 1, which
    // the contract treats as a non-blocking error.
    process.stderr.write(`BLOCKED: ${opts.block}\n`);
    return 2;
  }

  if (opts.log) {
    try {
      const projectDir = process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd();
      const file = path.isAbsolute(opts.log) ? opts.log : path.join(projectDir, opts.log);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, `[${new Date().toISOString()}] ${command}\n`);
    } catch {
      // A log we could not write is not worth failing a command over.
    }
    return 0;
  }

  if (opts.command.length === 0) return 0;

  const [bin, ...rest] = opts.command;
  const usesPlaceholder = rest.some(a => a.includes('{command}'));
  const args = usesPlaceholder ? rest.map(a => a.split('{command}').join(command)) : rest;

  const result = spawnSync(quoteForShell(bin), args.map(quoteForShell), {
    stdio: 'inherit',
    shell: true,
  });

  if (opts.strict && result.status !== 0) {
    process.stderr.write(`${bin} exited with ${result.status ?? 'a signal'}\n`);
    return 2;
  }
  return 0;
}

main().then(
  code => process.exit(code),
  () => process.exit(0)
);
