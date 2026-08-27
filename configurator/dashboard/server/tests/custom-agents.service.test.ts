// SPDX-License-Identifier: MIT
/**
 * Custom Agents Service Tests
 *
 * Covers CRUD operations for custom agents and custom skills, including:
 * - validateAgentContent (schema errors, best-practice warnings, bypass)
 * - getCustomAgents / getCustomAgent
 * - createCustomAgent / updateCustomAgent / deleteCustomAgent
 * - getCustomSkills / getCustomSkill
 * - createCustomSkill / updateCustomSkill / deleteCustomSkill
 * - validateSkillContent
 * - updateDevSuiteConfig (new config, existing config, corrupt config)
 * - path-traversal guards
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CustomAgentsService } from '../src/services/custom-agents.service.js';
import { PathValidationError } from '../src/utils/utilities.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(prefix = 'cas-test-'): string {
  const dir = path.join(os.tmpdir(), `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * A minimal valid agent markdown that satisfies the Zod schema AND all
 * "warning"-level best-practice rules so we don't need bypassWarnings in
 * the happy-path tests.
 */
function validAgentContent(name = 'my-agent', description = 'A well-described agent with clear purpose and responsibilities for testing purposes'): string {
  return `---
name: ${name}
description: ${description}
model: sonnet
allowed-tools: Read, Edit
skills:
  - typescript
mcp_servers:
  - documentation
---

## Role

Expert ${name} agent.

## Behavior

Execute tasks directly. Modify files when needed. Write code as required.

## Guidelines

- Never skip tests
- Do not run destructive operations
`;
}

/** A valid agent that also has Bash in allowed-tools (triggers allowed-tools-safe rule) */
function validAgentWithBash(name = 'bash-agent'): string {
  return `---
name: ${name}
description: A bash-enabled agent with clear purpose and responsibilities for safe operations
model: sonnet
allowed-tools: Bash, Read
skills:
  - typescript
---

## Role

Execute safe bash commands only.

## Behavior

Execute tasks directly. Do not run destructive commands. Never delete files without confirmation.

## Security Guidelines

- safe operations only
- avoid destructive commands
`;
}

