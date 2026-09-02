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
 *   --match <regex>   case-insensitive regex against the command; omit to match all
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
 * Compile a caller-supplied match pattern, or return null.
 *
 * The pattern comes from the hook's own command line in `.claude/settings.json`,
 * so it is operator configuration rather than end-user input — but it is still
 * an unbounded string reaching `new RegExp`, and a pathological one would spend
 * the hook's budget backtracking on every file write. Two bounds make that
 * impossible to reach by accident: a length cap, and a refusal of nested
 * quantifiers, which is the shape that turns linear matching exponential.
 *
 * Returning null means "no opinion": the caller treats it as no match and exits
 * 0, because a misconfigured filter must never block a tool call.
 */
function compilePattern(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 200) return null;

  // A quantifier applied to a group that itself contains one — (a+)+, (a|b*)*
  // and friends. Cheap to spot, and no legitimate path filter needs it.
  if (/\([^)]*[+*][^)]*\)\s*[+*]/.test(pattern)) return null;

  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const opts = { match: null, block: null, log: null, strict: false, command: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') { opts.command = argv.slice(i + 1); break; }
    else if (arg === '--match') opts.match = argv[++i] ?? null;
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

  if (opts.match) {
    const pattern = compilePattern(opts.match);
    // A malformed or unbounded pattern must not take the tool call down with it.
    if (!pattern || !pattern.test(command)) return 0;
  }

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
