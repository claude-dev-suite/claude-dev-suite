// SPDX-License-Identifier: MIT
/**
 * Code Generator Service
 *
 * Orchestrates spec validation, deterministic code generation, convention
 * scanning, and refinement-job creation for the orchestrator.
 *
 * Supported input technologies: openapi, asyncapi, typespec, protobuf, bpmn
 * Supported output targets: 9 target languages / frameworks
 *
 * Generation internals live in ./codegen/ — one module per target family
 * (typescript, java, python, go) plus spec parsing, shared helpers, and the
 * static target catalog.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';
import { getLogger } from '../utils/logger.js';
import type {
  CodeGenTechnology,
  CodeGenTargetLanguage,
  CodeGenComponent,
  CodeGenTargetInfo,
  ValidationResult,
  GeneratedFile,
  CodeGenPreview,
  ProjectConventions,
  RefinementOptions,
} from '../types/codegen.js';
import type { SubTask } from '../types/orchestrator.js';
import type { SpecInfo } from './codegen/shared.js';
import { buildSpecInfo } from './codegen/spec-parser.js';
import { TARGETS, REFINEMENT_PROFILES } from './codegen/targets.js';
import { assembleTypeScriptFiles } from './codegen/typescript.js';
import { assembleJavaFiles } from './codegen/java.js';
import { assemblePythonFiles } from './codegen/python.js';
import { assembleGoFiles } from './codegen/go.js';

const logger = getLogger('CodeGenService');

// ============================================
// SERVICE CLASS
// ============================================

export class CodeGenService {

  /**
   * Returns available code-generation targets, optionally filtered by
   * the technology that produced the spec.
   */
  getTargets(technology?: CodeGenTechnology): CodeGenTargetInfo[] {
    if (!technology) return TARGETS;
    return TARGETS.filter(t => t.technologies.includes(technology));
  }

  /**
   * Auto-detects the spec technology from file extension and/or content.
   * Returns null when detection is inconclusive.
   */
  detectTechnology(content: string, fileName: string): CodeGenTechnology | null {
    const ext = path.extname(fileName).toLowerCase();

    if (ext === '.tsp') return 'typespec';
    if (ext === '.proto') return 'protobuf';
    if (ext === '.bpmn') return 'bpmn';

    if (/["']?openapi["']?\s*:\s*["']?3/i.test(content) || /["']?swagger["']?\s*:\s*["']?2/i.test(content)) {
      return 'openapi';
    }
    if (/["']?asyncapi["']?\s*:\s*/i.test(content)) return 'asyncapi';
    if (/syntax\s*=\s*["']proto3["']/i.test(content)) return 'protobuf';
    if (/bpmn:definitions|xmlns:bpmn/i.test(content)) return 'bpmn';
    if (/namespace\s+\w/.test(content) && /@route|@get|@post|@put|@delete/i.test(content)) {
      return 'typespec';
    }

    return null;
  }

  /**
   * Validates the spec content and returns a structured ValidationResult.
   * Auto-detects the technology when technologyHint is not provided.
   */
  validateSpec(
    content: string,
    fileName: string,
    technologyHint?: CodeGenTechnology,
  ): ValidationResult {
    const technology = technologyHint ?? this.detectTechnology(content, fileName);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!technology) {
      return {
        valid: false, technology: null, version: null,
        errors: ['Unable to detect specification technology. Supported formats: OpenAPI, AsyncAPI, TypeSpec, Protobuf, BPMN.'],
        warnings: [], summary: {},
      };
    }

    if (!content || content.trim().length === 0) {
      return { valid: false, technology, version: null, errors: ['Spec content is empty.'], warnings: [], summary: {} };
    }

    switch (technology) {
      case 'openapi': {
        if (!/["']?openapi["']?\s*:|["']?swagger["']?\s*:/i.test(content)) {
          errors.push('Missing required "openapi" or "swagger" version field.');
        }

        let parsedVersion: string | null = null;
        let parsedTitle: string | undefined;
        let endpoints = 0;
        let models = 0;

        try {
          const parsed = JSON.parse(content) as Record<string, unknown>;
          parsedVersion = (parsed.openapi as string) ?? (parsed.swagger as string) ?? null;
          const info = parsed.info as Record<string, unknown> | undefined;
          parsedTitle = info?.title as string | undefined;
          const paths = parsed.paths as Record<string, unknown> | undefined;
          endpoints = paths ? Object.keys(paths).length : 0;
          const schemas = ((parsed.components as Record<string, unknown>)?.schemas ?? {}) as Record<string, unknown>;
          models = Object.keys(schemas).length;
        } catch {
          if (!/^\s*(openapi|swagger)\s*:/m.test(content)) {
            errors.push('Spec does not appear to be valid YAML or JSON.');
          }
          const versionMatch = content.match(/(?:openapi|swagger):\s*["']?([0-9.]+)/i);
          parsedVersion = versionMatch?.[1] ?? null;
          const titleMatch = content.match(/^\s*title:[ \t]*["']?([^"'\r\n]+)["']?[ \t]*$/m);
          parsedTitle = titleMatch?.[1]?.trim();
          const pathMatches = content.match(/^\s{2}(\/[^\s:]+):/gm);
          endpoints = pathMatches?.length ?? 0;
        }

        if (endpoints === 0 && errors.length === 0) warnings.push('No paths/endpoints found in spec.');
        if (models === 0 && errors.length === 0) warnings.push('No schemas/models found in spec.');

        return {
          valid: errors.length === 0, technology, version: parsedVersion,
          errors, warnings,
          summary: { title: parsedTitle, endpoints, models },
        };
      }

      case 'asyncapi': {
        if (!/["']?asyncapi["']?\s*:/i.test(content)) {
          errors.push('Missing required "asyncapi" version field.');
        }

        let version: string | null = null;
        let title: string | undefined;
        let channels = 0;

        try {
          const parsed = JSON.parse(content) as Record<string, unknown>;
          version = (parsed.asyncapi as string) ?? null;
          const info = parsed.info as Record<string, unknown> | undefined;
          title = info?.title as string | undefined;
          const rawChannels = parsed.channels as Record<string, unknown> | undefined;
          channels = rawChannels ? Object.keys(rawChannels).length : 0;
        } catch {
          const versionMatch = content.match(/asyncapi:\s*["']?([0-9.]+)/i);
          version = versionMatch?.[1] ?? null;
          const titleMatch = content.match(/^\s*title:[ \t]*["']?([^"'\r\n]+)["']?[ \t]*$/m);
          title = titleMatch?.[1]?.trim();
        }

        return {
          valid: errors.length === 0, technology, version,
          errors, warnings,
          summary: { title, channels },
        };
      }

      case 'typespec': {
        const hasNamespace = /namespace\s+\w+/.test(content);
        const hasModel = /model\s+\w+/.test(content);
        const hasOp = /@route|@get|@post|@put|@delete/i.test(content);

        if (!hasNamespace) warnings.push('No namespace declaration found.');
        if (!hasModel) warnings.push('No model definitions found.');
        if (!hasOp) warnings.push('No route/operation decorators found (@route, @get, @post, …).');
        if (!hasNamespace && !hasModel && !hasOp) {
          errors.push('Content does not appear to be a valid TypeSpec file.');
        }

        const specInfo = buildSpecInfo(content, 'typespec');
        return {
          valid: errors.length === 0, technology, version: null,
          errors, warnings,
          summary: { title: specInfo.title, endpoints: specInfo.endpoints.length, models: specInfo.models.length },
        };
      }

      case 'protobuf': {
        if (!/syntax\s*=\s*["']proto3["']/i.test(content)) {
          errors.push('Missing proto3 syntax declaration: syntax = "proto3";');
        }

        const specInfo = buildSpecInfo(content, 'protobuf');
        const messages = specInfo.protoMessages.length;
        const services = specInfo.protoServices.length;

        if (messages === 0 && errors.length === 0) warnings.push('No message definitions found.');

        return {
          valid: errors.length === 0, technology, version: null,
          errors, warnings,
          summary: { title: specInfo.title, messages, services },
        };
      }

      case 'bpmn': {
        if (!/bpmn:definitions|xmlns:bpmn/i.test(content)) {
          errors.push('Content does not appear to be a valid BPMN file (missing bpmn:definitions or xmlns:bpmn).');
        }

        const specInfo = buildSpecInfo(content, 'bpmn');
        const processes = specInfo.bpmnProcesses.length;
        const tasks = specInfo.bpmnProcesses.reduce((acc, p) => acc + p.tasks.length, 0);

        return {
          valid: errors.length === 0, technology, version: null,
          errors, warnings,
          summary: { title: specInfo.title, services: processes, messages: tasks },
        };
      }
    }
  }

  /**
   * Returns a preview of the files that would be generated without writing
   * anything to disk.
   */
  generatePreview(
    content: string,
    _fileName: string,
    technology: CodeGenTechnology,
    targetLanguage: CodeGenTargetLanguage,
    components: CodeGenComponent[],
  ): CodeGenPreview {
    const enabledComponents = new Set(
      components.filter(c => c.enabled).map(c => c.id.toLowerCase()),
    );
    const specInfo = buildSpecInfo(content, technology);
    const files = this._assembleFiles(specInfo, targetLanguage, 'generated', enabledComponents);

    return {
      files: files.map(f => ({ path: f.path, language: f.language, estimatedSize: f.size })),
      totalFiles: files.length,
      components: components.filter(c => c.enabled).map(c => c.label),
    };
  }

  /**
   * Generates code files and returns them as GeneratedFile objects.
   * Files are NOT written to disk; call acceptFiles() for that.
   */
  generate(
    content: string,
    fileName: string,
    technology: CodeGenTechnology,
    targetLanguage: CodeGenTargetLanguage,
    outputDir: string,
    components: CodeGenComponent[],
    projectPath: string,
  ): GeneratedFile[] {
    if (outputDir.includes('..')) throw new PathValidationError('Path traversal not allowed in outputDir');
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    const resolvedProject = resolveProjectPath(projectPath);
    if (!path.isAbsolute(resolvedProject)) throw new PathValidationError('Project path must be rooted');

    logger.info('Generating code', { data: { technology, targetLanguage, outputDir, fileName } });

    const enabledComponents = new Set(
      components.filter(c => c.enabled).map(c => c.id.toLowerCase()),
    );

    const specInfo = buildSpecInfo(content, technology);
    const files = this._assembleFiles(specInfo, targetLanguage, outputDir, enabledComponents);

    logger.info('Code generation complete', { data: { fileCount: files.length } });
    return files;
  }

  /**
   * Scans the project for coding conventions (formatting, naming, imports,
   * error-handling patterns).
   */
  scanConventions(projectPath: string): ProjectConventions {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    const resolved = resolveProjectPath(projectPath);
    if (!path.isAbsolute(resolved)) throw new PathValidationError('Project path must be rooted');

    const conventions: ProjectConventions = {
      naming: { variables: 'unknown', files: 'unknown', components: 'unknown' },
      imports: { style: 'unknown' },
      errorHandling: { pattern: 'unknown' },
      formatting: { indent: 'unknown', indentSize: 2, quotes: 'unknown', semicolons: true },
    };

    // --- Prettier ---
    const prettierPaths = ['.prettierrc', '.prettierrc.json'].map(f => path.join(resolved, f));
    for (const p of prettierPaths) {
      if (fs.existsSync(p)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
          if (cfg.singleQuote === true) conventions.formatting.quotes = 'single';
          else if (cfg.singleQuote === false) conventions.formatting.quotes = 'double';
          if (cfg.semi === false) conventions.formatting.semicolons = false;
          else if (cfg.semi === true) conventions.formatting.semicolons = true;
          if (cfg.useTabs === true) {
            conventions.formatting.indent = 'tabs';
          } else {
            conventions.formatting.indent = 'spaces';
            conventions.formatting.indentSize = typeof cfg.tabWidth === 'number' ? cfg.tabWidth : 2;
          }
        } catch { /* non-critical */ }
        break;
      }
    }

    // --- tsconfig path aliases ---
    const tsconfigPath = path.join(resolved, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      try {
        // Strip JSON comments before parsing
        const raw = fs.readFileSync(tsconfigPath, 'utf-8')
          .replace(/\/\/[^\n]*/g, '')
          .replace(/\/\*[\s\S]*?\*\//g, '');
        const tsconfig = JSON.parse(raw) as Record<string, unknown>;
        const paths = (tsconfig.compilerOptions as Record<string, unknown>)?.paths as Record<string, unknown> | undefined;
        if (paths) {
          const firstAlias = Object.keys(paths)[0];
          if (firstAlias?.startsWith('@/')) conventions.imports = { style: 'alias', aliasPrefix: '@/' };
          else if (firstAlias?.startsWith('~/')) conventions.imports = { style: 'alias', aliasPrefix: '~/' };
          else if (firstAlias?.startsWith('#')) conventions.imports = { style: 'alias', aliasPrefix: '#' };
        }
      } catch { /* non-critical */ }
    }

    // --- ESLint (assume camelCase naming) ---
    const eslintFiles = ['.eslintrc', '.eslintrc.json', '.eslintrc.js', 'eslint.config.js', 'eslint.config.mjs'];
    if (eslintFiles.some(f => fs.existsSync(path.join(resolved, f)))) {
      conventions.naming.variables = 'camelCase';
      conventions.naming.components = 'PascalCase';
    }

    // --- package.json ---
    const pkgPath = path.join(resolved, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
        const allDeps = {
          ...(pkg.dependencies as Record<string, string> | undefined),
          ...(pkg.devDependencies as Record<string, string> | undefined),
        };
        if ('neverthrow' in allDeps || 'ts-results' in allDeps) {
          conventions.errorHandling.pattern = 'result-type';
        } else {
          conventions.errorHandling.pattern = 'try-catch';
        }
      } catch { /* non-critical */ }
    }

    // --- src/ file naming patterns ---
    const srcDir = path.join(resolved, 'src');
    if (fs.existsSync(srcDir)) {
      try {
        const files = fs.readdirSync(srcDir);
        const tsFiles = files.filter(f => /\.(ts|tsx|js)$/.test(f));
        let kebab = 0, pascal = 0, camel = 0;
        for (const file of tsFiles) {
          const base = file.replace(/\.(ts|tsx|js)$/, '');
          if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(base)) kebab++;
          else if (/^[A-Z][a-zA-Z0-9]+$/.test(base)) pascal++;
          else if (/^[a-z][a-zA-Z0-9]+$/.test(base)) camel++;
        }
        const max = Math.max(kebab, pascal, camel);
        if (max > 0) {
          if (max === kebab) conventions.naming.files = 'kebab-case';
          else if (max === pascal) conventions.naming.files = 'PascalCase';
          else conventions.naming.files = 'camelCase';
        }
      } catch { /* non-critical */ }
    }

    logger.debug('Conventions scanned', { data: { projectPath: resolved, conventions } });
    return conventions;
  }

  /**
   * Creates an orchestrator job definition with batched subtasks for
   * Claude-powered refinement of generated files.
   */
  buildRefinementJob(
    projectPath: string,
    generatedFiles: GeneratedFile[],
    technology: CodeGenTechnology,
    targetLanguage: CodeGenTargetLanguage,
    refinementOptions: RefinementOptions,
    conventions: ProjectConventions,
  ): {
    title: string;
    prompt: string;
    projectPath: string;
    subTasks: SubTask[];
  } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    const resolvedProject = resolveProjectPath(projectPath);
    if (!path.isAbsolute(resolvedProject)) throw new PathValidationError('Project path must be rooted');

    const profile = REFINEMENT_PROFILES[targetLanguage];
    const subTasks: SubTask[] = [];

    const conventionsSummary = [
      `File naming: ${conventions.naming.files}`,
      `Variable naming: ${conventions.naming.variables}`,
      `Quotes: ${conventions.formatting.quotes}`,
      `Semicolons: ${conventions.formatting.semicolons ? 'yes' : 'no'}`,
      `Indent: ${conventions.formatting.indent} (${conventions.formatting.indentSize})`,
      `Import style: ${conventions.imports.style}${conventions.imports.aliasPrefix ? ` (${conventions.imports.aliasPrefix})` : ''}`,
      `Error handling: ${conventions.errorHandling.pattern}`,
    ].join('\n');

    const scopeBlock = [
      `ALLOWED changes: ${profile.scopeConstraints.allowed.join(', ')}`,
      `FORBIDDEN changes: ${profile.scopeConstraints.forbidden.join(', ')}`,
    ].join('\n');

    const refinementInstructions: string[] = [];
    if (refinementOptions.naming) refinementInstructions.push('- Apply project naming conventions to all identifiers');
    if (refinementOptions.codeStyle) refinementInstructions.push('- Apply formatting/style conventions (quotes, semicolons, indentation)');
    if (refinementOptions.errorHandling) {
      refinementInstructions.push(
        conventions.errorHandling.pattern === 'result-type'
          ? '- Replace try/catch with neverthrow Result type'
          : '- Ensure proper try/catch error handling with typed errors',
      );
    }
    if (refinementOptions.testStubs) refinementInstructions.push('- Improve test stubs with realistic assertions');

    const batchSize = 5;
    for (let i = 0; i < generatedFiles.length; i += batchSize) {
      const batch = generatedFiles.slice(i, i + batchSize);
      const filesContent = batch.map(f =>
        `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``
      ).join('\n\n');

      const task = [
        `You are refining auto-generated code for a ${technology} → ${targetLanguage} code generation task.`,
        '',
        '## Scope Constraints',
        scopeBlock,
        '',
        '## Project Conventions',
        conventionsSummary,
        '',
        '## Refinement Instructions',
        refinementInstructions.join('\n') || '- No specific refinements requested.',
        '',
        '## Files to Refine',
        filesContent,
        '',
        'For each file, output the complete refined content with the file path as a header.',
        'Do not add new files, do not change the public API, do not restructure the project.',
      ].join('\n');

      subTasks.push({ agentId: profile.agentId, task });
    }

    const mainPrompt = [
      `Refine ${generatedFiles.length} generated ${targetLanguage} file(s) from a ${technology} spec.`,
      `Target agent: ${profile.agentId}`,
      `Refinements: ${refinementInstructions.join('; ') || 'none'}`,
    ].join('\n');

    return {
      title: `Refine generated ${targetLanguage} code (${technology} spec)`,
      prompt: mainPrompt,
      projectPath: resolvedProject,
      subTasks,
    };
  }

  /**
   * Writes accepted generated files to disk.
   * Validates every resolved file path stays within the project directory.
   */
  acceptFiles(
    projectPath: string,
    outputDir: string,
    files: GeneratedFile[],
  ): { written: string[]; skipped: string[] } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    const resolvedProject = resolveProjectPath(projectPath);
    if (!path.isAbsolute(resolvedProject)) throw new PathValidationError('Project path must be rooted');

    if (outputDir.includes('..')) throw new PathValidationError('Path traversal not allowed in outputDir');

    const written: string[] = [];
    const skipped: string[] = [];
    const baseOutputDir = path.isAbsolute(outputDir)
      ? outputDir
      : path.join(resolvedProject, outputDir);

    for (const file of files) {
      try {
        // Preserve the generator's directory structure. `path.basename` used to
        // collapse `models/models.go`, `handlers/handlers.go` and
        // `routes/routes.go` into one directory, each with a different package
        // clause — `go build ./generated` then fails outright, and Java the same.
        const relative = file.path.split(/[\/]/).filter(Boolean);
        if (relative.some(seg => seg === '..' || seg === '.')) {
          logger.warn('Skipping generated file with a traversing path', { data: { filePath: file.path } });
          skipped.push(file.path);
          continue;
        }
        // Generators emit paths already prefixed with the output directory;
        // joining blindly would produce `generated/generated/models/models.go`.
        //
        // The whole prefix has to match, not just its last segment: comparing
        // `relative[0]` against `outSegments.at(-1)` worked for a single-segment
        // `generated/` but silently failed for the default `src/generated`,
        // where the last segment is `generated` and the emitted path starts with
        // `src`. Nothing was trimmed and every accepted file landed in
        // `src/generated/src/generated/…`.
        const outSegments = outputDir.split(/[\/]/).filter(Boolean);
        const hasPrefix =
          outSegments.length > 0 &&
          relative.length > outSegments.length &&
          outSegments.every((seg, i) => relative[i] === seg);
        const trimmed = hasPrefix ? relative.slice(outSegments.length) : relative;
        const resolvedFilePath = path.isAbsolute(file.path)
          ? file.path
          : path.join(baseOutputDir, ...trimmed);

        const rootWithSep = resolvedProject.endsWith(path.sep) ? resolvedProject : resolvedProject + path.sep;
        if (resolvedFilePath.includes('..') || (!resolvedFilePath.startsWith(rootWithSep) && resolvedFilePath !== resolvedProject)) {
          logger.warn('Skipping file outside project boundary', { data: { filePath: resolvedFilePath } });
          skipped.push(file.path);
          continue;
        }

        fs.mkdirSync(path.dirname(resolvedFilePath), { recursive: true });
        fs.writeFileSync(resolvedFilePath, file.content, 'utf-8');
        written.push(resolvedFilePath);
        logger.debug('Written file', { data: { path: resolvedFilePath } });
      } catch (err) {
        logger.error('Failed to write file', { error: err, data: { filePath: file.path } });
        skipped.push(file.path);
      }
    }

    logger.info('acceptFiles complete', { data: { written: written.length, skipped: skipped.length } });
    return { written, skipped };
  }

  // ------------------------------------------
  // Private helpers
  // ------------------------------------------

  private _assembleFiles(
    specInfo: SpecInfo,
    targetLanguage: CodeGenTargetLanguage,
    outputDir: string,
    enabledComponents: Set<string>,
  ): GeneratedFile[] {
    if (targetLanguage.startsWith('typescript-')) {
      return assembleTypeScriptFiles(specInfo, targetLanguage, outputDir, enabledComponents);
    }
    if (targetLanguage === 'java-spring') {
      return assembleJavaFiles(specInfo, outputDir, enabledComponents);
    }
    if (targetLanguage.startsWith('python-')) {
      return assemblePythonFiles(specInfo, targetLanguage, outputDir, enabledComponents);
    }
    if (targetLanguage.startsWith('go-')) {
      return assembleGoFiles(specInfo, targetLanguage, outputDir, enabledComponents);
    }
    return [];
  }
}
