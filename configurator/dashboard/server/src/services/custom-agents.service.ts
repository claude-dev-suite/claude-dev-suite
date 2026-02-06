// SPDX-License-Identifier: MIT
/**
 * Custom Agents Service
 *
 * Manages CRUD operations for project-specific custom agents stored in
 * .claude/agents/custom/ directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../utils/logger.js';
import { parseYamlDescription } from '../utils/yaml-utils.js';
import { BestPracticesValidatorService } from './best-practices-validator.service.js';
import type {
  CustomAgent,
  CustomAgentListItem,
  CustomAgentFrontmatter,
  CustomAgentValidationResult,
  CustomAgentModel,
  CustomSkill,
} from '../types/custom-agents.js';
import { CustomAgentFrontmatterSchema } from '../validation/schemas.js';

/**
 * Interface for dev-suite config with custom agents/skills
 */
interface DevSuiteConfig {
  agents?: { enabled?: string[] };
  mcpServers?: { enabled?: string[] };
  customAgents?: string[];
  customSkills?: string[];
  [key: string]: unknown;
}

const logger = getLogger('CustomAgentsService');

/**
 * Directory name for custom agents within .claude/agents/
 */
const CUSTOM_AGENTS_DIR = 'custom';

/**
 * Directory name for custom skills within .claude/skills/
 */
const CUSTOM_SKILLS_DIR = 'custom';

export class CustomAgentsService {
  private bestPracticesValidator = new BestPracticesValidatorService();

  /**
   * Get the custom agents directory path for a project
   */
  private getCustomAgentsDir(projectPath: string): string {
    return path.join(projectPath, '.claude', 'agents', CUSTOM_AGENTS_DIR);
  }

  /**
   * Get the custom skills directory path for a project
   */
  private getCustomSkillsDir(projectPath: string): string {
    return path.join(projectPath, '.claude', 'skills', CUSTOM_SKILLS_DIR);
  }

