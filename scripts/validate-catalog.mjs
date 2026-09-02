#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Validates the dev-suite component catalog for internal consistency:
 *
 * 1. Every MCP workspace has a metadata.json with the documented fields
 *    (name, description, shortDescription, category, tools, envVars,
 *    recommendedFor, detectedWhen) and metadata.name matches the directory.
 * 2. package.json version matches the version passed to `new Server()` in
 *    src/index.ts (these drift silently otherwise).
 * 3. metadata.recommendedFor entries reference existing agent names
 *    (or the `all` wildcard).
 * 4. Agent frontmatter `mcp_servers` entries reference existing workspaces;
 *    `skills` / `core_skills` / `extended_skills` entries reference existing
 *    skill directories (bundle: refs are resolved by agent-bundles.ts and
 *    only checked for prefix syntax here).
 * 5. registry/*.json files parse and their relative `$schema` refs exist.
 *
 * Exits non-zero and prints every violation when the catalog is inconsistent.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

function err(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ---------------------------------------------------------------------------
// Collect agents (name + frontmatter refs)
// ---------------------------------------------------------------------------

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const lines = match[1].split(/\r?\n/);
  const data = {};
  let currentKey = null;
  for (const line of lines) {
    const keyMatch = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      const value = keyMatch[2].trim();
      data[currentKey] = value === '' || value === '|' || value === '>' ? [] : value;
      if (typeof data[currentKey] === 'string') currentKey = null;
      continue;
    }
    const itemMatch = line.match(/^\s+-\s+(.+)$/);
    if (itemMatch && currentKey && Array.isArray(data[currentKey])) {
      data[currentKey].push(itemMatch[1].trim());
    }
  }
  return data;
}

const agentFiles = [];
(function walkAgents(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAgents(full);
    else if (entry.name.endsWith('.md') && entry.name !== 'README.md') agentFiles.push(full);
  }
})(path.join(ROOT, 'agents'));

const agentNames = new Set(['all']);
/** Skill bundles, so `bundle:` references and their contents can be checked. */
const bundlesPath = path.join(
  ROOT,
  'configurator/dashboard/server/src/services/agent-bundles.ts'
);
const bundleIds = new Set();
/** Bundle id -> skill directory paths. Parsed once; validated after skillDirs. */
const bundles = fs.existsSync(bundlesPath)
  ? parseStringArrayRecord(fs.readFileSync(bundlesPath, 'utf-8'), 'BUNDLES') ?? {}
  : {};
for (const id of Object.keys(bundles)) bundleIds.add(id);

const agents = [];
for (const file of agentFiles) {
  const rel = path.relative(ROOT, file);
  const content = fs.readFileSync(file, 'utf-8');
  const fm = parseFrontmatter(content);
  if (!fm || !fm.name) {
    err(`${rel}: missing frontmatter or frontmatter "name"`);
    continue;
  }
  // Everything after the closing `---`. The body is what the model is told to
  // do; the frontmatter is what it is allowed to do. The gates below check the
  // two agree.
  const fmBlock = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const body = fmBlock ? content.slice(fmBlock[0].length) : content;
  agentNames.add(fm.name);
  agents.push({ rel, fm, body });
}

// ---------------------------------------------------------------------------
// Collect skill directories (any depth) for reference resolution
// ---------------------------------------------------------------------------

const skillDirs = new Set();
(function walkSkills(dir, relPrefix) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    skillDirs.add(rel);
    skillDirs.add(entry.name); // allow bare-name references
    walkSkills(path.join(dir, entry.name), rel);
  }
})(path.join(ROOT, 'skills'), '');

// ---------------------------------------------------------------------------
// Validate MCP workspaces
// ---------------------------------------------------------------------------

const mcpRoot = path.join(ROOT, 'mcp-servers');
const workspaces = readJson(path.join(mcpRoot, 'package.json')).workspaces;
const REQUIRED_METADATA_FIELDS = [
  'name',
  'description',
  'shortDescription',
  'category',
  'tools',
  'envVars',
  'recommendedFor',
  'detectedWhen',
];

