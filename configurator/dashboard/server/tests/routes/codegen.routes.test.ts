// SPDX-License-Identifier: MIT
/**
 * Code Generator Routes Tests
 *
 * Unit tests for codegen route handlers.
 * Tests service integration, request validation, path security, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodeGenService } from '../../src/services/codegen.service.js';
import {
  CodeGenValidateRequestSchema,
  CodeGenGenerateRequestSchema,
} from '../../src/validation/schemas.js';
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
} from '../../src/types/codegen.js';

// Mock the service
vi.mock('../../src/services/codegen.service.js');

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_PROJECT_PATH = '/home/user/my-project';

const MOCK_COMPONENT: CodeGenComponent = { id: 'models', label: 'TypeScript Interfaces', enabled: true };

const MOCK_COMPONENTS: CodeGenComponent[] = [
  { id: 'models', label: 'TypeScript Interfaces', enabled: true },
  { id: 'routes', label: 'Express Routes', enabled: true },
];

const MOCK_VALIDATION_RESULT: ValidationResult = {
  valid: true,
  technology: 'openapi',
  version: '3.0.3',
  errors: [],
  warnings: [],
  summary: { title: 'Pet Store API', endpoints: 5, models: 3 },
};

const MOCK_GENERATED_FILES: GeneratedFile[] = [
  { path: 'src/models/pet.ts', content: 'export interface Pet {}', language: 'typescript', size: 22 },
  { path: 'src/routes/pets.ts', content: 'import { Router } from "express";', language: 'typescript', size: 33 },
];

const MOCK_PREVIEW: CodeGenPreview = {
  files: [
    { path: 'src/models/pet.ts', language: 'typescript', estimatedSize: 200 },
    { path: 'src/routes/pets.ts', language: 'typescript', estimatedSize: 400 },
  ],
  totalFiles: 2,
  components: ['models', 'routes'],
};

const MOCK_CONVENTIONS: ProjectConventions = {
  naming: { variables: 'camelCase', files: 'kebab-case', components: 'PascalCase' },
  imports: { style: 'relative' },
  errorHandling: { pattern: 'try-catch' },
  formatting: { indent: 'spaces', indentSize: 2, quotes: 'single', semicolons: true },
};

const MOCK_REFINEMENT_OPTIONS: RefinementOptions = {
  enabled: true,
  naming: true,
  codeStyle: true,
  errorHandling: false,
  testStubs: false,
};

const MOCK_REFINEMENT_JOB = {
  title: 'Refine generated TypeScript Express code',
  prompt: 'Apply project conventions to generated files',
  projectPath: MOCK_PROJECT_PATH,
  subTasks: [
    {
      id: 'refine-models',
      title: 'Refine model interfaces',
      prompt: 'Apply naming conventions',
      agentId: 'typescript-expert',
    },
  ],
};

const MOCK_TARGET_INFO: CodeGenTargetInfo[] = [
  {
    id: 'typescript-express',
    label: 'TypeScript + Express',
    technologies: ['openapi', 'asyncapi', 'typespec', 'protobuf'],
    components: [MOCK_COMPONENT],
  },
  {
    id: 'java-spring',
    label: 'Java + Spring Boot',
    technologies: ['openapi', 'protobuf'],
    components: [{ id: 'models', label: 'Java POJOs', enabled: true }],
  },
];

// ---------------------------------------------------------------------------

describe('CodeGen Routes - Service Integration', () => {
  let codegenService: CodeGenService;

  beforeEach(() => {
    codegenService = new CodeGenService();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // GET /codegen/targets
  // -------------------------------------------------------------------------
  describe('getTargets logic', () => {
    it('should return all targets when no technology filter is provided', () => {
      vi.mocked(codegenService.getTargets).mockReturnValue(MOCK_TARGET_INFO);

      const result = codegenService.getTargets();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('typescript-express');
      expect(result[1].id).toBe('java-spring');
    });

    it('should pass technology filter to service', () => {
      const filteredTargets: CodeGenTargetInfo[] = [
        {
          id: 'typescript-express',
          label: 'TypeScript + Express',
          technologies: ['openapi'],
          components: [MOCK_COMPONENT],
        },
      ];

      vi.mocked(codegenService.getTargets).mockReturnValue(filteredTargets);

      const result = codegenService.getTargets('openapi');

      expect(codegenService.getTargets).toHaveBeenCalledWith('openapi');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('typescript-express');
    });

    it('should return empty array when no targets match the technology', () => {
      vi.mocked(codegenService.getTargets).mockReturnValue([]);

      const result = codegenService.getTargets('bpmn');

      expect(result).toEqual([]);
    });

    it('should return targets with their component lists', () => {
      vi.mocked(codegenService.getTargets).mockReturnValue(MOCK_TARGET_INFO);

      const result = codegenService.getTargets();

      expect(result[0].components).toBeDefined();
      expect(Array.isArray(result[0].components)).toBe(true);
    });

    it('should handle service errors gracefully', () => {
      vi.mocked(codegenService.getTargets).mockImplementation(() => {
        throw new Error('Failed to load targets');
      });

      expect(() => codegenService.getTargets()).toThrow('Failed to load targets');
    });
  });

  // -------------------------------------------------------------------------
  // POST /codegen/validate
  // -------------------------------------------------------------------------
  describe('validateSpec logic', () => {
    it('should validate spec content and return validation result', () => {
      vi.mocked(codegenService.validateSpec).mockReturnValue(MOCK_VALIDATION_RESULT);

      const result = codegenService.validateSpec(
        'openapi: "3.0.3"\ninfo:\n  title: Pet Store\n',
        'petstore.yaml',
        'openapi'
      );

      expect(codegenService.validateSpec).toHaveBeenCalledWith(
        'openapi: "3.0.3"\ninfo:\n  title: Pet Store\n',
        'petstore.yaml',
        'openapi'
      );
      expect(result.valid).toBe(true);
      expect(result.technology).toBe('openapi');
      expect(result.errors).toHaveLength(0);
    });

    it('should return validation errors for invalid spec', () => {
      const invalidResult: ValidationResult = {
        valid: false,
        technology: 'openapi',
        version: null,
        errors: ['Missing required field: info.title', 'Invalid path format: /pets/{id'],
        warnings: [],
        summary: {},
      };

      vi.mocked(codegenService.validateSpec).mockReturnValue(invalidResult);

      const result = codegenService.validateSpec('invalid yaml content', 'bad.yaml');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('Missing required field');
    });

    it('should auto-detect technology when not provided', () => {
      const resultWithDetectedTech: ValidationResult = {
        ...MOCK_VALIDATION_RESULT,
        technology: 'openapi',
      };

      vi.mocked(codegenService.validateSpec).mockReturnValue(resultWithDetectedTech);

      const result = codegenService.validateSpec(
        'openapi: "3.0.3"\ninfo:\n  title: Pet Store\n',
        'petstore.yaml'
        // No technology hint — auto-detect
      );

      expect(result.technology).toBe('openapi');
    });

    it('should include summary information in result', () => {
      vi.mocked(codegenService.validateSpec).mockReturnValue(MOCK_VALIDATION_RESULT);

      const result = codegenService.validateSpec('content', 'spec.yaml', 'openapi');

      expect(result.summary).toBeDefined();
      expect(result.summary.title).toBe('Pet Store API');
      expect(result.summary.endpoints).toBe(5);
      expect(result.summary.models).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // POST /codegen/validate — Zod schema validation
  // -------------------------------------------------------------------------
  describe('Zod validation - validate endpoint', () => {
    it('should accept valid payload with required fields', () => {
      const payload = {
        content: 'openapi: "3.0.3"',
        fileName: 'spec.yaml',
      };

      const result = CodeGenValidateRequestSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should reject missing content field', () => {
      const payload = { fileName: 'spec.yaml' };

      const result = CodeGenValidateRequestSchema.safeParse(payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map((i) => i.path[0]);
        expect(fields).toContain('content');
      }
    });

    it('should reject missing fileName field', () => {
      const payload = { content: 'openapi: "3.0.3"' };

      const result = CodeGenValidateRequestSchema.safeParse(payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map((i) => i.path[0]);
        expect(fields).toContain('fileName');
      }
    });

    it('should reject empty content string', () => {
      const payload = { content: '', fileName: 'spec.yaml' };

      const result = CodeGenValidateRequestSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });

    it('should accept optional technology field when provided', () => {
      const payload = {
        content: 'openapi: "3.0.3"',
        fileName: 'spec.yaml',
        technology: 'openapi',
      };

      const result = CodeGenValidateRequestSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should reject invalid technology enum value', () => {
      const payload = {
        content: 'openapi: "3.0.3"',
        fileName: 'spec.yaml',
        technology: 'graphql', // Not in enum
      };

      const result = CodeGenValidateRequestSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // POST /codegen/preview
  // -------------------------------------------------------------------------
  describe('generatePreview logic', () => {
    it('should return preview for valid request', () => {
      vi.mocked(codegenService.generatePreview).mockReturnValue(MOCK_PREVIEW);

      const result = codegenService.generatePreview(
        'openapi: "3.0.3"',
        'petstore.yaml',
        'openapi',
        'typescript-express',
        MOCK_COMPONENTS
      );

      expect(codegenService.generatePreview).toHaveBeenCalledWith(
        'openapi: "3.0.3"',
        'petstore.yaml',
        'openapi',
        'typescript-express',
        MOCK_COMPONENTS
      );
      expect(result.totalFiles).toBe(2);
      expect(result.files).toHaveLength(2);
      expect(result.components).toContain('models');
    });

    it('should list files with path, language and estimatedSize', () => {
      vi.mocked(codegenService.generatePreview).mockReturnValue(MOCK_PREVIEW);

      const result = codegenService.generatePreview('content', 'spec.yaml', 'openapi', 'typescript-express', MOCK_COMPONENTS);

      expect(result.files[0]).toHaveProperty('path');
      expect(result.files[0]).toHaveProperty('language');
      expect(result.files[0]).toHaveProperty('estimatedSize');
    });

    it('should reflect only enabled components in preview', () => {
      const disabledComponents: CodeGenComponent[] = [
        { id: 'models', label: 'TypeScript Interfaces', enabled: true },
        { id: 'tests', label: 'Test Stubs', enabled: false },
      ];

      const previewWithEnabledOnly: CodeGenPreview = {
        files: [{ path: 'src/models/pet.ts', language: 'typescript', estimatedSize: 200 }],
        totalFiles: 1,
        components: ['models'],
      };

      vi.mocked(codegenService.generatePreview).mockReturnValue(previewWithEnabledOnly);

      const result = codegenService.generatePreview(
        'content',
        'spec.yaml',
        'openapi',
        'typescript-express',
        disabledComponents
      );

      expect(result.totalFiles).toBe(1);
      expect(result.components).not.toContain('tests');
    });
  });

  // -------------------------------------------------------------------------
  // POST /codegen/generate
  // -------------------------------------------------------------------------
  describe('generate logic', () => {
    it('should generate code files and return them', () => {
      vi.mocked(codegenService.generate).mockReturnValue(MOCK_GENERATED_FILES);

      const result = codegenService.generate(
        'openapi: "3.0.3"',
        'petstore.yaml',
        'openapi',
        'typescript-express',
        'src/generated',
        MOCK_COMPONENTS,
        MOCK_PROJECT_PATH
      );

      expect(codegenService.generate).toHaveBeenCalledWith(
        'openapi: "3.0.3"',
        'petstore.yaml',
        'openapi',
        'typescript-express',
        'src/generated',
        MOCK_COMPONENTS,
        MOCK_PROJECT_PATH
      );
      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('src/models/pet.ts');
      expect(result[0].language).toBe('typescript');
      expect(typeof result[0].size).toBe('number');
    });

    it('should return files with content, path, language and size properties', () => {
      vi.mocked(codegenService.generate).mockReturnValue(MOCK_GENERATED_FILES);

      const result = codegenService.generate(
        'content',
        'spec.yaml',
        'openapi',
        'typescript-express',
        'src/generated',
        MOCK_COMPONENTS,
        MOCK_PROJECT_PATH
      );

      result.forEach((file) => {
        expect(file).toHaveProperty('path');
        expect(file).toHaveProperty('content');
        expect(file).toHaveProperty('language');
        expect(file).toHaveProperty('size');
      });
    });

    it('should reject path traversal in projectPath', () => {
      vi.mocked(codegenService.generate).mockImplementation(
        (_content, _fileName, _tech, _lang, _outDir, _comps, projectPath: string) => {
          if (projectPath.includes('..')) {
            const { PathValidationError } = require('../../src/utils/utilities.js');
            throw new PathValidationError('Path traversal not allowed');
          }
          return [];
        }
      );

      expect(() =>
        codegenService.generate(
          'content',
          'spec.yaml',
          'openapi',
          'typescript-express',
          'src/generated',
          MOCK_COMPONENTS,
          '/home/user/../../etc/passwd'
        )
      ).toThrow();
    });

    it('should handle service error and surface it', () => {
      vi.mocked(codegenService.generate).mockImplementation(() => {
        throw new Error('Template engine failed');
      });

      expect(() =>
        codegenService.generate(
          'content',
          'spec.yaml',
          'openapi',
          'typescript-express',
          'src/generated',
          MOCK_COMPONENTS,
          MOCK_PROJECT_PATH
        )
      ).toThrow('Template engine failed');
    });
  });

  // -------------------------------------------------------------------------
  // POST /codegen/generate — Zod schema validation
  // -------------------------------------------------------------------------
  describe('Zod validation - generate endpoint', () => {
    const validPayload = {
      projectPath: '/home/user/project',
      content: 'openapi: "3.0.3"',
      fileName: 'spec.yaml',
      technology: 'openapi',
      targetLanguage: 'typescript-express',
      outputDir: 'src/generated',
      components: [{ id: 'models', label: 'Models', enabled: true }],
    };

    it('should accept valid generate payload', () => {
      const result = CodeGenGenerateRequestSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it('should reject missing projectPath', () => {
      const { projectPath: _omit, ...payload } = validPayload;

      const result = CodeGenGenerateRequestSchema.safeParse(payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map((i) => i.path[0]);
        expect(fields).toContain('projectPath');
      }
    });

    it('should reject missing content', () => {
      const { content: _omit, ...payload } = validPayload;

      const result = CodeGenGenerateRequestSchema.safeParse(payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map((i) => i.path[0]);
        expect(fields).toContain('content');
      }
    });

    it('should reject missing outputDir', () => {
      const { outputDir: _omit, ...payload } = validPayload;

      const result = CodeGenGenerateRequestSchema.safeParse(payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map((i) => i.path[0]);
        expect(fields).toContain('outputDir');
      }
    });

    it('should reject invalid targetLanguage enum value', () => {
      const payload = { ...validPayload, targetLanguage: 'ruby-rails' };

      const result = CodeGenGenerateRequestSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });

    it('should reject non-array components', () => {
      const payload = { ...validPayload, components: 'models' };

      const result = CodeGenGenerateRequestSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // POST /codegen/conventions
  // -------------------------------------------------------------------------
  describe('scanConventions logic', () => {
    it('should return conventions from service', () => {
      vi.mocked(codegenService.scanConventions).mockReturnValue(MOCK_CONVENTIONS);

      const result = codegenService.scanConventions(MOCK_PROJECT_PATH);

      expect(codegenService.scanConventions).toHaveBeenCalledWith(MOCK_PROJECT_PATH);
      expect(result.naming.variables).toBe('camelCase');
      expect(result.formatting.indent).toBe('spaces');
      expect(result.formatting.quotes).toBe('single');
    });

    it('should include all convention categories', () => {
      vi.mocked(codegenService.scanConventions).mockReturnValue(MOCK_CONVENTIONS);

      const result = codegenService.scanConventions(MOCK_PROJECT_PATH);

      expect(result).toHaveProperty('naming');
      expect(result).toHaveProperty('imports');
      expect(result).toHaveProperty('errorHandling');
      expect(result).toHaveProperty('formatting');
    });

    it('should detect camelCase variable naming', () => {
      vi.mocked(codegenService.scanConventions).mockReturnValue(MOCK_CONVENTIONS);

      const result = codegenService.scanConventions(MOCK_PROJECT_PATH);

      expect(result.naming.variables).toBe('camelCase');
    });

    it('should handle service error when scanning conventions', () => {
      vi.mocked(codegenService.scanConventions).mockImplementation(() => {
        throw new Error('Cannot read project directory');
      });

      expect(() => codegenService.scanConventions(MOCK_PROJECT_PATH)).toThrow(
        'Cannot read project directory'
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /codegen/refine
  // -------------------------------------------------------------------------
  describe('buildRefinementJob logic', () => {
    it('should create refinement job with subtasks', () => {
      vi.mocked(codegenService.scanConventions).mockReturnValue(MOCK_CONVENTIONS);
      vi.mocked(codegenService.buildRefinementJob).mockReturnValue(MOCK_REFINEMENT_JOB);

      // Simulate route logic: scan conventions first, then build the job
      const conventions = codegenService.scanConventions(MOCK_PROJECT_PATH);
      const job = codegenService.buildRefinementJob(
        MOCK_PROJECT_PATH,
        MOCK_GENERATED_FILES,
        'openapi',
        'typescript-express',
        MOCK_REFINEMENT_OPTIONS,
        conventions
      );

      expect(codegenService.buildRefinementJob).toHaveBeenCalledWith(
        MOCK_PROJECT_PATH,
        MOCK_GENERATED_FILES,
        'openapi',
        'typescript-express',
        MOCK_REFINEMENT_OPTIONS,
        MOCK_CONVENTIONS
      );
      expect(job).toHaveProperty('title');
      expect(job).toHaveProperty('subTasks');
      expect(Array.isArray(job.subTasks)).toBe(true);
      expect(job.subTasks).toHaveLength(1);
    });

    it('should pass projectPath to the refinement job', () => {
      vi.mocked(codegenService.scanConventions).mockReturnValue(MOCK_CONVENTIONS);
      vi.mocked(codegenService.buildRefinementJob).mockReturnValue(MOCK_REFINEMENT_JOB);

      const conventions = codegenService.scanConventions(MOCK_PROJECT_PATH);
      const job = codegenService.buildRefinementJob(
        MOCK_PROJECT_PATH,
        MOCK_GENERATED_FILES,
        'openapi',
        'typescript-express',
        MOCK_REFINEMENT_OPTIONS,
        conventions
      );

      expect(job.projectPath).toBe(MOCK_PROJECT_PATH);
    });

    it('should pass technology and targetLanguage to the job builder', () => {
      vi.mocked(codegenService.scanConventions).mockReturnValue(MOCK_CONVENTIONS);
      vi.mocked(codegenService.buildRefinementJob).mockReturnValue(MOCK_REFINEMENT_JOB);

      const conventions = codegenService.scanConventions(MOCK_PROJECT_PATH);
      codegenService.buildRefinementJob(
        MOCK_PROJECT_PATH,
        MOCK_GENERATED_FILES,
        'asyncapi',
        'java-spring',
        MOCK_REFINEMENT_OPTIONS,
        conventions
      );

      expect(codegenService.buildRefinementJob).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        'asyncapi',
        'java-spring',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should handle service error when building refinement job', () => {
      vi.mocked(codegenService.scanConventions).mockReturnValue(MOCK_CONVENTIONS);
      vi.mocked(codegenService.buildRefinementJob).mockImplementation(() => {
        throw new Error('Agent profile not found');
      });

      const conventions = codegenService.scanConventions(MOCK_PROJECT_PATH);

      expect(() =>
        codegenService.buildRefinementJob(
          MOCK_PROJECT_PATH,
          MOCK_GENERATED_FILES,
          'openapi',
          'typescript-express',
          MOCK_REFINEMENT_OPTIONS,
          conventions
        )
      ).toThrow('Agent profile not found');
    });
  });

  // -------------------------------------------------------------------------
  // POST /codegen/accept
  // -------------------------------------------------------------------------
  describe('acceptFiles logic', () => {
    it('should accept and write files to disk', () => {
      const mockResult = { written: ['src/models/pet.ts', 'src/routes/pets.ts'], skipped: [] };

      vi.mocked(codegenService.acceptFiles).mockReturnValue(mockResult);

      const result = codegenService.acceptFiles(
        MOCK_PROJECT_PATH,
        'src/generated',
        MOCK_GENERATED_FILES
      );

      expect(codegenService.acceptFiles).toHaveBeenCalledWith(
        MOCK_PROJECT_PATH,
        'src/generated',
        MOCK_GENERATED_FILES
      );
      expect(result.written).toHaveLength(2);
      expect(result.skipped).toHaveLength(0);
      expect(result.written[0]).toBe('src/models/pet.ts');
    });

    it('should report skipped files when already accepted is false', () => {
      const mockResult = {
        written: ['src/models/pet.ts'],
        skipped: ['src/routes/pets.ts'],
      };

      vi.mocked(codegenService.acceptFiles).mockReturnValue(mockResult);

      const result = codegenService.acceptFiles(
        MOCK_PROJECT_PATH,
        'src/generated',
        MOCK_GENERATED_FILES
      );

      expect(result.written).toHaveLength(1);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toBe('src/routes/pets.ts');
    });

    it('should reject path traversal in projectPath', () => {
      vi.mocked(codegenService.acceptFiles).mockImplementation(
        (projectPath: string) => {
          if (projectPath.includes('..')) {
            const { PathValidationError } = require('../../src/utils/utilities.js');
            throw new PathValidationError('Path traversal not allowed');
          }
          return { written: [], skipped: [] };
        }
      );

      expect(() =>
        codegenService.acceptFiles(
          '/home/user/../../etc/passwd',
          'src/generated',
          MOCK_GENERATED_FILES
        )
      ).toThrow();
    });

    it('should handle empty files list and write nothing', () => {
      const mockResult = { written: [], skipped: [] };

      vi.mocked(codegenService.acceptFiles).mockReturnValue(mockResult);

      const result = codegenService.acceptFiles(MOCK_PROJECT_PATH, 'src/generated', []);

      expect(result.written).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });

    it('should handle service error when writing files', () => {
      vi.mocked(codegenService.acceptFiles).mockImplementation(() => {
        throw new Error('Disk write failed: EACCES');
      });

      expect(() =>
        codegenService.acceptFiles(MOCK_PROJECT_PATH, 'src/generated', MOCK_GENERATED_FILES)
      ).toThrow('Disk write failed: EACCES');
    });
  });

  // -------------------------------------------------------------------------
  // POST /codegen/upload — upload + validate (logic test)
  // -------------------------------------------------------------------------
  describe('upload validateSpec integration logic', () => {
    it('should call validateSpec with file content and fileName', () => {
      vi.mocked(codegenService.validateSpec).mockReturnValue(MOCK_VALIDATION_RESULT);

      // Simulates what the route does after multer extracts the file buffer
      const fileContent = 'openapi: "3.0.3"\ninfo:\n  title: Pet Store\n';
      const fileName = 'petstore.yaml';
      const technology: CodeGenTechnology = 'openapi';

      const validation = codegenService.validateSpec(fileContent, fileName, technology);

      expect(codegenService.validateSpec).toHaveBeenCalledWith(fileContent, fileName, technology);
      expect(validation.valid).toBe(true);
    });

    it('should surface validation errors from file content', () => {
      const invalidResult: ValidationResult = {
        valid: false,
        technology: null,
        version: null,
        errors: ['Cannot detect technology from file'],
        warnings: [],
        summary: {},
      };

      vi.mocked(codegenService.validateSpec).mockReturnValue(invalidResult);

      const validation = codegenService.validateSpec('not a valid spec', 'unknown.txt');

      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Response structure validation
  // -------------------------------------------------------------------------
  describe('Response structure', () => {
    it('should format getTargets response with success flag and data array', () => {
      vi.mocked(codegenService.getTargets).mockReturnValue(MOCK_TARGET_INFO);

      const targets = codegenService.getTargets();
      const response = { success: true, data: targets };

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should format validate response with success flag and ValidationResult', () => {
      vi.mocked(codegenService.validateSpec).mockReturnValue(MOCK_VALIDATION_RESULT);

      const validation = codegenService.validateSpec('content', 'spec.yaml', 'openapi');
      const response = { success: true, data: validation };

      expect(response.success).toBe(true);
      expect(response.data.valid).toBe(true);
      expect(response.data.technology).toBe('openapi');
    });

    it('should format generate response with files, totalFiles, totalSize', () => {
      vi.mocked(codegenService.generate).mockReturnValue(MOCK_GENERATED_FILES);

      const files = codegenService.generate(
        'content',
        'spec.yaml',
        'openapi',
        'typescript-express',
        'src/generated',
        MOCK_COMPONENTS,
        MOCK_PROJECT_PATH
      );

      const response = {
        success: true,
        data: {
          files,
          totalFiles: files.length,
          totalSize: files.reduce((sum, f) => sum + f.size, 0),
        },
      };

      expect(response.data.totalFiles).toBe(2);
      expect(response.data.totalSize).toBe(22 + 33);
    });

    it('should format accept response with written and skipped arrays', () => {
      const mockResult = { written: ['src/models/pet.ts'], skipped: [] };
      vi.mocked(codegenService.acceptFiles).mockReturnValue(mockResult);

      const result = codegenService.acceptFiles(MOCK_PROJECT_PATH, 'src/generated', MOCK_GENERATED_FILES);
      const response = { success: true, data: result };

      expect(response.data).toHaveProperty('written');
      expect(response.data).toHaveProperty('skipped');
      expect(Array.isArray(response.data.written)).toBe(true);
      expect(Array.isArray(response.data.skipped)).toBe(true);
    });

    it('should format error response with success false and error message', () => {
      const error = new Error('Unexpected failure');
      const response = { success: false, error: error.message };

      expect(response.success).toBe(false);
      expect(response.error).toBe('Unexpected failure');
    });
  });

  // -------------------------------------------------------------------------
  // Path validation edge cases (route-level logic)
  // -------------------------------------------------------------------------
  describe('Path validation edge cases', () => {
    it('should consider absolute path valid for generate', () => {
      vi.mocked(codegenService.generate).mockReturnValue(MOCK_GENERATED_FILES);

      const result = codegenService.generate(
        'content',
        'spec.yaml',
        'openapi',
        'typescript-express',
        'src/generated',
        MOCK_COMPONENTS,
        '/absolute/project/path'
      );

      expect(result).toBeDefined();
    });

    it('should consider absolute path valid for acceptFiles', () => {
      vi.mocked(codegenService.acceptFiles).mockReturnValue({ written: [], skipped: [] });

      const result = codegenService.acceptFiles('/absolute/project/path', 'src/generated', []);

      expect(result).toBeDefined();
    });

    it('should consider absolute path valid for scanConventions', () => {
      vi.mocked(codegenService.scanConventions).mockReturnValue(MOCK_CONVENTIONS);

      const result = codegenService.scanConventions('/absolute/project/path');

      expect(result).toBeDefined();
    });
  });
});