  /**
   * Ensure the custom agents directory exists
   */
  private ensureCustomAgentsDir(projectPath: string): void {
    const dir = this.getCustomAgentsDir(projectPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Ensure the custom skills directory exists
   */
  private ensureCustomSkillsDir(projectPath: string): void {
    const dir = this.getCustomSkillsDir(projectPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Parse YAML frontmatter from markdown content
   */
  private parseFrontmatter(content: string): { frontmatter: string; body: string } | null {
    if (!content.startsWith('---')) {
      return null;
    }

    const endIdx = content.indexOf('---', 3);
    if (endIdx < 0) {
      return null;
    }

    return {
      frontmatter: content.substring(3, endIdx).trim(),
      body: content.substring(endIdx + 3).trim(),
    };
  }

  /**
   * Parse frontmatter YAML into structured object
   */
  private parseFrontmatterYaml(frontmatter: string): CustomAgentFrontmatter | null {
    try {
      const result: Partial<CustomAgentFrontmatter> = {};

      // Parse name
      const nameMatch = frontmatter.match(/^name:\s*["']?([^"'\n]+)["']?/m);
      if (nameMatch?.[1]) {
        result.name = nameMatch[1].trim();
      }

      // Parse description (can be multi-line with |)
      result.description = parseYamlDescription(frontmatter);

      // Parse model
      const modelMatch = frontmatter.match(/^model:\s*["']?([^"'\n]+)["']?/m);
      if (modelMatch?.[1]) {
        const model = modelMatch[1].trim().toLowerCase();
        if (['sonnet', 'opus', 'haiku'].includes(model)) {
          result.model = model as CustomAgentModel;
        }
      }

      // Parse allowed-tools
      const toolsMatch = frontmatter.match(/^allowed-tools:\s*(.+)$/m);
      if (toolsMatch?.[1]) {
        result['allowed-tools'] = toolsMatch[1].trim();
      }

      // Parse skills array
      const skills: string[] = [];
      const skillsMatch = frontmatter.match(/^skills:\s*\n((?:\s+-\s+.+\n?)+)/m);
      if (skillsMatch?.[1]) {
        const skillLines = skillsMatch[1].match(/^\s+-\s+(.+)$/gm);
        if (skillLines) {
          for (const line of skillLines) {
            const match = line.match(/^\s+-\s+(.+)$/);
            if (match?.[1]) skills.push(match[1].trim());
          }
        }
      }
      result.skills = skills;

      // Parse mcp_servers array
      const mcpServers: string[] = [];
      const mcpMatch = frontmatter.match(/^mcp_servers:\s*\n((?:\s+-\s+.+\n?)+)/m);
      if (mcpMatch?.[1]) {
        const serverLines = mcpMatch[1].match(/^\s+-\s+(.+)$/gm);
        if (serverLines) {
          for (const line of serverLines) {
            const match = line.match(/^\s+-\s+(.+)$/);
            if (match?.[1]) mcpServers.push(match[1].trim());
          }
        }
      }
      result.mcp_servers = mcpServers;

      return result as CustomAgentFrontmatter;
    } catch (error) {
      logger.warn('Failed to parse frontmatter YAML', { error });
      return null;
    }
  }

  /**
   * Validate custom agent content
   */
  validateAgentContent(content: string): CustomAgentValidationResult {
    const result: CustomAgentValidationResult = {
      valid: false,
      schemaErrors: [],
      bestPracticeWarnings: [],
    };

    // Step 1: Check frontmatter structure
    const parsed = this.parseFrontmatter(content);
    if (!parsed) {
      result.schemaErrors = ['Invalid frontmatter: Content must start with --- and contain valid YAML frontmatter'];
      return result;
    }

    // Step 2: Parse frontmatter YAML
    const frontmatter = this.parseFrontmatterYaml(parsed.frontmatter);
    if (!frontmatter) {
      result.schemaErrors = ['Failed to parse YAML frontmatter'];
      return result;
    }

    // Step 3: Validate with Zod schema
    const schemaResult = CustomAgentFrontmatterSchema.safeParse(frontmatter);
    if (!schemaResult.success) {
      result.schemaErrors = schemaResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      return result;
    }

    // Schema is valid
    result.valid = true;
    result.parsedFrontmatter = schemaResult.data;

    // Step 4: Check best practices (non-blocking)
    result.bestPracticeWarnings = this.bestPracticesValidator.validateAgent(
      content,
      schemaResult.data
    );

    return result;
  }

  /**
   * List all custom agents for a project
   */
  async getCustomAgents(projectPath: string): Promise<CustomAgentListItem[]> {
    const customAgentsDir = this.getCustomAgentsDir(projectPath);
    const agents: CustomAgentListItem[] = [];

    if (!fs.existsSync(customAgentsDir)) {
      return agents;
    }

    try {
      const entries = fs.readdirSync(customAgentsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const filePath = path.join(customAgentsDir, entry.name);
          const agent = await this.parseCustomAgentListItem(filePath, entry.name);
          if (agent) {
            agents.push(agent);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to list custom agents', { error, projectPath });
    }

    return agents;
  }

  /**
   * Get a single custom agent with full content
   */
  async getCustomAgent(projectPath: string, agentId: string): Promise<CustomAgent | null> {
    const filePath = path.join(this.getCustomAgentsDir(projectPath), `${agentId}.md`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const stats = fs.statSync(filePath);
      const parsed = this.parseFrontmatter(content);

      if (!parsed) {
        return null;
      }

      const frontmatter = this.parseFrontmatterYaml(parsed.frontmatter);
      if (!frontmatter) {
        return null;
      }

      const allowedTools = frontmatter['allowed-tools']
        ? frontmatter['allowed-tools'].split(',').map((t) => t.trim())
        : [];

      return {
        id: agentId,
        name: frontmatter.name,
        description: frontmatter.description || '',
        model: frontmatter.model || 'sonnet',
        allowedTools,
        skills: frontmatter.skills || [],
        mcpServers: frontmatter.mcp_servers || [],
        content,
        category: 'custom',
        isCustom: true,
        filePath: `.claude/agents/${CUSTOM_AGENTS_DIR}/${agentId}.md`,
        createdAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get custom agent', { error, projectPath, agentId });
      return null;
    }
  }

  /**
   * Create a new custom agent
   */
  async createCustomAgent(
    projectPath: string,
    content: string,
    bypassWarnings = false
  ): Promise<{ success: boolean; agent?: CustomAgentListItem; validation?: CustomAgentValidationResult; error?: string }> {
    // Validate content
    const validation = this.validateAgentContent(content);

    if (!validation.valid) {
      return {
        success: false,
        validation,
        error: validation.schemaErrors?.join('; '),
      };
    }

    // Check best practice warnings
    if (!bypassWarnings && validation.bestPracticeWarnings.some((w) => w.severity === 'warning')) {
      return {
        success: false,
        validation,
        error: 'Content has best practice warnings. Set bypassWarnings=true to ignore.',
      };
    }

    const frontmatter = validation.parsedFrontmatter!;
    const agentId = frontmatter.name;

    // Check if agent already exists
    const existingAgent = await this.getCustomAgent(projectPath, agentId);
    if (existingAgent) {
      return {
        success: false,
        error: `Agent '${agentId}' already exists. Use update to modify.`,
      };
    }

    // Ensure directory exists
    this.ensureCustomAgentsDir(projectPath);

    // Write file
    const filePath = path.join(this.getCustomAgentsDir(projectPath), `${agentId}.md`);

    try {
      fs.writeFileSync(filePath, content, 'utf-8');

      // Update .dev-suite.json
      this.updateDevSuiteConfig(projectPath, (config) => {
        if (!config.customAgents) {
          config.customAgents = [];
        }
        if (!config.customAgents.includes(agentId)) {
          config.customAgents.push(agentId);
        }
      });

      const agent = await this.parseCustomAgentListItem(filePath, `${agentId}.md`);

      return {
        success: true,
        agent: agent || undefined,
        validation,
      };
    } catch (error) {
      logger.error('Failed to create custom agent', { error, projectPath, agentId });
      return {
        success: false,
        error: 'Failed to write agent file',
      };
    }
  }

  /**
   * Update an existing custom agent
   */
  async updateCustomAgent(
    projectPath: string,
    agentId: string,
    content: string,
    bypassWarnings = false
  ): Promise<{ success: boolean; agent?: CustomAgentListItem; validation?: CustomAgentValidationResult; error?: string }> {
    // Check if agent exists
    const existingAgent = await this.getCustomAgent(projectPath, agentId);
    if (!existingAgent) {
      return {
        success: false,
        error: `Agent '${agentId}' not found`,
      };
    }

    // Validate content
    const validation = this.validateAgentContent(content);

    if (!validation.valid) {
      return {
        success: false,
        validation,
        error: validation.schemaErrors?.join('; '),
      };
    }

    // Check best practice warnings
    if (!bypassWarnings && validation.bestPracticeWarnings.some((w) => w.severity === 'warning')) {
      return {
        success: false,
        validation,
        error: 'Content has best practice warnings. Set bypassWarnings=true to ignore.',
      };
    }

    const frontmatter = validation.parsedFrontmatter!;
    const newAgentId = frontmatter.name;

    // Handle rename if name changed
    const oldFilePath = path.join(this.getCustomAgentsDir(projectPath), `${agentId}.md`);
    const newFilePath = path.join(this.getCustomAgentsDir(projectPath), `${newAgentId}.md`);

    try {
      // If renaming, check new name doesn't already exist
      if (agentId !== newAgentId && fs.existsSync(newFilePath)) {
        return {
          success: false,
          error: `Agent '${newAgentId}' already exists`,
        };
      }

      // Write to new path
      fs.writeFileSync(newFilePath, content, 'utf-8');

      // Remove old file if renamed
      if (agentId !== newAgentId && fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);

        // Update .dev-suite.json
        this.updateDevSuiteConfig(projectPath, (config) => {
          if (config.customAgents) {
            config.customAgents = config.customAgents.filter((a: string) => a !== agentId);
            if (!config.customAgents.includes(newAgentId)) {
              config.customAgents.push(newAgentId);
            }
          }
        });
      }

      const agent = await this.parseCustomAgentListItem(newFilePath, `${newAgentId}.md`);

      return {
        success: true,
        agent: agent || undefined,
        validation,
      };
    } catch (error) {
      logger.error('Failed to update custom agent', { error, projectPath, agentId });
      return {
        success: false,
        error: 'Failed to update agent file',
      };
    }
  }

  /**
   * Delete a custom agent
   */
  async deleteCustomAgent(projectPath: string, agentId: string): Promise<{ success: boolean; error?: string }> {
    const filePath = path.join(this.getCustomAgentsDir(projectPath), `${agentId}.md`);

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: `Agent '${agentId}' not found`,
      };
    }

    try {
      fs.unlinkSync(filePath);

      // Update .dev-suite.json
      this.updateDevSuiteConfig(projectPath, (config) => {
        if (config.customAgents) {
          config.customAgents = config.customAgents.filter((a: string) => a !== agentId);
        }
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete custom agent', { error, projectPath, agentId });
      return {
        success: false,
        error: 'Failed to delete agent file',
      };
    }
  }

  // ========== Custom Skills ==========

  /**
   * List all custom skills for a project
   */
  async getCustomSkills(projectPath: string): Promise<CustomSkill[]> {
    const customSkillsDir = this.getCustomSkillsDir(projectPath);
    const skills: CustomSkill[] = [];

    if (!fs.existsSync(customSkillsDir)) {
      return skills;
    }

    try {
      const entries = fs.readdirSync(customSkillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillMdPath = path.join(customSkillsDir, entry.name, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            const skill = await this.parseCustomSkill(skillMdPath, entry.name);
            if (skill) {
              skills.push(skill);
            }
          }
        }
      }
    } catch (error) {
      logger.error('Failed to list custom skills', { error, projectPath });
    }

    return skills;
  }

  /**
   * Create a custom skill
   */
  async createCustomSkill(
    projectPath: string,
    name: string,
    content: string
  ): Promise<{ success: boolean; skill?: CustomSkill; error?: string }> {
    this.ensureCustomSkillsDir(projectPath);

    const skillDir = path.join(this.getCustomSkillsDir(projectPath), name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    // Check if skill already exists
    if (fs.existsSync(skillDir)) {
      return {
        success: false,
        error: `Skill '${name}' already exists`,
      };
    }

    try {
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(skillMdPath, content, 'utf-8');

      // Update .dev-suite.json
      this.updateDevSuiteConfig(projectPath, (config) => {
        if (!config.customSkills) {
          config.customSkills = [];
        }
        if (!config.customSkills.includes(name)) {
          config.customSkills.push(name);
        }
      });

      const skill = await this.parseCustomSkill(skillMdPath, name);

      return {
        success: true,
        skill: skill || undefined,
      };
    } catch (error) {
      logger.error('Failed to create custom skill', { error, projectPath, name });
      return {
        success: false,
        error: 'Failed to create skill directory',
      };
    }
  }

  /**
   * Delete a custom skill
   */
  async deleteCustomSkill(projectPath: string, skillId: string): Promise<{ success: boolean; error?: string }> {
    const skillDir = path.join(this.getCustomSkillsDir(projectPath), skillId);

    if (!fs.existsSync(skillDir)) {
      return {
        success: false,
        error: `Skill '${skillId}' not found`,
      };
    }

    try {
      fs.rmSync(skillDir, { recursive: true, force: true });

      // Update .dev-suite.json
      this.updateDevSuiteConfig(projectPath, (config) => {
        if (config.customSkills) {
          config.customSkills = config.customSkills.filter((s: string) => s !== skillId);
        }
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete custom skill', { error, projectPath, skillId });
      return {
        success: false,
        error: 'Failed to delete skill directory',
      };
    }
  }

  // ========== Private Helpers ==========

  /**
   * Parse a custom agent file into a list item
   */
  private async parseCustomAgentListItem(
    filePath: string,
    fileName: string
  ): Promise<CustomAgentListItem | null> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const stats = fs.statSync(filePath);
      const parsed = this.parseFrontmatter(content);

      if (!parsed) {
        return null;
      }

      const frontmatter = this.parseFrontmatterYaml(parsed.frontmatter);
      if (!frontmatter) {
        return null;
      }

      return {
        id: fileName.replace('.md', ''),
        name: frontmatter.name,
        description: frontmatter.description || '',
        model: frontmatter.model || 'sonnet',
        skillCount: frontmatter.skills?.length || 0,
        mcpServerCount: frontmatter.mcp_servers?.length || 0,
        isCustom: true,
        modifiedAt: stats.mtime.toISOString(),
      };
    } catch (error) {
      logger.warn('Failed to parse custom agent file', { error, filePath });
      return null;
    }
  }

  /**
   * Parse a custom skill directory
   */
  private async parseCustomSkill(skillMdPath: string, name: string): Promise<CustomSkill | null> {
    try {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const stats = fs.statSync(skillMdPath);

      // Extract description from first paragraph
      const lines = content.split('\n');
      let description = '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('>')) {
          description = trimmed;
          break;
        }
      }

      return {
        id: name,
        name,
        description: description || `Custom skill: ${name}`,
        isCustom: true,
        filePath: `.claude/skills/${CUSTOM_SKILLS_DIR}/${name}/SKILL.md`,
        modifiedAt: stats.mtime.toISOString(),
      };
    } catch (error) {
      logger.warn('Failed to parse custom skill', { error, skillMdPath });
      return null;
    }
  }

  /**
   * Update .dev-suite.json configuration
   */
  private updateDevSuiteConfig(
    projectPath: string,
    updater: (config: DevSuiteConfig) => void
  ): void {
    const configPath = path.join(projectPath, '.dev-suite.json');
    let config: DevSuiteConfig = {};

    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as DevSuiteConfig;
      } catch (error) {
        logger.warn('Failed to parse .dev-suite.json', { error });
      }
    }

    updater(config);

    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      logger.error('Failed to write .dev-suite.json', { error });
    }
  }
}
