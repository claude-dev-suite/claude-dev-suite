#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * audit-mcp-descriptions.mjs
 *
 * Scans every MCP server source file under `mcp-servers/* /src/**`/*.ts and
 * verifies that tool `description:` fields stay under 120 characters.
 *
 * Verbose tool descriptions cost tokens on every Claude Code session that
 * loads the schema (the MCP tool list goes into context at startup). This
 * audit enforces a hard cap and requires explicit justification for any
 * description that exceeds it.
 *
 * Justification syntax: place a comment line `// audit-justification: <reason>`
 * IMMEDIATELY above the description property, e.g.
 *
 *   {
 *     name: 'fetch_docs',
 *     // audit-justification: required to disambiguate from search_docs
 *     description: 'Fetches and returns full documentation body for a given technology and topic from the knowledge base, with caching.',
 *   }
 *
 * Exit codes:
 *   0 — all descriptions <= 120 chars OR justified
 *   1 — at least one violation found
 *   2 — internal script error
 *
 * Usage: node scripts/audit-mcp-descriptions.mjs [--max-chars N] [--quiet]
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const MCP_DIR = path.join(REPO_ROOT, 'mcp-servers');

// CLI args
const args = process.argv.slice(2);
let MAX_CHARS = 120;
let QUIET = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max-chars') {
    MAX_CHARS = parseInt(args[++i], 10);
    if (Number.isNaN(MAX_CHARS) || MAX_CHARS <= 0) {
      console.error('Invalid --max-chars value');
      process.exit(2);
    }
  } else if (args[i] === '--quiet') {
    QUIET = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: audit-mcp-descriptions.mjs [--max-chars N] [--quiet]');
    process.exit(0);
  }
}

/**
 * Recursively find all .ts files under a directory, skipping node_modules and dist.
 */
async function findTsFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return out;
    throw e;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await findTsFiles(full)));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Read a string-valued expression starting just after a `description:` key.
 *
 * Handles every form that appears in the servers: a literal on the same line, a
 * literal on the following line, several literals joined with `+` across lines,
 * and multi-line template strings. Returns null for anything that is not a
 * concatenation of literals (a variable, a helper call), whose length cannot be
 * measured statically.
 */
function readStringExpression(lines, startLine, startCol) {
  let li = startLine;
  let ci = startCol;
  const parts = [];

  const peek = () => (li < lines.length ? lines[li][ci] : undefined);

  // Advance past whitespace, line comments and block comments, crossing lines.
  const skipTrivia = () => {
    while (li < lines.length) {
      const line = lines[li];
      if (ci >= line.length) { li++; ci = 0; continue; }
      const ch = line[ci];
      if (ch === ' ' || ch === '\t' || ch === '\r') { ci++; continue; }
      if (ch === '/' && line[ci + 1] === '/') { li++; ci = 0; continue; }
      if (ch === '/' && line[ci + 1] === '*') {
        ci += 2;
        while (li < lines.length) {
          const close = lines[li].indexOf('*/', ci);
          if (close >= 0) { ci = close + 2; break; }
          li++; ci = 0;
        }
        continue;
      }
      return;
    }
  };

  const readLiteral = (quote) => {
    ci++; // consume the opening quote
    let out = '';
    while (li < lines.length) {
      const line = lines[li];
      if (ci >= line.length) {
        // Only template strings may span lines; a newline inside '' or "" means
        // this is not a literal we can measure.
        if (quote !== '`') return null;
        out += ' ';
        li++; ci = 0;
        continue;
      }
      const ch = line[ci];
      // charCode 92 is the backslash escape prefix
      if (ch.charCodeAt(0) === 92) { out += line[ci + 1] ?? ''; ci += 2; continue; }
      if (ch === quote) { ci++; return out; }
      out += ch; ci++;
    }
    return null; // unterminated
  };

  for (;;) {
    skipTrivia();
    const ch = peek();
    if (ch !== "'" && ch !== '"' && ch !== '`') return null;
    const literal = readLiteral(ch);
    if (literal === null) return null;
    parts.push(literal);
    skipTrivia();
    if (peek() === '+') { ci++; continue; }
    break;
  }

  return { value: parts.join('').replace(/\s+/g, ' ').trim() };
}

/**
 * Extract description string literals from a TypeScript source file.
 *
 * Returns array of { lineNum, value, length, justified, justification }
 */
function extractDescriptions(content) {
  const lines = content.split('\n');
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    // The key may be the only thing on its line — the value can start on the
    // next one. Matching only `description:` (not the quote after it) is what
    // makes those fields visible to the audit.
    const key = lines[i].match(/^\s*description\s*:/);
    if (!key) continue;

    const parsed = readStringExpression(lines, i, key[0].length);
    if (!parsed) continue;
    const value = parsed.value;

    // A justification must sit on the line immediately above the field.
    let justified = false;
    let just = '';
    for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
      const trimmed = lines[k].trim();
      if (trimmed === '') continue;
      const cm = trimmed.match(/^\/\/\s*audit-justification\s*:\s*(.+)$/i);
      if (cm) {
        justified = true;
        just = cm[1].trim();
      }
      break;
    }

    results.push({
      lineNum: i + 1,
      value,
      length: value.length,
      justified,
      justification: just,
    });
  }

  return results;
}

async function main() {
  const tsFiles = await findTsFiles(MCP_DIR);
  if (tsFiles.length === 0) {
    if (!QUIET) console.log(`No TypeScript files found under ${MCP_DIR}`);
    return 0;
  }

  let total = 0;
  let violations = 0;
  let justified = 0;

  const violationDetails = [];

  for (const file of tsFiles) {
    const rel = path.relative(REPO_ROOT, file);
    const content = await fs.readFile(file, 'utf8');
    const descs = extractDescriptions(content);
    for (const d of descs) {
      total++;
      if (d.length > MAX_CHARS) {
        if (d.justified) {
          justified++;
          if (!QUIET) {
            console.log(`✓ ${rel}:${d.lineNum} (${d.length} chars, JUSTIFIED: ${d.justification})`);
          }
        } else {
          violations++;
          violationDetails.push({ file: rel, line: d.lineNum, length: d.length, value: d.value });
        }
      }
    }
  }

  if (!QUIET) {
    console.log(`\nScanned ${tsFiles.length} files, ${total} description fields.`);
    console.log(`  Within limit (≤${MAX_CHARS} chars): ${total - violations - justified}`);
    console.log(`  Over limit, justified: ${justified}`);
    console.log(`  Over limit, NOT justified: ${violations}`);
  }

  if (violations > 0) {
    console.error(`\n✗ ${violations} description${violations > 1 ? 's' : ''} exceed ${MAX_CHARS} chars without justification:\n`);
    for (const v of violationDetails) {
      console.error(`  ${v.file}:${v.line}  (${v.length} chars)`);
      console.error(`    "${v.value.slice(0, 80)}${v.value.length > 80 ? '...' : ''}"`);
    }
    console.error(`\nFix: shorten the description, OR add a justification comment immediately above:`);
    console.error(`    // audit-justification: <one-sentence reason>`);
    console.error(`    description: '...'`);
    return 1;
  }

  if (!QUIET) console.log('\n✓ All MCP tool descriptions within budget.');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Audit script error:', err);
    process.exit(2);
  });