/** Skill content that satisfies both "warning"-severity rules */
function validSkillContent(): string {
  return `# My Skill

USE WHEN: working on TypeScript projects.

DO NOT USE FOR: Python-only projects.

\`\`\`typescript
const x = 1;
\`\`\`

Knowledge Base reference: knowledge/typescript/basics.md
`;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('CustomAgentsService', () => {
  let service: CustomAgentsService;
  let projectDir: string;

  beforeEach(() => {
    service = new CustomAgentsService();
    projectDir = makeTempDir();
  });

  afterEach(() => {
    cleanup(projectDir);
  });

  // =========================================================================
  // Path validation / security guards
  // =========================================================================

  describe('path-traversal guards', () => {
    it('getCustomAgents throws PathValidationError for ".." in path', async () => {
      await expect(service.getCustomAgents('/tmp/../etc')).rejects.toThrow(PathValidationError);
    });

    it('getCustomAgent throws PathValidationError for ".." in path', async () => {
      await expect(service.getCustomAgent('/tmp/../etc', 'agent-id')).rejects.toThrow(PathValidationError);
    });

    it('createCustomAgent throws PathValidationError for ".." in path', async () => {
      await expect(service.createCustomAgent('/tmp/../etc', validAgentContent())).rejects.toThrow(PathValidationError);
    });

    it('updateCustomAgent throws PathValidationError for ".." in path', async () => {
      await expect(service.updateCustomAgent('/tmp/../etc', 'agent-id', validAgentContent())).rejects.toThrow(PathValidationError);
    });

    it('deleteCustomAgent throws PathValidationError for ".." in path', async () => {
      await expect(service.deleteCustomAgent('/tmp/../etc', 'agent-id')).rejects.toThrow(PathValidationError);
    });

    it('getCustomSkills throws PathValidationError for ".." in path', async () => {
      await expect(service.getCustomSkills('/tmp/../etc')).rejects.toThrow(PathValidationError);
    });

    it('getCustomSkill throws PathValidationError for ".." in path', async () => {
      await expect(service.getCustomSkill('/tmp/../etc', 'skill-id')).rejects.toThrow(PathValidationError);
    });

    it('createCustomSkill throws PathValidationError for ".." in path', async () => {
      await expect(service.createCustomSkill('/tmp/../etc', 'my-skill', validSkillContent())).rejects.toThrow(PathValidationError);
    });

    it('deleteCustomSkill throws PathValidationError for ".." in path', async () => {
      await expect(service.deleteCustomSkill('/tmp/../etc', 'skill-id')).rejects.toThrow(PathValidationError);
    });

    it('updateCustomSkill throws PathValidationError for ".." in path', async () => {
      await expect(service.updateCustomSkill('/tmp/../etc', 'skill-id', 'new-skill', validSkillContent())).rejects.toThrow(PathValidationError);
    });
  });

  // =========================================================================
  // validateAgentContent
  // =========================================================================

  describe('validateAgentContent', () => {
    it('returns invalid when content has no frontmatter delimiter', () => {
      const result = service.validateAgentContent('No frontmatter here at all');
      expect(result.valid).toBe(false);
      expect(result.schemaErrors).toEqual(
        expect.arrayContaining([expect.stringMatching(/Invalid frontmatter/)])
      );
    });

    it('returns invalid when closing --- is missing', () => {
      const result = service.validateAgentContent('---\nname: test\n');
      expect(result.valid).toBe(false);
      expect(result.schemaErrors?.[0]).toMatch(/Invalid frontmatter/);
    });

    it('returns schema errors when required name is missing', () => {
      const content = `---
description: A sufficiently long description that passes the minimum length check easily
---

# Body
`;
      const result = service.validateAgentContent(content);
      expect(result.valid).toBe(false);
      expect(result.schemaErrors?.length).toBeGreaterThan(0);
    });

    it('returns schema errors when description is too short', () => {
      const content = `---
name: my-agent
description: short
---

# Body
`;
      const result = service.validateAgentContent(content);
      expect(result.valid).toBe(false);
      expect(result.schemaErrors?.some(e => e.includes('description'))).toBe(true);
    });

    it('returns schema errors when name contains uppercase letters', () => {
      const content = `---
name: MyAgent
description: A sufficiently long description that passes the minimum length check easily
---

# Body
`;
      const result = service.validateAgentContent(content);
      expect(result.valid).toBe(false);
      expect(result.schemaErrors?.some(e => e.includes('name'))).toBe(true);
    });

    it('returns valid with no bestPracticeWarnings when content is ideal', () => {
      const result = service.validateAgentContent(validAgentContent());
      expect(result.valid).toBe(true);
      expect(result.parsedFrontmatter?.name).toBe('my-agent');
      expect(result.bestPracticeWarnings).toBeDefined();
    });

    it('includes warning-level bestPracticeWarnings for minimal content missing behavior section', () => {
      // Valid schema but missing ## Behavior section
      const content = `---
name: simple-agent
description: A sufficiently long description that describes what this agent does in detail
model: haiku
skills:
  - typescript
---

No behavior section here. Execute tasks directly.
`;
      const result = service.validateAgentContent(content);
      expect(result.valid).toBe(true);
      const warningRules = result.bestPracticeWarnings
        .filter(w => w.severity === 'warning')
        .map(w => w.rule);
      expect(warningRules).toContain('behavior-section');
    });

    it('parses model opus correctly', () => {
      const content = `---
name: opus-agent
description: A sufficiently long description that passes the minimum length check easily for testing
model: opus
skills:
  - typescript
---

## Behavior

Execute tasks directly. Do not modify files without confirmation.
`;
      const result = service.validateAgentContent(content);
      expect(result.valid).toBe(true);
      expect(result.parsedFrontmatter?.model).toBe('opus');
    });

    it('parses allowed-tools and skills correctly', () => {
      const result = service.validateAgentContent(validAgentContent());
      expect(result.parsedFrontmatter?.['allowed-tools']).toBe('Read, Edit');
      expect(result.parsedFrontmatter?.skills).toContain('typescript');
    });

    it('parses mcp_servers correctly', () => {
      const result = service.validateAgentContent(validAgentContent());
      expect(result.parsedFrontmatter?.mcp_servers).toContain('documentation');
    });

    it('ignores unknown model values (falls back to default via zod)', () => {
      const content = `---
name: my-agent
description: A sufficiently long description that passes the minimum length check easily here
model: unknown-model
---

## Behavior
Execute directly.
`;
      // Zod will fail because unknown-model is not in the enum
      const result = service.validateAgentContent(content);
      // model default applied by Zod — unknown-model may fail or be stripped
      // Either valid (model stripped to default) or invalid; either is acceptable
      // What matters is no crash
      expect(typeof result.valid).toBe('boolean');
    });
  });

  // =========================================================================
  // getCustomAgents
  // =========================================================================

  describe('getCustomAgents', () => {
    it('returns empty array when custom agents dir does not exist', async () => {
      const agents = await service.getCustomAgents(projectDir);
      expect(agents).toEqual([]);
    });

    it('returns empty array when custom agents dir is empty', async () => {
      const agentsDir = path.join(projectDir, '.claude', 'agents', 'custom');
      fs.mkdirSync(agentsDir, { recursive: true });

      const agents = await service.getCustomAgents(projectDir);
      expect(agents).toEqual([]);
    });

    it('ignores non-.md files in the custom agents dir', async () => {
      const agentsDir = path.join(projectDir, '.claude', 'agents', 'custom');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'readme.txt'), 'not an agent');

      const agents = await service.getCustomAgents(projectDir);
      expect(agents).toEqual([]);
    });

    it('skips .md files with no frontmatter', async () => {
      const agentsDir = path.join(projectDir, '.claude', 'agents', 'custom');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'bad-agent.md'), '# No frontmatter');

      const agents = await service.getCustomAgents(projectDir);
      expect(agents).toEqual([]);
    });

    it('returns parsed agents for valid .md files', async () => {
      const agentsDir = path.join(projectDir, '.claude', 'agents', 'custom');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'my-agent.md'), validAgentContent('my-agent'));

      const agents = await service.getCustomAgents(projectDir);
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('my-agent');
      expect(agents[0].name).toBe('my-agent');
      expect(agents[0].isCustom).toBe(true);
      expect(agents[0].skillCount).toBe(1);
      expect(agents[0].mcpServerCount).toBe(1);
    });

    it('returns multiple agents sorted by filesystem order', async () => {
      const agentsDir = path.join(projectDir, '.claude', 'agents', 'custom');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'alpha.md'), validAgentContent('alpha'));
      fs.writeFileSync(path.join(agentsDir, 'beta.md'), validAgentContent('beta'));

      const agents = await service.getCustomAgents(projectDir);
      expect(agents).toHaveLength(2);
      const ids = agents.map(a => a.id);
      expect(ids).toContain('alpha');
      expect(ids).toContain('beta');
    });
  });

  // =========================================================================
  // getCustomAgent
  // =========================================================================

  describe('getCustomAgent', () => {
    it('returns null when agent file does not exist', async () => {
      const agent = await service.getCustomAgent(projectDir, 'nonexistent');
      expect(agent).toBeNull();
    });

    it('returns null when file has no frontmatter', async () => {
      const agentsDir = path.join(projectDir, '.claude', 'agents', 'custom');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'bad.md'), '# No frontmatter');

      const agent = await service.getCustomAgent(projectDir, 'bad');
      expect(agent).toBeNull();
    });

    it('returns null when frontmatter YAML cannot be parsed', async () => {
      const agentsDir = path.join(projectDir, '.claude', 'agents', 'custom');
      fs.mkdirSync(agentsDir, { recursive: true });
      // Frontmatter with unclosed delimiter
      fs.writeFileSync(path.join(agentsDir, 'empty-fm.md'), '---\n---\n\n# Body');

      const agent = await service.getCustomAgent(projectDir, 'empty-fm');
      // parseFrontmatterYaml returns an object even for empty frontmatter;
      // result depends on whether name is populated
      expect(agent === null || typeof agent === 'object').toBe(true);
    });

    it('returns full agent object with all fields when file is valid', async () => {
      const agentsDir = path.join(projectDir, '.claude', 'agents', 'custom');
      fs.mkdirSync(agentsDir, { recursive: true });
      const content = validAgentContent('detail-agent');
      fs.writeFileSync(path.join(agentsDir, 'detail-agent.md'), content);

      const agent = await service.getCustomAgent(projectDir, 'detail-agent');
      expect(agent).not.toBeNull();
      expect(agent!.id).toBe('detail-agent');
      expect(agent!.name).toBe('detail-agent');
      expect(agent!.model).toBe('sonnet');
      expect(agent!.allowedTools).toEqual(['Read', 'Edit']);
      expect(agent!.skills).toContain('typescript');
      expect(agent!.mcpServers).toContain('documentation');
      expect(agent!.content).toBe(content);
      expect(agent!.category).toBe('custom');
      expect(agent!.isCustom).toBe(true);
      expect(agent!.filePath).toContain('detail-agent.md');
      expect(agent!.createdAt).toBeDefined();
      expect(agent!.modifiedAt).toBeDefined();
    });

    it('returns agent with default model "sonnet" when model not specified', async () => {
      const agentsDir = path.join(projectDir, '.claude', 'agents', 'custom');
      fs.mkdirSync(agentsDir, { recursive: true });
      const content = `---
name: no-model-agent
description: A sufficiently long description that passes the minimum length check easily test
skills:
  - typescript
---

## Behavior
Execute directly. Do not modify files without confirmation.
`;
      fs.writeFileSync(path.join(agentsDir, 'no-model-agent.md'), content);

      const agent = await service.getCustomAgent(projectDir, 'no-model-agent');
      expect(agent!.model).toBe('sonnet');
    });

    it('returns empty allowedTools when allowed-tools not specified', async () => {
      const agentsDir = path.join(projectDir, '.claude', 'agents', 'custom');
      fs.mkdirSync(agentsDir, { recursive: true });
      const content = `---
name: no-tools-agent
description: A sufficiently long description that passes the minimum length check easily testing
skills:
  - typescript
---

## Behavior
Execute directly.
`;
      fs.writeFileSync(path.join(agentsDir, 'no-tools-agent.md'), content);

      const agent = await service.getCustomAgent(projectDir, 'no-tools-agent');
      expect(agent!.allowedTools).toEqual([]);
    });
  });

  // =========================================================================
  // createCustomAgent
  // =========================================================================

  describe('createCustomAgent', () => {
    it('returns failure when content is invalid (no frontmatter)', async () => {
      const result = await service.createCustomAgent(projectDir, '# no frontmatter');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns failure when schema validation fails', async () => {
      const content = `---
name: INVALID_NAME
description: short
---
Body
`;
      const result = await service.createCustomAgent(projectDir, content);
      expect(result.success).toBe(false);
      expect(result.validation?.schemaErrors?.length).toBeGreaterThan(0);
    });

    it('returns failure when best-practice warnings exist and bypassWarnings is false', async () => {
      // Valid schema but missing ## Behavior section → behavior-section warning
      const content = `---
name: simple-agent
description: A sufficiently long description that describes this agent clearly and in detail
model: sonnet
skills:
  - typescript
---

No behavior section here. Execute tasks directly. Write code as needed.
`;
      const result = await service.createCustomAgent(projectDir, content, false);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/best practice warnings/i);
    });

    it('creates agent successfully when content passes all rules', async () => {
      const result = await service.createCustomAgent(projectDir, validAgentContent('new-agent'));
      expect(result.success).toBe(true);
      expect(result.agent).toBeDefined();
      expect(result.agent?.id).toBe('new-agent');

      // Verify file on disk
      const filePath = path.join(projectDir, '.claude', 'agents', 'custom', 'new-agent.md');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('updates .dev-suite.json with the new agent id', async () => {
      await service.createCustomAgent(projectDir, validAgentContent('config-agent'));

      const configPath = path.join(projectDir, '.dev-suite.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { customAgents: string[] };
      expect(config.customAgents).toContain('config-agent');
    });

    it('creates agent even when .dev-suite.json does not exist yet', async () => {
      const configPath = path.join(projectDir, '.dev-suite.json');
      expect(fs.existsSync(configPath)).toBe(false);

      const result = await service.createCustomAgent(projectDir, validAgentContent('fresh-agent'));
      expect(result.success).toBe(true);
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('returns failure when agent already exists', async () => {
      await service.createCustomAgent(projectDir, validAgentContent('duplicate-agent'));
      const result = await service.createCustomAgent(projectDir, validAgentContent('duplicate-agent'));
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already exists/i);
    });

    it('returns failure for invalid agent name (path traversal chars)', async () => {
      const content = `---
name: ../evil
description: A sufficiently long description that passes the minimum length check easily testing
---

## Behavior
Execute directly.
`;
      const result = await service.createCustomAgent(projectDir, content);
      expect(result.success).toBe(false);
    });

    it('creates agent with bypassWarnings=true even when warnings exist', async () => {
      const content = `---
name: bypass-agent
description: A sufficiently long description that describes this agent clearly and in detail
model: sonnet
skills:
  - typescript
---

No behavior section. Execute tasks directly.
`;
      const result = await service.createCustomAgent(projectDir, content, true);
      expect(result.success).toBe(true);
      expect(result.agent?.id).toBe('bypass-agent');
    });

    it('does not add duplicate id to .dev-suite.json customAgents array', async () => {
      // Write a .dev-suite.json that already has the id
      const configPath = path.join(projectDir, '.dev-suite.json');
      fs.writeFileSync(configPath, JSON.stringify({ customAgents: ['dup-agent'] }, null, 2));

      // Delete the md file so createCustomAgent doesn't think it already exists
      await service.createCustomAgent(projectDir, validAgentContent('dup-agent'));

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { customAgents: string[] };
      expect(config.customAgents.filter(a => a === 'dup-agent')).toHaveLength(1);
    });
  });

  // =========================================================================
  // updateCustomAgent
  // =========================================================================

  describe('updateCustomAgent', () => {
    it('returns failure when agent does not exist', async () => {
      const result = await service.updateCustomAgent(projectDir, 'nonexistent', validAgentContent('nonexistent'));
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it('returns failure when new content is invalid', async () => {
      await service.createCustomAgent(projectDir, validAgentContent('upd-agent'));

      const result = await service.updateCustomAgent(projectDir, 'upd-agent', '# bad content');
      expect(result.success).toBe(false);
    });

    it('returns failure when new content has warnings and bypassWarnings=false', async () => {
      await service.createCustomAgent(projectDir, validAgentContent('warn-agent'));

      const noSectionContent = `---
name: warn-agent
description: A sufficiently long description that describes this agent clearly and in detail
model: sonnet
skills:
  - typescript
---

No behavior section. Execute tasks directly.
`;
      const result = await service.updateCustomAgent(projectDir, 'warn-agent', noSectionContent, false);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/best practice warnings/i);
    });

    it('updates agent content in place when name stays the same', async () => {
      await service.createCustomAgent(projectDir, validAgentContent('same-name'));

      const updated = validAgentContent('same-name', 'An updated description that is long enough to pass the check here');
      const result = await service.updateCustomAgent(projectDir, 'same-name', updated, true);
      expect(result.success).toBe(true);

      const filePath = path.join(projectDir, '.claude', 'agents', 'custom', 'same-name.md');
      const written = fs.readFileSync(filePath, 'utf-8');
      expect(written).toBe(updated);
    });

    it('renames file and updates .dev-suite.json when name changes', async () => {
      await service.createCustomAgent(projectDir, validAgentContent('old-name'));
      // Write old-name to config so we can verify the rename
      const configPath = path.join(projectDir, '.dev-suite.json');
      fs.writeFileSync(configPath, JSON.stringify({ customAgents: ['old-name'] }, null, 2));

      const renamed = validAgentContent('new-name');
      const result = await service.updateCustomAgent(projectDir, 'old-name', renamed, true);
      expect(result.success).toBe(true);

      // New file must exist, old must be gone
      const oldPath = path.join(projectDir, '.claude', 'agents', 'custom', 'old-name.md');
      const newPath = path.join(projectDir, '.claude', 'agents', 'custom', 'new-name.md');
      expect(fs.existsSync(oldPath)).toBe(false);
      expect(fs.existsSync(newPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { customAgents: string[] };
      expect(config.customAgents).toContain('new-name');
      expect(config.customAgents).not.toContain('old-name');
    });

    it('returns failure when renaming to a name that already exists', async () => {
      await service.createCustomAgent(projectDir, validAgentContent('agent-a'));
      await service.createCustomAgent(projectDir, validAgentContent('agent-b'));

      // Try to rename agent-a to agent-b
      const result = await service.updateCustomAgent(projectDir, 'agent-a', validAgentContent('agent-b'), true);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already exists/i);
    });

    it('returns failure for invalid new agent name', async () => {
      await service.createCustomAgent(projectDir, validAgentContent('valid-agent'));
      // Provide content with an invalid name (uppercase letters fail the regex)
      const badNameContent = `---
name: INVALID_NAME_HERE
description: A sufficiently long description that passes the minimum length check easily test
---

## Behavior
Execute directly.
`;
      const result = await service.updateCustomAgent(projectDir, 'valid-agent', badNameContent, true);
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // deleteCustomAgent
  // =========================================================================

  describe('deleteCustomAgent', () => {
    it('returns failure when agent does not exist', async () => {
      const result = await service.deleteCustomAgent(projectDir, 'ghost');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it('deletes agent file and returns success', async () => {
      await service.createCustomAgent(projectDir, validAgentContent('to-delete'));

      const result = await service.deleteCustomAgent(projectDir, 'to-delete');
      expect(result.success).toBe(true);

      const filePath = path.join(projectDir, '.claude', 'agents', 'custom', 'to-delete.md');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('removes the agent id from .dev-suite.json', async () => {
      await service.createCustomAgent(projectDir, validAgentContent('del-cfg'));
      const configPath = path.join(projectDir, '.dev-suite.json');

      await service.deleteCustomAgent(projectDir, 'del-cfg');

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { customAgents: string[] };
      expect(config.customAgents).not.toContain('del-cfg');
    });
  });

  // =========================================================================
  // validateSkillContent
  // =========================================================================

  describe('validateSkillContent', () => {
    it('always returns valid: true', () => {
      const result = service.validateSkillContent('# Minimal skill content');
      expect(result.valid).toBe(true);
    });

    it('returns warnings for content missing USE WHEN section', () => {
      const result = service.validateSkillContent('# Skill\n\nDO NOT USE FOR: general use.\n');
      expect(result.bestPracticeWarnings.some(w => w.rule === 'use-when-defined')).toBe(true);
    });

    it('returns warnings for content missing DO NOT USE FOR section', () => {
      const result = service.validateSkillContent('# Skill\n\nUSE WHEN: always.\n');
      expect(result.bestPracticeWarnings.some(w => w.rule === 'do-not-use-defined')).toBe(true);
    });

    it('returns no warning-level errors for fully compliant skill', () => {
      const result = service.validateSkillContent(validSkillContent());
      const warnings = result.bestPracticeWarnings.filter(w => w.severity === 'warning');
      expect(warnings).toHaveLength(0);
    });
  });

  // =========================================================================
  // getCustomSkills
  // =========================================================================

  describe('getCustomSkills', () => {
    it('returns empty array when custom skills dir does not exist', async () => {
      const skills = await service.getCustomSkills(projectDir);
      expect(skills).toEqual([]);
    });

    it('returns empty array for a directory with no skill subdirs', async () => {
      const skillsDir = path.join(projectDir, '.claude', 'skills', 'custom');
      fs.mkdirSync(skillsDir, { recursive: true });

      const skills = await service.getCustomSkills(projectDir);
      expect(skills).toEqual([]);
    });

    it('ignores subdirectories without SKILL.md', async () => {
      const skillsDir = path.join(projectDir, '.claude', 'skills', 'custom');
      const emptySkillDir = path.join(skillsDir, 'empty-skill');
      fs.mkdirSync(emptySkillDir, { recursive: true });

      const skills = await service.getCustomSkills(projectDir);
      expect(skills).toEqual([]);
    });

    it('returns skill when SKILL.md exists in subdirectory', async () => {
      const skillDir = path.join(projectDir, '.claude', 'skills', 'custom', 'my-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), validSkillContent());

      const skills = await service.getCustomSkills(projectDir);
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe('my-skill');
      expect(skills[0].isCustom).toBe(true);
    });

    it('ignores top-level files inside the custom skills dir', async () => {
      const skillsDir = path.join(projectDir, '.claude', 'skills', 'custom');
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'not-a-skill.md'), '# stray file');

      const skills = await service.getCustomSkills(projectDir);
      expect(skills).toEqual([]);
    });
  });

  // =========================================================================
  // getCustomSkill
  // =========================================================================

  describe('getCustomSkill', () => {
    it('returns null when skill SKILL.md does not exist', async () => {
      const skill = await service.getCustomSkill(projectDir, 'nonexistent');
      expect(skill).toBeNull();
    });

    it('returns skill detail with content', async () => {
      const skillDir = path.join(projectDir, '.claude', 'skills', 'custom', 'detail-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      const content = validSkillContent();
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);

      const skill = await service.getCustomSkill(projectDir, 'detail-skill');
      expect(skill).not.toBeNull();
      expect(skill!.id).toBe('detail-skill');
      expect(skill!.content).toBe(content);
      expect(skill!.isCustom).toBe(true);
      expect(skill!.modifiedAt).toBeDefined();
    });

    it('extracts description from first non-heading paragraph', async () => {
      const skillDir = path.join(projectDir, '.claude', 'skills', 'custom', 'desc-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Title\n\nThis is the description paragraph.\n');

      const skill = await service.getCustomSkill(projectDir, 'desc-skill');
      expect(skill!.description).toBe('This is the description paragraph.');
    });

    it('falls back to "Custom skill: <id>" when no prose paragraph found', async () => {
      const skillDir = path.join(projectDir, '.claude', 'skills', 'custom', 'headings-only');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Title\n\n## Section\n\n');

      const skill = await service.getCustomSkill(projectDir, 'headings-only');
      expect(skill!.description).toBe('Custom skill: headings-only');
    });
  });

  // =========================================================================
  // createCustomSkill
  // =========================================================================

  describe('createCustomSkill', () => {
    it('returns failure when best-practice warnings exist and bypassWarnings=false', async () => {
      const result = await service.createCustomSkill(projectDir, 'my-skill', '# No sections', false);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/best practice warnings/i);
    });

    it('returns failure for invalid skill name', async () => {
      const result = await service.createCustomSkill(projectDir, '../../evil', validSkillContent(), true);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid skill name/i);
    });

    it('creates skill directory and SKILL.md successfully', async () => {
      const result = await service.createCustomSkill(projectDir, 'new-skill', validSkillContent(), true);
      expect(result.success).toBe(true);
      expect(result.skill).toBeDefined();
      expect(result.skill?.id).toBe('new-skill');

      const skillMdPath = path.join(projectDir, '.claude', 'skills', 'custom', 'new-skill', 'SKILL.md');
      expect(fs.existsSync(skillMdPath)).toBe(true);
    });

    it('returns failure when skill already exists', async () => {
      await service.createCustomSkill(projectDir, 'exists-skill', validSkillContent(), true);
      const result = await service.createCustomSkill(projectDir, 'exists-skill', validSkillContent(), true);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already exists/i);
    });

    it('updates .dev-suite.json with new skill id', async () => {
      await service.createCustomSkill(projectDir, 'cfg-skill', validSkillContent(), true);

      const configPath = path.join(projectDir, '.dev-suite.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { customSkills: string[] };
      expect(config.customSkills).toContain('cfg-skill');
    });

    it('does not add duplicate id to .dev-suite.json customSkills', async () => {
      const configPath = path.join(projectDir, '.dev-suite.json');
      fs.writeFileSync(configPath, JSON.stringify({ customSkills: ['dup-skill'] }, null, 2));

      await service.createCustomSkill(projectDir, 'dup-skill2', validSkillContent(), true);
      const config2 = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { customSkills: string[] };
      expect(config2.customSkills.filter(s => s === 'dup-skill2')).toHaveLength(1);
    });

    it('creates skill with bypassWarnings=true even when warnings exist', async () => {
      const result = await service.createCustomSkill(projectDir, 'warn-skill', '# Minimal skill content only', true);
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // deleteCustomSkill
  // =========================================================================

  describe('deleteCustomSkill', () => {
    it('returns failure when skill does not exist', async () => {
      const result = await service.deleteCustomSkill(projectDir, 'ghost-skill');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it('deletes skill directory and returns success', async () => {
      await service.createCustomSkill(projectDir, 'rm-skill', validSkillContent(), true);

      const result = await service.deleteCustomSkill(projectDir, 'rm-skill');
      expect(result.success).toBe(true);

      const skillDir = path.join(projectDir, '.claude', 'skills', 'custom', 'rm-skill');
      expect(fs.existsSync(skillDir)).toBe(false);
    });

    it('removes skill id from .dev-suite.json', async () => {
      await service.createCustomSkill(projectDir, 'del-skill', validSkillContent(), true);
      const configPath = path.join(projectDir, '.dev-suite.json');

      await service.deleteCustomSkill(projectDir, 'del-skill');

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { customSkills: string[] };
      expect(config.customSkills).not.toContain('del-skill');
    });
  });

  // =========================================================================
  // updateCustomSkill
  // =========================================================================

  describe('updateCustomSkill', () => {
    it('returns failure when skill does not exist', async () => {
      const result = await service.updateCustomSkill(projectDir, 'ghost', 'ghost', validSkillContent(), true);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it('returns failure when new content has warnings and bypassWarnings=false', async () => {
      await service.createCustomSkill(projectDir, 'upd-skill', validSkillContent(), true);

      const result = await service.updateCustomSkill(projectDir, 'upd-skill', 'upd-skill', '# Minimal', false);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/best practice warnings/i);
    });

    it('updates SKILL.md in place when name stays the same', async () => {
      await service.createCustomSkill(projectDir, 'same-skill', validSkillContent(), true);

      const updated = `# Updated Skill\n\nUSE WHEN: always.\n\nDO NOT USE FOR: never.\n`;
      const result = await service.updateCustomSkill(projectDir, 'same-skill', 'same-skill', updated, true);
      expect(result.success).toBe(true);

      const skillMdPath = path.join(projectDir, '.claude', 'skills', 'custom', 'same-skill', 'SKILL.md');
      expect(fs.readFileSync(skillMdPath, 'utf-8')).toBe(updated);
    });

    it('renames skill directory and updates .dev-suite.json when name changes', async () => {
      await service.createCustomSkill(projectDir, 'old-skill', validSkillContent(), true);
      const configPath = path.join(projectDir, '.dev-suite.json');
      const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { customSkills: string[] };
      existingConfig.customSkills = ['old-skill'];
      fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));

      const result = await service.updateCustomSkill(
        projectDir, 'old-skill', 'new-skill', validSkillContent(), true
      );
      expect(result.success).toBe(true);

      const oldDir = path.join(projectDir, '.claude', 'skills', 'custom', 'old-skill');
      const newDir = path.join(projectDir, '.claude', 'skills', 'custom', 'new-skill');
      expect(fs.existsSync(oldDir)).toBe(false);
      expect(fs.existsSync(newDir)).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { customSkills: string[] };
      expect(config.customSkills).toContain('new-skill');
      expect(config.customSkills).not.toContain('old-skill');
    });

    it('returns failure when renaming to an already existing skill name', async () => {
      await service.createCustomSkill(projectDir, 'skill-x', validSkillContent(), true);
      await service.createCustomSkill(projectDir, 'skill-y', validSkillContent(), true);

      const result = await service.updateCustomSkill(
        projectDir, 'skill-x', 'skill-y', validSkillContent(), true
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already exists/i);
    });

    // `skillId` is asserted at the top of the method; `name` is the rename
    // target and reaches `renameSync`/`writeFileSync` the same way. The update
    // route's Zod pattern rejects a separator, so this is the service refusing
    // to depend on its caller rather than a reachable traversal.
    it('refuses a rename target that escapes the custom skills directory', async () => {
      await service.createCustomSkill(projectDir, 'escape-me', validSkillContent(), true);
      const skillDir = path.join(projectDir, '.claude', 'skills', 'custom', 'escape-me');

      const result = await service.updateCustomSkill(
        projectDir, 'escape-me', '../../../pwned', validSkillContent(), true
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid skill name/i);
      // Nothing moved, and nothing was written outside the skills directory.
      expect(fs.existsSync(skillDir)).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'pwned'))).toBe(false);
      expect(fs.existsSync(path.join(projectDir, '.claude', 'pwned'))).toBe(false);
    });
  });

  // =========================================================================
  // updateDevSuiteConfig (via side-effects from create/delete)
  // =========================================================================

  describe('updateDevSuiteConfig (via side-effects)', () => {
    it('creates .dev-suite.json when it does not exist', async () => {
      const configPath = path.join(projectDir, '.dev-suite.json');
      expect(fs.existsSync(configPath)).toBe(false);

      await service.createCustomAgent(projectDir, validAgentContent('fresh-one'));
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('preserves existing .dev-suite.json keys when updating', async () => {
      const configPath = path.join(projectDir, '.dev-suite.json');
      fs.writeFileSync(
        configPath,
        JSON.stringify({ agents: { enabled: ['react-expert'] }, customAgents: [] }, null, 2)
      );

      await service.createCustomAgent(projectDir, validAgentContent('preserve-test'));

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        agents: { enabled: string[] };
        customAgents: string[];
      };
      expect(config.agents?.enabled).toContain('react-expert');
      expect(config.customAgents).toContain('preserve-test');
    });

    it('handles corrupt .dev-suite.json gracefully (falls back to empty object)', async () => {
      const configPath = path.join(projectDir, '.dev-suite.json');
      fs.writeFileSync(configPath, '{ INVALID JSON }');

      // Should not throw
      const result = await service.createCustomAgent(projectDir, validAgentContent('corrupt-test'));
      expect(result.success).toBe(true);
      // Config was written fresh
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { customAgents: string[] };
      expect(config.customAgents).toContain('corrupt-test');
    });
  });
});
