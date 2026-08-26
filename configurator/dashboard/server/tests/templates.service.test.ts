/**
 * Tests for TemplatesService
 *
 * The TemplatesService resolves its templates directory from __dirname at runtime
 * (pointing to the real dev-suite/templates/ folder when compiled).
 * We test the service both against the real templates directory (listing / reading
 * existing templates) and against a synthetic temp directory by subclassing the
 * service to inject an alternative path.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TemplatesService } from '../src/services/templates.service.js';
import type { ScaffoldConfig } from '../src/types/templates.js';
import { createTempDir, cleanupTempDir } from './test-utils.js';

// ----------------------------------------------------------------
// Helper: create a synthetic templates directory for scaffolding tests
// ----------------------------------------------------------------
function createSyntheticTemplatesDir(baseDir: string): string {
  const templatesDir = path.join(baseDir, 'templates');
  fs.mkdirSync(templatesDir, { recursive: true });

  // NOTE: scaffoldable content goes under `<template>/files/`, matching the
  // real templates in `templates/`. The fixture used to place files at the
  // template root, which is why it could not detect that the `files/` prefix
  // was never stripped from the generated project's paths.

  // Template 1: "simple-app" — pure files, no subdirs
  const simpleDir = path.join(templatesDir, 'simple-app');
  fs.mkdirSync(simpleDir, { recursive: true });
  fs.writeFileSync(
    path.join(simpleDir, 'template.json'),
    JSON.stringify({
      name: 'Simple App',
      description: 'A simple app template',
      version: '1.0.0',
      tags: ['frontend', 'react'],
      technologies: ['react', 'vite'],
      structure: { frontend: { path: '.' } },
      variables: [
        {
          name: 'appTitle',
          label: 'App Title',
          type: 'text',
          required: false,
          default: 'My App',
          maxLength: 50,
        },
      ],
    })
  );
  const simpleFiles = path.join(simpleDir, 'files');
  fs.mkdirSync(simpleFiles, { recursive: true });
  // A template file with variable substitution
  fs.writeFileSync(
    path.join(simpleFiles, 'README.md.tmpl'),
    '# {{projectName}}\n\n{{appTitle}}\n'
  );
  // A regular file
  fs.writeFileSync(path.join(simpleFiles, '.gitignore'), 'node_modules\n');
  // A nested file, so the prefix strip is exercised on more than one segment.
  fs.mkdirSync(path.join(simpleFiles, 'src'), { recursive: true });
  fs.writeFileSync(path.join(simpleFiles, 'src', 'main.ts'), 'export {};\n');

  // Template 2: "fullstack-app" — frontend + backend structure
  const fullstackDir = path.join(templatesDir, 'fullstack-app');
  fs.mkdirSync(fullstackDir, { recursive: true });
  fs.writeFileSync(
    path.join(fullstackDir, 'template.json'),
    JSON.stringify({
      name: 'Fullstack App',
      description: 'A fullstack app template',
      version: '1.0.0',
      tags: [],
      technologies: ['react', 'nestjs'],
      structure: {
        frontend: { path: 'frontend' },
        backend: { path: 'backend' },
      },
      variables: [],
    })
  );

  // Template 3: "backend-only" (no frontend)
  const backendDir = path.join(templatesDir, 'backend-only');
  fs.mkdirSync(backendDir, { recursive: true });
  fs.writeFileSync(
    path.join(backendDir, 'template.json'),
    JSON.stringify({
      name: 'Backend Only',
      description: 'A backend template',
      version: '1.0.0',
      tags: ['backend', 'api'],
      technologies: ['node', 'express'],
      structure: { backend: { path: '.' } },
      variables: [],
    })
  );

  // Template 4: has invalid JSON (should be skipped gracefully)
  const brokenDir = path.join(templatesDir, 'broken-template');
  fs.mkdirSync(brokenDir, { recursive: true });
  fs.writeFileSync(path.join(brokenDir, 'template.json'), '{ invalid json }');

  return templatesDir;
}

/**
 * Subclass that allows injecting a custom templates directory.
 */