/** Workspaces that are actually MCP servers, i.e. excluding shared libraries. */
const serverWorkspaces = [];

for (const ws of workspaces) {
  const wsDir = path.join(mcpRoot, ws);
  const label = `mcp-servers/${ws}`;

  if (!fs.existsSync(wsDir)) {
    err(`${label}: workspace listed in mcp-servers/package.json but directory is missing`);
    continue;
  }

  // Library workspaces (shared helpers) are not MCP servers and carry no
  // catalog metadata. Detected structurally rather than by name: an MCP server
  // is a package that speaks the protocol, so it depends on
  // `@modelcontextprotocol/sdk`. A library does not. A real server that dropped
  // that dependency would fail to build long before this gate ran.
  const wsPkgPath = path.join(wsDir, 'package.json');
  const wsPkg = fs.existsSync(wsPkgPath) ? readJson(wsPkgPath) : {};
  const deps = { ...(wsPkg.dependencies ?? {}), ...(wsPkg.devDependencies ?? {}) };
  if (!('@modelcontextprotocol/sdk' in deps)) continue;
  serverWorkspaces.push(ws);

  // metadata.json shape
  const metadataPath = path.join(wsDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    err(`${label}: metadata.json is missing`);
    continue;
  }
  let metadata;
  try {
    metadata = readJson(metadataPath);
  } catch (e) {
    err(`${label}/metadata.json: invalid JSON (${e.message})`);
    continue;
  }
  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!(field in metadata)) err(`${label}/metadata.json: missing field "${field}"`);
  }
  if (metadata.name && metadata.name !== ws) {
    err(`${label}/metadata.json: name "${metadata.name}" does not match directory "${ws}"`);
  }
  if (Array.isArray(metadata.tools) && metadata.tools.length === 0) {
    err(`${label}/metadata.json: tools[] is empty`);
  }

  // tools[] is typed `string[]` in server/src/types.ts. One server used to ship
  // `{name, description}` objects, which the dashboard rendered as "[object Object]".
  const nonStringTools = (metadata.tools ?? []).filter((t) => typeof t !== 'string');
  if (nonStringTools.length > 0) {
    err(
      `${label}/metadata.json: tools[] must be an array of strings, found ` +
        `${nonStringTools.length} non-string entr${nonStringTools.length === 1 ? 'y' : 'ies'}`
    );
  }

  // tools[] must match the tools the server actually registers with ListTools.
  const srcIndex = path.join(wsDir, 'src', 'index.ts');
  if (fs.existsSync(srcIndex) && nonStringTools.length === 0) {
    const src = fs.readFileSync(srcIndex, 'utf-8');
    const registered = new Set();
    // Tool objects in the ListTools array: `name: "x",` followed by a description.
    // `.` excludes newlines in JS, so an optional line comment is matched
    // without needing any newline escape in the literal.
    const toolRe = /name:\s*["']([a-z][a-z0-9_]*)["']\s*,\s*(?:\/\/.*\s*)?description/g;
    let tm;
    while ((tm = toolRe.exec(src)) !== null) registered.add(tm[1]);

    if (registered.size > 0) {
      const declared = new Set(metadata.tools);
      const undeclared = [...registered].filter((t) => !declared.has(t)).sort();
      const phantom = [...declared].filter((t) => !registered.has(t)).sort();
      if (undeclared.length) {
        err(`${label}/metadata.json: tools[] is missing registered tool(s): ${undeclared.join(', ')}`);
      }
      if (phantom.length) {
        err(`${label}/metadata.json: tools[] declares tool(s) the server does not register: ${phantom.join(', ')}`);
      }
    }
  }

  // Every environment variable a server reads must be declared, or the wizard
  // never prompts for it and the server ships inert.
  const srcDir = path.join(wsDir, 'src');
  if (fs.existsSync(srcDir)) {
    const declaredEnv = new Set((metadata.envVars ?? []).map((v) => v?.name).filter(Boolean));
    const readEnv = new Set();
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts')) {
          const src = fs.readFileSync(full, 'utf-8');
          for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) readEnv.add(m[1]);
          for (const m of src.matchAll(/process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g)) readEnv.add(m[1]);
        }
      }
    };
    walk(srcDir);
    // NODE_ENV and friends are ambient, not dev-suite configuration.
    const AMBIENT = new Set(['NODE_ENV', 'HOME', 'USERPROFILE', 'PATH', 'TMPDIR', 'TEMP', 'DEBUG', 'CI']);
    const undeclaredEnv = [...readEnv].filter((v) => !declaredEnv.has(v) && !AMBIENT.has(v)).sort();
    if (undeclaredEnv.length) {
      warn(`${label}/metadata.json: envVars[] does not declare ${undeclaredEnv.join(', ')} (read in src/)`);
    }
  }
  for (const agentId of metadata.recommendedFor ?? []) {
    if (!agentNames.has(agentId)) {
      err(`${label}/metadata.json: recommendedFor references unknown agent "${agentId}"`);
    }
  }

  // package.json version vs new Server() version
  const pkgPath = path.join(wsDir, 'package.json');
  const indexPath = path.join(wsDir, 'src', 'index.ts');
  if (fs.existsSync(pkgPath) && fs.existsSync(indexPath)) {
    const pkgVersion = readJson(pkgPath).version;
    const indexSrc = fs.readFileSync(indexPath, 'utf-8');
    const serverVersion = indexSrc.match(/version:\s*["']([^"']+)["']/)?.[1];
    if (!serverVersion) {
      warn(`${label}: could not find a version literal in src/index.ts`);
    } else if (serverVersion !== pkgVersion) {
      err(
        `${label}: package.json version ${pkgVersion} != new Server() version ${serverVersion} in src/index.ts`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Body-vs-tools consistency.
//
// `allowed-tools` is an allowlist, so an instruction the body gives that needs
// a tool the frontmatter withholds is simply inert — and inert silently. Three
// agents shipped that way: react-expert and vue-expert were both told to run
// `npx vitest run` and re-run until green with no `Bash`, and
// integration-validator-expert's entire delegate-fix-then-revalidate loop had
// `Task` but no `Bash` on either end of it.
//
// False-positive control: fenced code blocks are stripped before matching.
// A command inside a fence is very often illustrative — a snippet the agent is
// meant to *write into a file*, or to show the user — whereas a real
// instruction to execute reads as prose ("Run the tests", "use ESLint via
// Bash", "delegate fix ... via Task"). Inline code spans are deliberately NOT
// stripped: "run `npm test` first" is prose carrying a code span, and is
// exactly what this gate exists to catch. The pattern set is intentionally
// small and literal for the same reason — it is a tripwire for the phrasing the
// fleet actually uses, not a general intent classifier.
// ---------------------------------------------------------------------------

{
  const stripFences = (text) => text.replace(/```[\s\S]*?```/g, '');
  const EXEC_RE = /npm run|npm test|pytest|npx |via Bash|Run the tests/i;
  const DELEGATE_RE = /via Task|delegate fix|subagent_type/i;

  /** `allowed-tools` is a flat comma-separated allowlist; compare whole tokens. */
  const toolSet = (fm) =>
    new Set(
      String(fm['allowed-tools'] ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    );

  for (const { rel, fm, body } of agents) {
    // Gate 3 — no unrestricted-by-omission agents. Without `allowed-tools` a
    // subagent inherits every tool the session has, including Bash and Task,
    // which is a permission grant nobody wrote down.
    if (fm['allowed-tools'] === undefined) {
      err(`${rel}: no "allowed-tools" — an agent without an allowlist inherits every tool`);
      continue;
    }

    const tools = toolSet(fm);
    const prose = stripFences(body ?? '');

    // Gate 1 — body says "execute", frontmatter withholds Bash.
    const exec = prose.match(EXEC_RE);
    if (exec && !tools.has('Bash')) {
      err(
        `${rel}: body instructs execution (matched "${exec[0].trim()}") but allowed-tools has no Bash — ` +
          `grant Bash, or remove the instruction and defer to verification-runner`
      );
    }

    // Gate 2 — body says "delegate", frontmatter withholds Task.
    const delegate = prose.match(DELEGATE_RE);
    if (delegate && !tools.has('Task')) {
      err(
        `${rel}: body describes delegation (matched "${delegate[0].trim()}") but allowed-tools has no Task`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Agent `model:` values. The field drives real cost per invocation and is
// passed through to installed agents verbatim, but nothing validated it — a
// typo shipped silently.
// ---------------------------------------------------------------------------

{
  const VALID_MODELS = new Set(['sonnet', 'opus', 'haiku']);
  for (const { rel, fm } of agents) {
    const model = fm.model;
    // Absence is deliberate — one agent inherits the session default.
    if (model === undefined) continue;
    if (!VALID_MODELS.has(String(model).trim())) {
      err(`${rel}: model "${model}" is not one of sonnet|opus|haiku`);
    }
    // Gate 4 — sonnet is the fleet default; anything else is a per-invocation
    // cost or capability decision that should carry its reason in the file.
    // A warning, not an error: the rationale is documentation, and inventing
    // one to silence CI would be worse than the gap it papers over.
    if (String(model).trim() !== 'sonnet' && fm.model_rationale === undefined) {
      warn(`${rel}: model "${model}" differs from the sonnet default but declares no "model_rationale"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Agent categories: directories, the AgentCategory union and CATEGORY_PATHS
// must all line up. Six directories once had no mapping, so their agents fell
// into always-on `core` and never got a path-scoped rule file.
// ---------------------------------------------------------------------------

{
  const agentDirs = fs
    .readdirSync(path.join(ROOT, 'agents'), { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  const servicesDir = path.join(ROOT, 'configurator/dashboard/server/src/services');
  const agentsSrc = fs.readFileSync(path.join(servicesDir, 'agents.service.ts'), 'utf-8');
  const mapBlock = agentsSrc.slice(agentsSrc.indexOf('const categoryMap'));
  const mapped = new Set(
    [...mapBlock.slice(0, mapBlock.indexOf('};')).matchAll(/^\s*([a-z-]+)\s*:/gm)].map(m => m[1])
  );

  for (const dir of agentDirs) {
    if (!mapped.has(dir)) {
      err(`agents/${dir}: no entry in agents.service.ts categoryMap — its agents would fall back to always-on "core"`);
    }
  }

  const pathsSrc = fs.readFileSync(path.join(servicesDir, 'installation/category-paths.ts'), 'utf-8');
  const pathsBlock = pathsSrc.slice(pathsSrc.indexOf('CATEGORY_PATHS'));
  const withGlobs = new Set(
    [...pathsBlock.matchAll(/^\s{2}([a-z-]+)\s*:/gm)].map(m => m[1])
  );
  for (const dir of agentDirs) {
    const category = [...mapped].includes(dir) ? dir : null;
    if (category && !withGlobs.has(category) && !['ai'].includes(category)) {
      warn(`agents/${dir}: mapped category has no CATEGORY_PATHS entry — treated as always-on`);
    }
  }
}

// ---------------------------------------------------------------------------
// Validate agent frontmatter references
// ---------------------------------------------------------------------------

const workspaceSet = new Set(workspaces);
for (const { rel, fm } of agents) {
  for (const server of fm.mcp_servers ?? []) {
    if (!workspaceSet.has(server)) {
      err(`${rel}: mcp_servers references unknown server "${server}"`);
    }
  }
  const skillRefs = [
    ...(Array.isArray(fm.skills) ? fm.skills : []),
    ...(Array.isArray(fm.core_skills) ? fm.core_skills : []),
    ...(Array.isArray(fm.extended_skills) ? fm.extended_skills : []),
  ];
  for (const ref of skillRefs) {
    // `bundle:` refs are resolved at install time by agent-bundles.ts; the
    // bundles themselves are checked below, so the paths inside them are no
    // longer exempt from the filesystem check.
    if (ref.startsWith('bundle:')) {
      const bundleId = ref.slice('bundle:'.length);
      if (!bundleIds.has(bundleId)) {
        err(`${rel}: skills references unknown bundle "${bundleId}"`);
      }
      continue;
    }
    if (!skillDirs.has(ref)) {
      err(`${rel}: skills references unknown skill directory "${ref}"`);
    }
  }
}

// Every skill path inside a bundle must exist. `validate-catalog` used to skip
// `bundle:` references entirely, so a bundle could name a skill directory that
// had been renamed or deleted and nothing noticed until an install silently
// copied one skill fewer.
for (const [bundleId, skillPaths] of Object.entries(bundles)) {
  for (const skillPath of skillPaths) {
    if (!skillDirs.has(skillPath)) {
      err(`agent-bundles.ts: bundle "${bundleId}" references unknown skill directory "${skillPath}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Cross-check the hand-maintained tables against the filesystem
//
// Both of these are plain TypeScript objects that name agents and skills by
// string. Nothing verified those strings existed, so a renamed or removed
// component left a dangling reference that only showed up as a silently missing
// recommendation (STACK_TO_AGENTS pointed at `nuxt-expert`, an agent that has
// never existed) or as a skill an install could not copy.
// ---------------------------------------------------------------------------

/** Extract `key: [ 'a', 'b' ]` entries from an exported record literal. */
function parseStringArrayRecord(source, exportName) {
  const start = source.indexOf(`export const ${exportName}`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = source.slice(open + 1, i);
  const out = {};
  // Keys appear bare (`react: [...]`) and quoted (`'rag/foundation': [...]`).
  const entry = /(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = entry.exec(body)) !== null) {
    const key = m[1] ?? m[2] ?? m[3];
    out[key] = [...m[4].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
  }
  return out;
}

const agentIds = new Set(agents.map((a) => a.fm?.name).filter(Boolean));

const constantsPath = path.join(
  ROOT,
  'configurator/dashboard/server/src/services/detection/detection.constants.ts'
);
if (fs.existsSync(constantsPath)) {
  const src = fs.readFileSync(constantsPath, 'utf-8');
  const stackToAgents = parseStringArrayRecord(src, 'STACK_TO_AGENTS');
  if (stackToAgents) {
    for (const [stack, ids] of Object.entries(stackToAgents)) {
      for (const id of ids) {
        if (!agentIds.has(id)) {
          err(`detection.constants.ts: STACK_TO_AGENTS["${stack}"] references unknown agent "${id}"`);
        }
      }
    }
  }
  const stackToMcp = parseStringArrayRecord(src, 'STACK_TO_MCP');
  if (stackToMcp) {
    for (const [stack, names] of Object.entries(stackToMcp)) {
      for (const name of names) {
        if (!workspaceSet.has(name)) {
          err(`detection.constants.ts: STACK_TO_MCP["${stack}"] references unknown MCP server "${name}"`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Validate registry JSON files
// ---------------------------------------------------------------------------

const registryDir = path.join(ROOT, 'registry');
for (const entry of fs.readdirSync(registryDir)) {
  if (!entry.endsWith('.json')) continue;
  const filePath = path.join(registryDir, entry);
  let json;
  try {
    json = readJson(filePath);
  } catch (e) {
    err(`registry/${entry}: invalid JSON (${e.message})`);
    continue;
  }
  const schemaRef = json.$schema;
  if (typeof schemaRef === 'string' && schemaRef.startsWith('./')) {
    if (!fs.existsSync(path.join(registryDir, schemaRef))) {
      err(`registry/${entry}: $schema references missing file "${schemaRef}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

for (const w of warnings) console.warn(`WARN  ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR ${e}`);
  console.error(`\nCatalog validation failed with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(
  `Catalog OK: ${agents.length} agents, ${serverWorkspaces.length} MCP servers, ${warnings.length} warning(s).`
);
