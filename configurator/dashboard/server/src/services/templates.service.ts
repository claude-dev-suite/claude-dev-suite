// SPDX-License-Identifier: MIT
/**
 * Templates Service
 *
 * Handles project scaffolding from templates.
 * - Lists available templates
 * - Validates template variables
 * - Scaffolds new projects from templates
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';

// ES Module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import type {
  TemplateInfo,
  TemplateListItem,
  TemplateVariable,
  TemplateCategory,
  TemplateSelectOption,
  ScaffoldConfig,
  ScaffoldResult,
  VariableValidationResult,
} from '../types/templates.js';
import { getLogger } from '../utils/logger.js';
import { timeOperation, TIMING_THRESHOLDS } from '../utils/performance.js';

// Custom timing threshold for template operations (not in TIMING_THRESHOLDS)
const TEMPLATE_SCAN_THRESHOLD = 2000;

const logger = getLogger('TemplatesService');

// Cache TTL for templates list (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T | null;
  timestamp: number;
}

/**
 * Determine template category from template data
 */
function determineCategory(template: Record<string, unknown>): TemplateCategory {
  const structure = template.structure as Record<string, unknown> | undefined;
  const tags = (template.tags as string[]) || [];

  // If has both frontend and backend structure, it's fullstack
  if (structure?.frontend && structure?.backend) {
    return 'fullstack';
  }

  // Check structure paths
  if (structure?.backend && !structure?.frontend) {
    return 'backend';
  }
  if (structure?.frontend && !structure?.backend) {
    return 'frontend';
  }

  // Fallback to tag-based detection
  if (tags.includes('fullstack')) return 'fullstack';
  if (tags.includes('frontend') || tags.includes('react') || tags.includes('vue') || tags.includes('nextjs')) {
    return 'frontend';
  }
  if (tags.includes('backend') || tags.includes('api') || tags.includes('spring-boot') || tags.includes('nestjs')) {
    return 'backend';
  }

  // Default to backend for API-focused templates
  return 'backend';
}

/**
 * Apply transformation to a derived value
 */
