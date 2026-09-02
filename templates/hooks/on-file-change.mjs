#!/usr/bin/env node
/**
 * on-file-change.mjs — the file-write hook primitive for dev-suite recipes.
 *
 * Every recipe that reacts to a file write needs the same three things: read the
 * hook payload, decide whether this file is interesting, and then either run a
 * command on it or refuse the write. They were all doing it by interpolating
 * `$CLAUDE_FILE_PATHS`, an environment variable Claude Code does not define — so
 * the formatters formatted nothing and, worse, the "block sensitive files"
 * guard grepped an empty string and never blocked anything while the dashboard
 * showed it as active.
 *
 * Node rather than shell + `jq`: a stock Windows install has neither `jq` nor a
 * POSIX shell, and Windows is this project's primary platform. Node is already
 * required to run dev-suite's MCP servers.
 *
 * Usage
 *   node .claude/hooks/on-file-change.mjs [filters] -- <command> [args...]
 *   node .claude/hooks/on-file-change.mjs [filters] --block "<reason>"
 *
 * Filters (all optional; every one given must match)
 *   --ext .ts,.tsx        file extensions, comma separated
 *   --match <regex>       case-insensitive regex against the project-relative path
 *
 * Actions
 *   -- <command> [args]   run it, with the file path appended unless the argument
 *                         list already contains the {file} placeholder
 *   --block "<reason>"    refuse the write: exit 2 with the reason on stderr
 *
 * Options
 *   --strict              propagate the command's failure as exit 2 (Claude sees
 *                         stderr). Off by default: a formatter that fails should
 *                         not derail the turn.
 *   --no-file             run the command with no path appended. Needed for
 *                         anything whose positional slot means something else:
 *                         `npm audit <path>` reads the path as a subcommand and
 *                         fails, and `tsc --noEmit <file>` makes tsc ignore
 *                         tsconfig.json entirely. Use {file} when the command
 *                         wants the path somewhere specific instead.
 *
 * Exit codes follow the documented hook contract: 2 blocks a PreToolUse call (or
 * surfaces stderr on PostToolUse), anything else is non-blocking. `exit 1`, which
 * the recipes used for their block guard, is only a non-blocking error — it never
 * blocked anything even when the path did match.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * Quote one argument for the shell `spawnSync({shell:true})` will invoke.
 *
 * Only needed because of that flag: without a shell the vector is passed
 * through untouched, with one it is flattened into a string. Values that are
 * already safe are left alone so the command stays readable in a log.
 */
function quoteForShell(value) {
  // A plain character set, not a regex: every layer between this source and
  // the file it lands in is one more chance to eat a backslash.
  const SHELL_SPECIAL = " \t\n\r\"'`$&|<>()!^;*?[]{},";
  if (![...value].some(ch => SHELL_SPECIAL.includes(ch))) return value;
  if (process.platform === 'win32') {
    // cmd.exe: double quotes, and a literal double quote is doubled.
    return `"${value.replace(/"/g, '""')}"`;
  }
  // POSIX: single quotes, closing and reopening around any literal quote.
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseArgs(argv) {
  const opts = { ext: null, match: null, block: null, strict: false, noFile: false, command: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      opts.command = argv.slice(i + 1);
      break;
    } else if (arg === '--ext') {
      opts.ext = (argv[++i] ?? '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean)
        .map(e => (e.startsWith('.') ? e : `.${e}`));
    } else if (arg === '--match') {
      opts.match = argv[++i] ?? null;
    } else if (arg === '--block') {
      opts.block = argv[++i] ?? 'This file is protected';
    } else if (arg === '--strict') {
      opts.strict = true;
    } else if (arg === '--no-file') {
      opts.noFile = true;
    }
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

  const filePath = payload?.tool_input?.file_path ?? payload?.tool_input?.notebook_path;
  if (typeof filePath !== 'string' || filePath.length === 0) return 0;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd();
  const relative = path.relative(projectDir, filePath) || filePath;
  const normalized = relative.split(path.sep).join('/');

  if (opts.ext && !opts.ext.includes(path.extname(normalized).toLowerCase())) return 0;

  if (opts.match) {
    let pattern;
    try {
      pattern = new RegExp(opts.match, 'i');
    } catch {
      // A malformed pattern must not take the hook — or the write — down with it.
      return 0;
    }
    if (!pattern.test(normalized)) return 0;
  }

  if (opts.block !== null) {
    // Exit 2 is what actually blocks. The reason is shown to Claude.
    process.stderr.write(`BLOCKED: ${opts.block} (${normalized})\n`);
    return 2;
  }

  if (opts.command.length === 0) return 0;

  const [bin, ...rest] = opts.command;
  const usesPlaceholder = rest.some(a => a.includes('{file}'));
  const args = usesPlaceholder
    ? rest.map(a => a.split('{file}').join(filePath))
    : opts.noFile
      ? rest
      : [...rest, filePath];

  // `shell: true` is needed so `npx`, `npm` and `dotnet` resolve through their
  // Windows shims — but Node then joins the arguments into a command line
  // *without quoting them*, so a project under "C:\\My Project" would break the
  // path in half and format the wrong file, or nothing. Quote them ourselves.
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
