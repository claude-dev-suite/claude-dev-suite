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
 * Extract description string literals from a TypeScript source file.
 * Handles single-quote, double-quote, and template-string forms.
 * Multi-line template strings concatenate to one logical string for measurement.
 *
 * Returns array of { lineNum, value, justified }
 */
function extractDescriptions(content) {
  const lines = content.split('\n');
  const results = [];

  // Match: description: '...' / description: "..." / description: `...`
  // For multi-line backtick strings we capture the content across lines.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*description\s*:\s*(['"`])/);
    if (!m) continue;

    const quote = m[1];
    let value = '';

    // Single-line string?
    if (quote !== '`') {
      const sm = line.match(new RegExp(`^\\s*description\\s*:\\s*${quote}((?:\\\\.|[^${quote}\\\\])*)${quote}`));
      if (sm) {
        value = sm[1].replace(/\\(.)/g, '$1');
      } else {
        // Fallback: skip — hard to parse
        continue;
      }
    } else {
      // Backtick — may span multiple lines
      const startIdx = line.indexOf('`');
      let rest = line.slice(startIdx + 1);
      let closed = false;
      const parts = [];
      let j = i;
      while (true) {
        const closeIdx = rest.indexOf('`');
        if (closeIdx >= 0) {
          parts.push(rest.slice(0, closeIdx));
          closed = true;
          break;
        }
        parts.push(rest);
        j++;
        if (j >= lines.length) break;
        rest = lines[j];
      }
      if (!closed) continue;
      value = parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    // Look for justification comment in the previous 3 non-empty lines
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