function applyTransform(value: string, transform?: string): string {
  if (!transform) return value;

  switch (transform) {
    case 'lowercase':
      return value.toLowerCase();
    case 'uppercase':
      return value.toUpperCase();
    case 'kebab-case':
      return value
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
    case 'snake_case':
      return value
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase();
    case 'camelCase':
      return value
        .replace(/[-_\s]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
        .replace(/^./, (c) => c.toLowerCase());
    case 'PascalCase':
      return value
        .replace(/[-_\s]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
        .replace(/^./, (c) => c.toUpperCase());
    default:
      return value;
  }
}

/**
 * Generate auto-generated values
 * @param strategy - The auto-generation strategy
 * @param variables - Current variable values (for compound strategies)
 */
function generateAutoValue(strategy: string, variables: Record<string, string> = {}): string {
  switch (strategy) {
    case 'jwt_secret':
      return crypto.randomBytes(32).toString('base64');
    case 'uuid':
      return crypto.randomUUID();
    case 'timestamp':
      return new Date().toISOString();
    case 'base_package': {
      // Combine groupId + artifactId (with hyphens removed) for Java package name
      const groupId = variables.groupId || 'com.example';
      const artifactId = variables.artifactId || variables.projectName || 'app';
      // Remove hyphens and convert to lowercase for valid Java package
      const packageSuffix = artifactId.replace(/-/g, '').toLowerCase();
      return `${groupId}.${packageSuffix}`;
    }
    default:
      return '';
  }
}

export class TemplatesService {
  private templatesDir: string;
  private templatesCache: CacheEntry<TemplateInfo[]> = { data: null, timestamp: 0 };

  constructor() {
    // Templates are in the dev-suite root/templates folder
    // When compiled, this file is at: server/dist/services/templates.service.js
    // Path: dist/services/ -> dist/ -> server/ -> dashboard/ -> configurator/ -> dev-suite/
    this.templatesDir = path.resolve(__dirname, '../../../../../templates');
    logger.debug('Templates directory resolved', { path: this.templatesDir });
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid<T>(cache: CacheEntry<T>): boolean {
    return cache.data !== null && Date.now() - cache.timestamp < CACHE_TTL_MS;
  }

  /**
   * Get default variables that are always available
   */
  private getDefaultVariables(): TemplateVariable[] {
    return [
      {
        name: 'projectName',
        label: 'Project Name',
        type: 'text',
        required: true,
        placeholder: 'my-project',
        description: 'The name of your project',
        pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$',
        patternError: 'Project name must start with a letter and contain only letters, numbers, hyphens, and underscores',
        minLength: 2,
        maxLength: 64,
      },
      {
        name: 'projectPath',
        label: 'Project Location',
        type: 'path',
        required: true,
        description: 'Directory where the project will be created',
      },
      {
        name: 'projectDescription',
        label: 'Description',
        type: 'text',
        required: false,
        default: '',
        placeholder: 'A brief description of your project',
        maxLength: 256,
      },
    ];
  }

  /**
   * List all available templates
   */
  async listTemplates(): Promise<TemplateListItem[]> {
    const endTimer = timeOperation(logger, 'listTemplates', TEMPLATE_SCAN_THRESHOLD);

    // Return cached if valid
    if (this.isCacheValid(this.templatesCache) && this.templatesCache.data) {
      logger.debug('Returning cached templates list');
      endTimer();
      return this.templatesCache.data.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        tags: t.tags,
        technologies: t.technologies,
      }));
    }

    const templates: TemplateInfo[] = [];

    try {
      if (!fs.existsSync(this.templatesDir)) {
        logger.warn('Templates directory does not exist', { path: this.templatesDir });
        endTimer();
        return [];
      }

      const entries = fs.readdirSync(this.templatesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const templateJsonPath = path.join(this.templatesDir, entry.name, 'template.json');
        if (!fs.existsSync(templateJsonPath)) continue;

        try {
          const content = fs.readFileSync(templateJsonPath, 'utf-8');
          const templateData = JSON.parse(content) as Record<string, unknown>;

          const template: TemplateInfo = {
            id: entry.name,
            name: (templateData.name as string) || entry.name,
            description: (templateData.description as string) || '',
            version: (templateData.version as string) || '1.0.0',
            author: templateData.author as string | undefined,
            tags: (templateData.tags as string[]) || [],
            category: determineCategory(templateData),
            technologies: (templateData.technologies as string[]) || [],
            structure: templateData.structure as TemplateInfo['structure'],
            files: templateData.files as string[] | undefined,
            scripts: templateData.scripts as Record<string, string> | undefined,
            features: templateData.features as string[] | undefined,
            basedOn: templateData.basedOn as string[] | undefined,
            devContainerSupport: templateData.devContainerSupport as boolean | undefined,
            variables: (templateData.variables as TemplateVariable[]) || [],
          };

          templates.push(template);
        } catch (parseError) {
          logger.warn('Failed to parse template.json', {
            error: parseError,
            context: { template: entry.name },
          });
        }
      }

      // Update cache
      this.templatesCache = { data: templates, timestamp: Date.now() };

      logger.debug('Loaded templates', { count: templates.length });
    } catch (error) {
      logger.error('Failed to list templates', { error });
    }

    endTimer();
    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      tags: t.tags,
      technologies: t.technologies,
    }));
  }

  /**
   * Get detailed information about a specific template
   */
  async getTemplate(templateId: string): Promise<TemplateInfo | null> {
    const endTimer = timeOperation(logger, 'getTemplate', TEMPLATE_SCAN_THRESHOLD, {
      data: { templateId },
    });

    // SECURITY: Validate templateId before path construction
    if (!/^[a-zA-Z0-9_.-]+$/.test(templateId)) {
      logger.warn('Invalid template ID', { context: { templateId } });
      endTimer();
      return null;
    }

    // Check cache first
    if (this.isCacheValid(this.templatesCache) && this.templatesCache.data) {
      const cached = this.templatesCache.data.find((t) => t.id === templateId);
      if (cached) {
        // Merge default variables with template-specific variables
        const result = {
          ...cached,
          variables: [...this.getDefaultVariables(), ...cached.variables],
        };
        endTimer();
        return result;
      }
    }

    const templatePath = path.join(this.templatesDir, templateId);
    const templateJsonPath = path.join(templatePath, 'template.json');

    if (!fs.existsSync(templateJsonPath)) {
      logger.warn('Template not found', { templateId });
      endTimer();
      return null;
    }

    try {
      const content = fs.readFileSync(templateJsonPath, 'utf-8');
      const templateData = JSON.parse(content) as Record<string, unknown>;

      const template: TemplateInfo = {
        id: templateId,
        name: (templateData.name as string) || templateId,
        description: (templateData.description as string) || '',
        version: (templateData.version as string) || '1.0.0',
        author: templateData.author as string | undefined,
        tags: (templateData.tags as string[]) || [],
        category: determineCategory(templateData),
        technologies: (templateData.technologies as string[]) || [],
        structure: templateData.structure as TemplateInfo['structure'],
        files: templateData.files as string[] | undefined,
        scripts: templateData.scripts as Record<string, string> | undefined,
        features: templateData.features as string[] | undefined,
        basedOn: templateData.basedOn as string[] | undefined,
        devContainerSupport: templateData.devContainerSupport as boolean | undefined,
        // Merge default variables with template-specific variables
        variables: [...this.getDefaultVariables(), ...(templateData.variables as TemplateVariable[] || [])],
      };

      endTimer();
      return template;
    } catch (error) {
      logger.error('Failed to read template', { error, context: { templateId } });
      endTimer();
      return null;
    }
  }

  /**
   * Validate template variables
   */
  async validateVariables(
    templateId: string,
    variables: Record<string, string>
  ): Promise<VariableValidationResult> {
    // Validate projectPath if present in variables
    if (variables.projectPath) {
      if (variables.projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
      try {
        variables.projectPath = resolveProjectPath(variables.projectPath);
    if (!path.isAbsolute(variables.projectPath)) throw new PathValidationError('Path must be rooted');
      } catch {
        // Let normal validation handle the error
      }
    }
    const template = await this.getTemplate(templateId);
    if (!template) {
      return {
        valid: false,
        errors: { _template: `Template '${templateId}' not found` },
        computedValues: {},
      };
    }

    const errors: Record<string, string> = {};
    const computedValues: Record<string, string> = {};

    // Process each variable
    for (const varDef of template.variables) {
      const value = variables[varDef.name];

      // Check conditional visibility
      if (varDef.showWhen) {
        const dependentValue = variables[varDef.showWhen.field];
        if (dependentValue !== varDef.showWhen.equals) {
          // Skip validation for hidden fields
          continue;
        }
      }

      // Derived values (process first so they're available for auto-generation)
      if (varDef.derivedFrom) {
        const sourceValue = variables[varDef.derivedFrom] || '';
        computedValues[varDef.name] = applyTransform(sourceValue, varDef.derivedTransform);
        continue;
      }

      // Auto-generated values (may depend on other variables including derived ones)
      if (varDef.autoGenerate) {
        // Merge user variables with computed values for compound auto-generation
        const allVars = { ...variables, ...computedValues };
        computedValues[varDef.name] = generateAutoValue(varDef.autoGenerate, allVars);
        continue;
      }

      // Required check
      if (varDef.required && (!value || value.trim() === '')) {
        errors[varDef.name] = `${varDef.label} is required`;
        continue;
      }

      // Skip further validation if empty and not required
      if (!value || value.trim() === '') continue;

      // Min length check
      if (varDef.minLength && value.length < varDef.minLength) {
        errors[varDef.name] = `${varDef.label} must be at least ${varDef.minLength} characters`;
        continue;
      }

      // Max length check
      if (varDef.maxLength && value.length > varDef.maxLength) {
        errors[varDef.name] = `${varDef.label} must be at most ${varDef.maxLength} characters`;
        continue;
      }

      // Pattern check
      if (varDef.pattern) {
        const regex = new RegExp(varDef.pattern);
        if (!regex.test(value)) {
          errors[varDef.name] = varDef.patternError || `${varDef.label} has an invalid format`;
          continue;
        }
      }

      // Path validation for path type
      if (varDef.type === 'path' && value) {
        // Check if parent directory exists (for new project paths)
        const parentDir = path.dirname(value);
        if (!fs.existsSync(parentDir)) {
          errors[varDef.name] = `Parent directory does not exist: ${parentDir}`;
          continue;
        }

        // Check if target already exists
        if (fs.existsSync(value)) {
          const stats = fs.statSync(value);
          if (stats.isDirectory()) {
            const files = fs.readdirSync(value);
            if (files.length > 0) {
              errors[varDef.name] = 'Directory already exists and is not empty';
            }
          } else {
            errors[varDef.name] = 'A file already exists at this path';
          }
        }
      }

      // Select validation
      if (varDef.type === 'select' && varDef.options) {
        const validValues = varDef.options.map((o: TemplateSelectOption) => o.value);
        if (!validValues.includes(value)) {
          errors[varDef.name] = `Invalid selection for ${varDef.label}`;
        }
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      computedValues,
    };
  }

  /**
   * Scaffold a new project from a template
   */
  async scaffoldProject(config: ScaffoldConfig): Promise<ScaffoldResult> {
    if (config.projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    config.projectPath = resolveProjectPath(config.projectPath);
    if (!path.isAbsolute(config.projectPath)) throw new PathValidationError('Path must be rooted');
    // SECURITY: Validate templateId before path construction
    if (!/^[a-zA-Z0-9_.-]+$/.test(config.templateId)) {
      throw new Error('Invalid template ID');
    }
    const endTimer = timeOperation(logger, 'scaffoldProject', TIMING_THRESHOLDS.FILE_WRITE, {
      data: { templateId: config.templateId, projectPath: config.projectPath },
    });

    const template = await this.getTemplate(config.templateId);
    if (!template) {
      endTimer();
      return {
        success: false,
        projectPath: config.projectPath,
        filesCreated: [],
        directoriesCreated: [],
        error: `Template '${config.templateId}' not found`,
      };
    }

    // Validate variables
    const validation = await this.validateVariables(config.templateId, config.variables);
    if (!validation.valid) {
      endTimer();
      return {
        success: false,
        projectPath: config.projectPath,
        filesCreated: [],
        directoriesCreated: [],
        error: `Invalid variables: ${Object.values(validation.errors).join(', ')}`,
      };
    }

    // Merge user variables with computed values
    const allVariables: Record<string, string> = {
      ...config.variables,
      ...validation.computedValues,
    };

    // Add derived variables that weren't in computedValues
    for (const varDef of template.variables) {
      if (varDef.derivedFrom && !allVariables[varDef.name]) {
        const sourceValue = allVariables[varDef.derivedFrom] || '';
        allVariables[varDef.name] = applyTransform(sourceValue, varDef.derivedTransform);
      }
    }

    // Add auto-generated variables (after derived, as some may depend on derived values)
    for (const varDef of template.variables) {
      if (varDef.autoGenerate && !allVariables[varDef.name]) {
        allVariables[varDef.name] = generateAutoValue(varDef.autoGenerate, allVariables);
      }
      // Add defaults for empty optional fields
      if (varDef.default && !allVariables[varDef.name]) {
        allVariables[varDef.name] = varDef.default;
      }
    }

    const templatePath = path.join(this.templatesDir, config.templateId);
    const filesCreated: string[] = [];
    const directoriesCreated: string[] = [];
    const warnings: string[] = [];

    try {
      // Create target directory if it doesn't exist
      if (!fs.existsSync(config.projectPath)) {
        fs.mkdirSync(config.projectPath, { recursive: true });
        directoriesCreated.push('.');
      }

      // Get list of template files
      const templateFiles = await this.getTemplateFiles(templatePath);

      // Process each template file
      for (const relativeFilePath of templateFiles) {
        const sourcePath = path.join(templatePath, relativeFilePath);

        // Skip template.json
        if (relativeFilePath === 'template.json') continue;

        // Determine target path (remove .tmpl extension if present)
        let targetRelativePath = relativeFilePath;
        const isTmpl = relativeFilePath.endsWith('.tmpl');
        if (isTmpl) {
          targetRelativePath = relativeFilePath.slice(0, -5); // Remove .tmpl
        }

        // Replace variables in file path (for dynamic file names)
        targetRelativePath = this.replaceVariables(targetRelativePath, allVariables);
        const targetPath = path.join(config.projectPath, targetRelativePath);

        // Create parent directories
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
          const relativeDir = path.relative(config.projectPath, targetDir);
          if (relativeDir && !directoriesCreated.includes(relativeDir)) {
            directoriesCreated.push(relativeDir);
          }
        }

        // Read source file
        const sourceContent = fs.readFileSync(sourcePath, 'utf-8');

        // Replace variables in content if it's a template file
        let targetContent = sourceContent;
        if (isTmpl || this.isTextFile(sourcePath)) {
          targetContent = this.replaceVariables(sourceContent, allVariables);
        }

        // Write target file
        fs.writeFileSync(targetPath, targetContent);
        filesCreated.push(targetRelativePath);

        logger.debug('Created file', { file: targetRelativePath });
      }

      // Create standard directories if they don't exist (based on template structure)
      await this.createStructureDirectories(config.projectPath, template, directoriesCreated);

      logger.info('Project scaffolded successfully', {
        templateId: config.templateId,
        projectPath: config.projectPath,
        filesCount: filesCreated.length,
        dirsCount: directoriesCreated.length,
      });

      endTimer();
      return {
        success: true,
        projectPath: config.projectPath,
        filesCreated,
        directoriesCreated,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      logger.error('Failed to scaffold project', { error, context: config });
      endTimer();
      return {
        success: false,
        projectPath: config.projectPath,
        filesCreated,
        directoriesCreated,
        error: error instanceof Error ? error.message : 'Unknown error during scaffolding',
      };
    }
  }

  /**
   * Get all files in a template directory (recursively)
   */
  private async getTemplateFiles(templatePath: string, basePath = ''): Promise<string[]> {
    // SECURITY: Path traversal check for private method
    if (templatePath.includes('..')) {
      throw new PathValidationError('Path traversal not allowed');
    }
    const files: string[] = [];
    const currentPath = basePath ? path.join(templatePath, basePath) : templatePath;

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        // Recursively get files from subdirectories
        const subFiles = await this.getTemplateFiles(templatePath, relativePath);
        files.push(...subFiles);
      } else {
        files.push(relativePath);
      }
    }

    return files;
  }

  /**
   * Replace {{variable}} placeholders in content
   */
  private replaceVariables(content: string, variables: Record<string, string>): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, varName: string) => {
      return variables[varName] !== undefined ? variables[varName] : match;
    });
  }

  /**
   * Check if file is a text file that should have variables replaced
   */
  private isTextFile(filePath: string): boolean {
    const textExtensions = [
      '.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.js', '.ts',
      '.jsx', '.tsx', '.java', '.py', '.go', '.rs', '.toml', '.properties', '.env',
      '.gitignore', '.dockerignore', '.sh', '.bat', '.ps1', '.sql', '.prisma',
    ];
    const ext = path.extname(filePath).toLowerCase();
    return textExtensions.includes(ext) || ext === '';
  }

  /**
   * Create directories based on template structure definition
   */
  private async createStructureDirectories(
    projectPath: string,
    template: TemplateInfo,
    existingDirs: string[]
  ): Promise<void> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    if (!template.structure) return;

    const createDir = (relativePath: string) => {
      if (existingDirs.includes(relativePath)) return;
      const fullPath = path.join(projectPath, relativePath);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        existingDirs.push(relativePath);
      }
    };

    // Create frontend structure directories
    if (template.structure.frontend?.path) {
      createDir(template.structure.frontend.path);
    }

    // Create backend structure directories
    if (template.structure.backend?.path) {
      createDir(template.structure.backend.path);
    }

    // Create shared structure directories
    if (template.structure.shared?.path) {
      createDir(template.structure.shared.path);
    }
  }

  /**
   * Invalidate templates cache
   */
  invalidateCache(): void {
    this.templatesCache = { data: null, timestamp: 0 };
    logger.debug('Templates cache invalidated');
  }
}