class TestableTemplatesService extends TemplatesService {
  constructor(private customTemplatesDir: string) {
    super();
    // Override the private field via prototype trick — safe for testing
    (this as unknown as Record<string, unknown>)['templatesDir'] = customTemplatesDir;
  }
}

// ----------------------------------------------------------------
// Tests against the REAL templates directory (smoke tests)
// ----------------------------------------------------------------
describe('TemplatesService (real templates dir)', () => {
  let service: TemplatesService;

  beforeEach(() => {
    service = new TemplatesService();
    service.invalidateCache();
  });

  it('listTemplates should return an array', async () => {
    const templates = await service.listTemplates();
    expect(Array.isArray(templates)).toBe(true);
  });

  it('each listed template should have required fields', async () => {
    const templates = await service.listTemplates();
    for (const t of templates) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('category');
      expect(t).toHaveProperty('tags');
      expect(t).toHaveProperty('technologies');
    }
  });

  it('listTemplates should use cache on second call', async () => {
    const first = await service.listTemplates();
    const second = await service.listTemplates();
    // Same content (not necessarily same reference due to map)
    expect(second.length).toBe(first.length);
  });

  it('invalidateCache should clear the cache', async () => {
    await service.listTemplates(); // populate cache
    service.invalidateCache();
    // After invalidation, a fresh read should still work
    const templates = await service.listTemplates();
    expect(Array.isArray(templates)).toBe(true);
  });

  it('getTemplate should return null for non-existent template', async () => {
    const template = await service.getTemplate('this-template-does-not-exist');
    expect(template).toBeNull();
  });

  it('getTemplate should return null for invalid template ID characters', async () => {
    const template = await service.getTemplate('../../etc/passwd');
    expect(template).toBeNull();
  });

  it('getTemplate for an existing template should include default variables', async () => {
    const templates = await service.listTemplates();
    if (templates.length === 0) return; // skip if no templates

    const first = templates[0]!;
    const template = await service.getTemplate(first.id);
    expect(template).not.toBeNull();
    // Default variables: projectName, projectPath, projectDescription
    const names = template!.variables.map((v) => v.name);
    expect(names).toContain('projectName');
    expect(names).toContain('projectPath');
  });
});

// ----------------------------------------------------------------
// Tests against the SYNTHETIC templates directory
// ----------------------------------------------------------------
describe('TemplatesService (synthetic templates dir)', () => {
  let tempBase: string;
  let templatesDir: string;
  let service: TestableTemplatesService;

  beforeEach(() => {
    tempBase = createTempDir('templates-test-');
    templatesDir = createSyntheticTemplatesDir(tempBase);
    service = new TestableTemplatesService(templatesDir);
  });

  afterEach(() => {
    cleanupTempDir(tempBase);
  });

  // ----------------------------------------------------------------
  // listTemplates
  // ----------------------------------------------------------------
  describe('listTemplates', () => {
    it('should list all valid templates (skipping broken JSON)', async () => {
      const templates = await service.listTemplates();
      // Should find 3 valid + 1 broken (skipped) = 3
      expect(templates.length).toBe(3);
    });

    it('should categorise fullstack correctly', async () => {
      const templates = await service.listTemplates();
      const fullstack = templates.find((t) => t.id === 'fullstack-app');
      expect(fullstack?.category).toBe('fullstack');
    });

    it('should categorise frontend correctly', async () => {
      const templates = await service.listTemplates();
      const frontend = templates.find((t) => t.id === 'simple-app');
      expect(frontend?.category).toBe('frontend');
    });

    it('should categorise backend correctly', async () => {
      const templates = await service.listTemplates();
      const backend = templates.find((t) => t.id === 'backend-only');
      expect(backend?.category).toBe('backend');
    });

    it('should return cached results on second call', async () => {
      const first = await service.listTemplates();
      const second = await service.listTemplates();
      expect(second.length).toBe(first.length);
    });

    it('should return empty array when templates dir does not exist', async () => {
      const noExistService = new TestableTemplatesService('/this/path/does/not/exist');
      const templates = await noExistService.listTemplates();
      expect(templates).toEqual([]);
    });
  });

  // ----------------------------------------------------------------
  // getTemplate
  // ----------------------------------------------------------------
  describe('getTemplate', () => {
    it('should return template by ID', async () => {
      const template = await service.getTemplate('simple-app');
      expect(template).not.toBeNull();
      expect(template?.id).toBe('simple-app');
      expect(template?.name).toBe('Simple App');
    });

    it('should include default variables merged with template variables', async () => {
      const template = await service.getTemplate('simple-app');
      const names = template!.variables.map((v) => v.name);
      // Default variables
      expect(names).toContain('projectName');
      expect(names).toContain('projectPath');
      // Template-specific variable
      expect(names).toContain('appTitle');
    });

    it('should return null for non-existent template', async () => {
      const template = await service.getTemplate('does-not-exist');
      expect(template).toBeNull();
    });

    it('should return null for invalid template ID characters', async () => {
      const template = await service.getTemplate('../../bad');
      expect(template).toBeNull();
    });

    it('should return from cache when called twice', async () => {
      // Populate cache via listTemplates
      await service.listTemplates();
      const template = await service.getTemplate('simple-app');
      expect(template).not.toBeNull();
    });
  });

  // ----------------------------------------------------------------
  // validateVariables
  // ----------------------------------------------------------------
  describe('validateVariables', () => {
    it('should return error for missing required variable', async () => {
      const result = await service.validateVariables('simple-app', {
        // projectName is required but missing
        projectPath: tempBase,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.projectName).toBeDefined();
    });

    it('should pass validation with all required variables', async () => {
      // projectPath parent must exist — tempBase exists, new-project doesn't yet
      const projectTarget = path.join(tempBase, 'new-project');
      const result = await service.validateVariables('simple-app', {
        projectName: 'my-project',
        projectPath: projectTarget,
      });
      // projectPath parent exists, target doesn't exist yet → valid
      expect(result.valid).toBe(true);
    });

    it('should return error when template not found', async () => {
      const result = await service.validateVariables('non-existent', {
        projectName: 'test',
        projectPath: tempBase,
      });
      expect(result.valid).toBe(false);
      expect(result.errors._template).toBeDefined();
    });

    it('should fail max length validation', async () => {
      const longTitle = 'A'.repeat(51); // maxLength is 50 for appTitle
      const projectTarget = path.join(tempBase, 'new-project-2');
      const result = await service.validateVariables('simple-app', {
        projectName: 'my-project',
        projectPath: projectTarget,
        appTitle: longTitle,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.appTitle).toContain('at most 50');
    });

    it('should fail pattern validation for invalid project name', async () => {
      const projectTarget = path.join(tempBase, 'new-project-3');
      const result = await service.validateVariables('simple-app', {
        projectName: '1invalid-start',  // must start with letter
        projectPath: projectTarget,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.projectName).toBeDefined();
    });

    it('should throw PathValidationError for path traversal in projectPath', async () => {
      await expect(
        service.validateVariables('simple-app', {
          projectName: 'test',
          projectPath: '/tmp/../etc',
        })
      ).rejects.toThrow(/traversal/i);
    });
  });

  // ----------------------------------------------------------------
  // scaffoldProject
  // ----------------------------------------------------------------
  describe('scaffoldProject', () => {
    // NOTE: resolveProjectPath requires the path to exist on disk.
    // We pre-create each target directory before calling scaffoldProject.

    it('should scaffold a project and return success', async () => {
      const projectTarget = path.join(tempBase, 'scaffolded-simple');
      fs.mkdirSync(projectTarget, { recursive: true });
      const config: ScaffoldConfig = {
        templateId: 'simple-app',
        projectPath: projectTarget,
        variables: {
          projectName: 'myapp',
          projectPath: projectTarget,
          appTitle: 'My Application',
        },
      };

      const result = await service.scaffoldProject(config);
      expect(result.success).toBe(true);
      expect(result.filesCreated.length).toBeGreaterThan(0);
      expect(fs.existsSync(projectTarget)).toBe(true);
    });

    it('strips the template files/ prefix from the generated project', async () => {
      const projectTarget = path.join(tempBase, 'scaffolded-prefix');
      fs.mkdirSync(projectTarget, { recursive: true });

      const result = await service.scaffoldProject({
        templateId: 'simple-app',
        projectPath: projectTarget,
        variables: { projectName: 'prefix-app', projectPath: projectTarget, appTitle: 'T' },
      });

      // Content lands at the project root, and nested paths keep their shape.
      expect(fs.existsSync(path.join(projectTarget, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectTarget, '.gitignore'))).toBe(true);
      expect(fs.existsSync(path.join(projectTarget, 'src', 'main.ts'))).toBe(true);

      // The template's own layout must not leak into the project.
      expect(fs.existsSync(path.join(projectTarget, 'files'))).toBe(false);
      for (const created of result.filesCreated) {
        expect(created.split(/[\\/]/)[0]).not.toBe('files');
      }
    });

    it('should replace variables in .tmpl files', async () => {
      const projectTarget = path.join(tempBase, 'scaffolded-vars');
      fs.mkdirSync(projectTarget, { recursive: true });
      const config: ScaffoldConfig = {
        templateId: 'simple-app',
        projectPath: projectTarget,
        variables: {
          projectName: 'awesome-app',
          projectPath: projectTarget,
          appTitle: 'Awesome Application',
        },
      };

      await service.scaffoldProject(config);

      // README.md should have variables replaced
      const readmePath = path.join(projectTarget, 'README.md');
      expect(fs.existsSync(readmePath)).toBe(true);
      const content = fs.readFileSync(readmePath, 'utf-8');
      expect(content).toContain('awesome-app');
      expect(content).toContain('Awesome Application');
    });

    it('should copy non-.tmpl files unchanged', async () => {
      const projectTarget = path.join(tempBase, 'scaffolded-raw');
      fs.mkdirSync(projectTarget, { recursive: true });
      const config: ScaffoldConfig = {
        templateId: 'simple-app',
        projectPath: projectTarget,
        variables: {
          projectName: 'rawapp',
          projectPath: projectTarget,
        },
      };

      await service.scaffoldProject(config);

      const gitignorePath = path.join(projectTarget, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('node_modules');
    });

    it('should return failure when template not found', async () => {
      const projectTarget = path.join(tempBase, 'scaffolded-none');
      fs.mkdirSync(projectTarget, { recursive: true });
      const config: ScaffoldConfig = {
        templateId: 'non-existent-template',
        projectPath: projectTarget,
        variables: { projectName: 'test', projectPath: projectTarget },
      };

      const result = await service.scaffoldProject(config);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should throw PathValidationError for path traversal', async () => {
      await expect(
        service.scaffoldProject({
          templateId: 'simple-app',
          projectPath: '/tmp/../etc/bad',
          variables: {},
        })
      ).rejects.toThrow(/traversal/i);
    });

    it('should throw for invalid template ID characters', async () => {
      // The invalid template ID check happens BEFORE resolveProjectPath would throw,
      // but the path validation for projectPath throws first in this implementation.
      // We use an existing directory to get past the path check, then test the ID check.
      const projectTarget = path.join(tempBase, 'output-invalid-id');
      fs.mkdirSync(projectTarget, { recursive: true });
      await expect(
        service.scaffoldProject({
          templateId: '../../bad-template',
          projectPath: projectTarget,
          variables: {},
        })
      ).rejects.toThrow(/invalid template id/i);
    });

    it('should create structure directories from template structure', async () => {
      const projectTarget = path.join(tempBase, 'scaffolded-fullstack');
      fs.mkdirSync(projectTarget, { recursive: true });
      const config: ScaffoldConfig = {
        templateId: 'fullstack-app',
        projectPath: projectTarget,
        variables: {
          projectName: 'fullstackapp',
          projectPath: projectTarget,
        },
      };

      const result = await service.scaffoldProject(config);
      expect(result.success).toBe(true);
      // fullstack-app has frontend/backend structure
      expect(fs.existsSync(path.join(projectTarget, 'frontend'))).toBe(true);
      expect(fs.existsSync(path.join(projectTarget, 'backend'))).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // invalidateCache
  // ----------------------------------------------------------------
  describe('invalidateCache', () => {
    it('should allow fresh read after invalidation', async () => {
      await service.listTemplates();
      service.invalidateCache();
      // Add a new template directory
      const newTemplateDir = path.join(templatesDir, 'new-template');
      fs.mkdirSync(newTemplateDir, { recursive: true });
      fs.writeFileSync(
        path.join(newTemplateDir, 'template.json'),
        JSON.stringify({
          name: 'New Template',
          description: 'Added after cache',
          version: '1.0.0',
          tags: ['backend'],
          technologies: [],
          variables: [],
        })
      );

      const templates = await service.listTemplates();
      const found = templates.find((t) => t.id === 'new-template');
      expect(found).toBeDefined();
    });
  });
});

// ----------------------------------------------------------------
// determineCategory (tested indirectly via listTemplates)
// ----------------------------------------------------------------
describe('TemplatesService category determination (tag-based fallback)', () => {
  let tempBase: string;
  let service: TestableTemplatesService;

  beforeEach(() => {
    tempBase = createTempDir('templates-category-test-');
    const templatesDir = path.join(tempBase, 'templates');
    fs.mkdirSync(templatesDir, { recursive: true });

    // Tag-based frontend detection
    const frontendTagDir = path.join(templatesDir, 'tag-frontend');
    fs.mkdirSync(frontendTagDir, { recursive: true });
    fs.writeFileSync(
      path.join(frontendTagDir, 'template.json'),
      JSON.stringify({
        name: 'Tag Frontend',
        description: '',
        version: '1.0.0',
        tags: ['react'],
        technologies: [],
        variables: [],
      })
    );

    // Tag-based backend detection
    const backendTagDir = path.join(templatesDir, 'tag-backend');
    fs.mkdirSync(backendTagDir, { recursive: true });
    fs.writeFileSync(
      path.join(backendTagDir, 'template.json'),
      JSON.stringify({
        name: 'Tag Backend',
        description: '',
        version: '1.0.0',
        tags: ['api'],
        technologies: [],
        variables: [],
      })
    );

    // Tag-based fullstack detection
    const fullstackTagDir = path.join(templatesDir, 'tag-fullstack');
    fs.mkdirSync(fullstackTagDir, { recursive: true });
    fs.writeFileSync(
      path.join(fullstackTagDir, 'template.json'),
      JSON.stringify({
        name: 'Tag Fullstack',
        description: '',
        version: '1.0.0',
        tags: ['fullstack'],
        technologies: [],
        variables: [],
      })
    );

    service = new TestableTemplatesService(templatesDir);
  });

  afterEach(() => {
    cleanupTempDir(tempBase);
  });

  it('should detect frontend from react tag', async () => {
    const templates = await service.listTemplates();
    const t = templates.find((x) => x.id === 'tag-frontend');
    expect(t?.category).toBe('frontend');
  });

  it('should detect backend from api tag', async () => {
    const templates = await service.listTemplates();
    const t = templates.find((x) => x.id === 'tag-backend');
    expect(t?.category).toBe('backend');
  });

  it('should detect fullstack from fullstack tag', async () => {
    const templates = await service.listTemplates();
    const t = templates.find((x) => x.id === 'tag-fullstack');
    expect(t?.category).toBe('fullstack');
  });
});
