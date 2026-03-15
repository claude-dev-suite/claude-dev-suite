// SPDX-License-Identifier: MIT
/**
 * CodeGenService Tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CodeGenService } from '../src/services/codegen.service.js';
import { PathValidationError } from '../src/utils/utilities.js';
import { createTempDir, cleanupTempDir, createMockProject } from './test-utils.js';
import type { CodeGenComponent, GeneratedFile, RefinementOptions, ProjectConventions } from '../src/types/codegen.js';

// ============================================================================
// SAMPLE SPEC DATA
// ============================================================================

const OPENAPI_JSON = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Pet Store', version: '1.0.0' },
  paths: {
    '/pets': {
      get: { operationId: 'listPets' },
      post: { operationId: 'createPet', requestBody: { content: {} } },
    },
    '/pets/{id}': {
      get: { operationId: 'getPet' },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          tag: { type: 'string' },
        },
      },
    },
  },
});

const OPENAPI_YAML = `openapi: '3.0.0'
info:
  title: Pet Store
  version: 1.0.0
paths:
  /pets:
    get:
      operationId: listPets
`;

const ASYNCAPI_JSON = JSON.stringify({
  asyncapi: '2.6.0',
  info: { title: 'User Events', version: '1.0.0' },
  channels: {
    'user/created': { subscribe: { operationId: 'onUserCreated' } },
    'user/updated': { publish: { operationId: 'publishUserUpdated' } },
  },
});

const ASYNCAPI_YAML = `asyncapi: '2.6.0'
info:
  title: User Events
  version: 1.0.0
channels:
  user/created:
    subscribe:
      operationId: onUserCreated
`;

const TYPESPEC_CONTENT = `import "@typespec/http";
namespace PetStore;
model Pet { id: string; name: string; }
@route("/pets") @get op listPets(): Pet[];
`;

const PROTOBUF_CONTENT = `syntax = "proto3";
message Pet { string id = 1; string name = 2; }
service PetService { rpc GetPet(Pet) returns (Pet); }
`;

const BPMN_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1" name="Review"/>
    <bpmn:serviceTask id="Task_2" name="Process"/>
  </bpmn:process>
</bpmn:definitions>
`;

// ============================================================================
// HELPERS
// ============================================================================

function allEnabled(ids: string[]): CodeGenComponent[] {
  return ids.map(id => ({ id, label: id, enabled: true }));
}

function someEnabled(ids: string[], enabledIds: string[]): CodeGenComponent[] {
  return ids.map(id => ({ id, label: id, enabled: enabledIds.includes(id) }));
}

const DEFAULT_CONVENTIONS: ProjectConventions = {
  naming: { variables: 'camelCase', files: 'kebab-case', components: 'PascalCase' },
  imports: { style: 'relative' },
  errorHandling: { pattern: 'try-catch' },
  formatting: { indent: 'spaces', indentSize: 2, quotes: 'single', semicolons: true },
};

const DEFAULT_REFINEMENT_OPTIONS: RefinementOptions = {
  enabled: true,
  naming: true,
  codeStyle: true,
  errorHandling: false,
  testStubs: false,
};

// ============================================================================
// TESTS
// ============================================================================

describe('CodeGenService', () => {
  let service: CodeGenService;
  let tempDir: string;

  beforeEach(() => {
    service = new CodeGenService();
    tempDir = createTempDir('codegen-test-');
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  // --------------------------------------------------------------------------
  // getTargets
  // --------------------------------------------------------------------------

  describe('getTargets', () => {
    it('should return all targets when no technology specified', () => {
      const targets = service.getTargets();
      expect(targets.length).toBeGreaterThanOrEqual(9);
      const ids = targets.map(t => t.id);
      expect(ids).toContain('typescript-express');
      expect(ids).toContain('typescript-fastify');
      expect(ids).toContain('typescript-nestjs');
      expect(ids).toContain('typescript-koa');
      expect(ids).toContain('java-spring');
      expect(ids).toContain('python-fastapi');
      expect(ids).toContain('python-flask');
      expect(ids).toContain('go-gin');
      expect(ids).toContain('go-echo');
    });

    it('should filter targets by openapi technology', () => {
      const targets = service.getTargets('openapi');
      expect(targets.length).toBeGreaterThan(0);
      for (const t of targets) {
        expect(t.technologies).toContain('openapi');
      }
    });

    it('should return empty array for bpmn — no target explicitly lists bpmn support', () => {
      // BPMN is handled as a special case inside assembleTypeScriptFiles but is
      // not listed in any target's technologies[] array, so getTargets('bpmn') = []
      const targets = service.getTargets('bpmn');
      expect(Array.isArray(targets)).toBe(true);
      expect(targets.length).toBe(0);
    });

    it('should return empty array for unsupported technology filter', () => {
      // Cast to force an unsupported value
      const targets = service.getTargets('unsupported' as Parameters<typeof service.getTargets>[0]);
      expect(targets).toEqual([]);
    });

    it('should return targets with components arrays', () => {
      const targets = service.getTargets();
      for (const t of targets) {
        expect(Array.isArray(t.components)).toBe(true);
        expect(t.components.length).toBeGreaterThan(0);
        for (const c of t.components) {
          expect(c).toHaveProperty('id');
          expect(c).toHaveProperty('label');
          expect(c).toHaveProperty('enabled');
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // detectTechnology
  // --------------------------------------------------------------------------

  describe('detectTechnology', () => {
    it('should detect OpenAPI from JSON content', () => {
      expect(service.detectTechnology(OPENAPI_JSON, 'api.json')).toBe('openapi');
    });

    it('should detect OpenAPI from YAML content', () => {
      expect(service.detectTechnology(OPENAPI_YAML, 'api.yaml')).toBe('openapi');
    });

    it('should detect AsyncAPI from JSON content', () => {
      expect(service.detectTechnology(ASYNCAPI_JSON, 'events.json')).toBe('asyncapi');
    });

    it('should detect AsyncAPI from YAML content', () => {
      expect(service.detectTechnology(ASYNCAPI_YAML, 'events.yaml')).toBe('asyncapi');
    });

    it('should detect TypeSpec from .tsp extension', () => {
      expect(service.detectTechnology('anything', 'spec.tsp')).toBe('typespec');
    });

    it('should detect Protobuf from .proto extension', () => {
      expect(service.detectTechnology('anything', 'api.proto')).toBe('protobuf');
    });

    it('should detect Protobuf from content', () => {
      expect(service.detectTechnology(PROTOBUF_CONTENT, 'api.txt')).toBe('protobuf');
    });

    it('should detect BPMN from .bpmn extension', () => {
      expect(service.detectTechnology('anything', 'workflow.bpmn')).toBe('bpmn');
    });

    it('should detect BPMN from XML content with xmlns:bpmn', () => {
      expect(service.detectTechnology(BPMN_CONTENT, 'workflow.xml')).toBe('bpmn');
    });

    it('should detect TypeSpec from content (namespace + decorators)', () => {
      expect(service.detectTechnology(TYPESPEC_CONTENT, 'spec.txt')).toBe('typespec');
    });

    it('should return null for unrecognized content', () => {
      const unrecognized = '{ "foo": "bar", "baz": 123 }';
      expect(service.detectTechnology(unrecognized, 'unknown.json')).toBeNull();
    });

    it('should return null for empty-like content with no hints', () => {
      expect(service.detectTechnology('hello world', 'readme.txt')).toBeNull();
    });

    it('should detect swagger 2.x from content', () => {
      const swagger2 = JSON.stringify({ swagger: '2.0', info: { title: 'Test', version: '1' }, paths: {} });
      expect(service.detectTechnology(swagger2, 'api.json')).toBe('openapi');
    });
  });

  // --------------------------------------------------------------------------
  // validateSpec
  // --------------------------------------------------------------------------

  describe('validateSpec', () => {
    describe('OpenAPI', () => {
      it('should validate a valid OpenAPI JSON spec', () => {
        const result = service.validateSpec(OPENAPI_JSON, 'api.json');
        expect(result.valid).toBe(true);
        expect(result.technology).toBe('openapi');
        expect(result.errors).toHaveLength(0);
        expect(result.version).toBe('3.0.0');
      });

      it('should validate a valid OpenAPI YAML spec', () => {
        const result = service.validateSpec(OPENAPI_YAML, 'api.yaml');
        expect(result.valid).toBe(true);
        expect(result.technology).toBe('openapi');
        expect(result.errors).toHaveLength(0);
      });

      it('should reject OpenAPI without version field', () => {
        const noVersion = JSON.stringify({ info: { title: 'Test' }, paths: {} });
        const result = service.validateSpec(noVersion, 'api.json', 'openapi');
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/openapi|swagger/i);
      });

      it('should include summary with endpoint and model counts', () => {
        const result = service.validateSpec(OPENAPI_JSON, 'api.json');
        expect(result.summary.endpoints).toBe(2); // /pets and /pets/{id}
        expect(result.summary.models).toBe(1);    // Pet schema
        expect(result.summary.title).toBe('Pet Store');
      });

      it('should warn when spec has no paths', () => {
        const noPathsSpec = JSON.stringify({
          openapi: '3.0.0',
          info: { title: 'Empty', version: '1.0.0' },
        });
        const result = service.validateSpec(noPathsSpec, 'api.json');
        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => /paths|endpoints/i.test(w))).toBe(true);
      });
    });

    describe('AsyncAPI', () => {
      it('should validate a valid AsyncAPI JSON spec', () => {
        const result = service.validateSpec(ASYNCAPI_JSON, 'events.json');
        expect(result.valid).toBe(true);
        expect(result.technology).toBe('asyncapi');
        expect(result.errors).toHaveLength(0);
        expect(result.version).toBe('2.6.0');
      });

      it('should reject AsyncAPI without version field', () => {
        const noVersion = JSON.stringify({ info: { title: 'Test' }, channels: {} });
        const result = service.validateSpec(noVersion, 'events.json', 'asyncapi');
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/asyncapi/i);
      });

      it('should include channel count in summary', () => {
        const result = service.validateSpec(ASYNCAPI_JSON, 'events.json');
        expect(result.summary.channels).toBe(2);
        expect(result.summary.title).toBe('User Events');
      });
    });

    describe('TypeSpec', () => {
      it('should validate valid TypeSpec content', () => {
        const result = service.validateSpec(TYPESPEC_CONTENT, 'spec.tsp');
        expect(result.valid).toBe(true);
        expect(result.technology).toBe('typespec');
        expect(result.errors).toHaveLength(0);
      });

      it('should warn when TypeSpec has no namespace', () => {
        const noNs = 'model Pet { id: string; }';
        const result = service.validateSpec(noNs, 'spec.tsp', 'typespec');
        expect(result.warnings.some(w => /namespace/i.test(w))).toBe(true);
      });

      it('should reject TypeSpec without namespace or model or ops', () => {
        const empty = 'import "@typespec/http";';
        const result = service.validateSpec(empty, 'spec.tsp', 'typespec');
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('Protobuf', () => {
      it('should validate valid Protobuf content', () => {
        const result = service.validateSpec(PROTOBUF_CONTENT, 'api.proto');
        expect(result.valid).toBe(true);
        expect(result.technology).toBe('protobuf');
        expect(result.errors).toHaveLength(0);
      });

      it('should reject Protobuf without syntax declaration', () => {
        const noSyntax = 'message Pet { string id = 1; }';
        const result = service.validateSpec(noSyntax, 'api.proto', 'protobuf');
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatch(/syntax/i);
      });

      it('should include message and service counts in summary', () => {
        const result = service.validateSpec(PROTOBUF_CONTENT, 'api.proto');
        expect(result.summary.messages).toBeGreaterThanOrEqual(1);
        expect(result.summary.services).toBeGreaterThanOrEqual(1);
      });
    });

    describe('BPMN', () => {
      it('should validate valid BPMN content', () => {
        const result = service.validateSpec(BPMN_CONTENT, 'workflow.bpmn');
        expect(result.valid).toBe(true);
        expect(result.technology).toBe('bpmn');
        expect(result.errors).toHaveLength(0);
      });

      it('should reject invalid BPMN content', () => {
        const invalid = '<process id="p1"></process>';
        const result = service.validateSpec(invalid, 'workflow.bpmn', 'bpmn');
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatch(/bpmn/i);
      });

      it('should include process count in summary', () => {
        const result = service.validateSpec(BPMN_CONTENT, 'workflow.bpmn');
        expect(result.summary.services).toBeGreaterThanOrEqual(1);
      });
    });

    describe('auto-detection', () => {
      it('should auto-detect technology when not hinted', () => {
        const result = service.validateSpec(ASYNCAPI_JSON, 'events.json');
        expect(result.technology).toBe('asyncapi');
      });

      it('should use provided hint over auto-detection', () => {
        // Force it to validate as openapi even though content is asyncapi
        const result = service.validateSpec(ASYNCAPI_JSON, 'events.json', 'openapi');
        expect(result.technology).toBe('openapi');
        expect(result.valid).toBe(false); // asyncapi content fails openapi validation
      });

      it('should return error for unrecognized format', () => {
        const junk = '{ "completely": "unrelated" }';
        const result = service.validateSpec(junk, 'unknown.json');
        expect(result.valid).toBe(false);
        expect(result.technology).toBeNull();
        expect(result.errors[0]).toMatch(/detect|format/i);
      });
    });
  });

  // --------------------------------------------------------------------------
  // generatePreview
  // --------------------------------------------------------------------------

  describe('generatePreview', () => {
    it('should return preview files for OpenAPI with models and routes enabled', () => {
      const components = allEnabled(['models', 'routes', 'validators', 'services']);
      const preview = service.generatePreview(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', components);

      expect(preview.totalFiles).toBe(components.length);
      expect(preview.files.length).toBe(components.length);
      expect(preview.components).toContain('models');
      expect(preview.components).toContain('routes');

      for (const f of preview.files) {
        expect(f.path).toBeTruthy();
        expect(f.language).toBeTruthy();
        expect(f.estimatedSize).toBeGreaterThan(0);
      }
    });

    it('should only include enabled components', () => {
      const components = someEnabled(['models', 'routes', 'validators', 'services'], ['models']);
      const preview = service.generatePreview(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', components);

      expect(preview.totalFiles).toBe(1);
      expect(preview.components).toEqual(['models']);
    });

    it('should return empty for no enabled components', () => {
      const components: CodeGenComponent[] = [
        { id: 'models', label: 'TypeScript Interfaces', enabled: false },
        { id: 'routes', label: 'Express Routes', enabled: false },
      ];
      const preview = service.generatePreview(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', components);

      expect(preview.totalFiles).toBe(0);
      expect(preview.files).toHaveLength(0);
      expect(preview.components).toHaveLength(0);
    });

    it('should produce paths under the generated output directory', () => {
      const components = allEnabled(['models', 'routes']);
      const preview = service.generatePreview(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', components);

      for (const f of preview.files) {
        expect(f.path).toMatch(/generated/);
      }
    });
  });

  // --------------------------------------------------------------------------
  // generate
  // --------------------------------------------------------------------------

  describe('generate', () => {
    it('should generate TypeScript Express code from OpenAPI JSON spec', () => {
      createMockProject(tempDir);
      const components = allEnabled(['models', 'routes', 'validators', 'services']);
      const files = service.generate(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', 'src/generated', components, tempDir);

      expect(files.length).toBe(4);
      for (const f of files) {
        expect(f.content.length).toBeGreaterThan(0);
        expect(f.language).toBe('typescript');
        expect(f.size).toBeGreaterThan(0);
      }
    });

    it('should generate model interfaces from OpenAPI schemas', () => {
      createMockProject(tempDir);
      const components = allEnabled(['models']);
      const files = service.generate(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', 'src/generated', components, tempDir);

      const modelsFile = files.find(f => f.path.endsWith('models.ts'));
      expect(modelsFile).toBeDefined();
      expect(modelsFile!.content).toContain('export interface Pet');
      expect(modelsFile!.content).toContain('id:');
      expect(modelsFile!.content).toContain('name:');
    });

    it('should generate route handlers with operationIds', () => {
      createMockProject(tempDir);
      const components = allEnabled(['routes']);
      const files = service.generate(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', 'src/generated', components, tempDir);

      const routesFile = files.find(f => f.path.endsWith('routes.ts'));
      expect(routesFile).toBeDefined();
      expect(routesFile!.content).toContain('listPets');
      expect(routesFile!.content).toContain('createPet');
      expect(routesFile!.content).toContain('getPet');
    });

    it('should generate Zod validators', () => {
      createMockProject(tempDir);
      const components = allEnabled(['validators']);
      const files = service.generate(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', 'src/generated', components, tempDir);

      const validatorsFile = files.find(f => f.path.endsWith('validators.ts'));
      expect(validatorsFile).toBeDefined();
      expect(validatorsFile!.content).toContain("from 'zod'");
      expect(validatorsFile!.content).toContain('PetSchema');
    });

    it('should generate code from YAML OpenAPI spec', () => {
      createMockProject(tempDir);
      const components = allEnabled(['models', 'routes']);
      const files = service.generate(OPENAPI_YAML, 'api.yaml', 'openapi', 'typescript-express', 'src/generated', components, tempDir);

      // YAML is parsed via regex fallback (no YAML parser dependency). The fallback
      // extracts paths only when they appear at column 0 of a line (not indented).
      // This minimal YAML has /pets indented under paths:, so no endpoints are parsed.
      // The service still returns valid TypeScript files (models + routes boilerplate).
      expect(files.length).toBeGreaterThan(0);
      const routesFile = files.find(f => f.path.endsWith('routes.ts'));
      expect(routesFile).toBeDefined();
      expect(routesFile!.content).toContain('Router');
      expect(routesFile!.content).toContain('export default router');
    });

    it('should generate TypeScript code from AsyncAPI spec', () => {
      createMockProject(tempDir);
      const components = allEnabled(['models', 'routes']);
      const files = service.generate(ASYNCAPI_JSON, 'events.json', 'asyncapi', 'typescript-express', 'src/generated', components, tempDir);

      expect(files.length).toBeGreaterThan(0);
    });

    it('should generate TypeScript code from Protobuf spec', () => {
      createMockProject(tempDir);
      const components = allEnabled(['models']);
      const files = service.generate(PROTOBUF_CONTENT, 'api.proto', 'protobuf', 'typescript-express', 'src/generated', components, tempDir);

      const modelsFile = files.find(f => f.path.endsWith('models.ts'));
      expect(modelsFile).toBeDefined();
      expect(modelsFile!.content).toContain('export interface Pet');
    });

    it('should generate BPMN workflow engine from BPMN spec', () => {
      createMockProject(tempDir);
      const components = allEnabled(['models']);
      const files = service.generate(BPMN_CONTENT, 'workflow.bpmn', 'bpmn', 'typescript-express', 'src/generated', components, tempDir);

      const modelsFile = files.find(f => f.path.endsWith('models.ts'));
      expect(modelsFile).toBeDefined();
      // BPMN generates workflow engine classes
      expect(modelsFile!.content).toContain('Engine');
    });

    it('should use provided outputDir in generated file paths', () => {
      createMockProject(tempDir);
      const components = allEnabled(['models']);
      const outputDir = 'custom/output/dir';
      const files = service.generate(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', outputDir, components, tempDir);

      for (const f of files) {
        expect(f.path).toContain(outputDir);
      }
    });

    it('should NOT write files to disk (generate returns in-memory files)', () => {
      createMockProject(tempDir);
      const components = allEnabled(['models', 'routes']);
      const outputDir = path.join(tempDir, 'generated');
      service.generate(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', outputDir, components, tempDir);

      // generate() should NOT write files — acceptFiles() does
      expect(fs.existsSync(outputDir)).toBe(false);
    });

    it('should throw PathValidationError on path traversal in outputDir', () => {
      createMockProject(tempDir);
      const components = allEnabled(['models']);
      expect(() =>
        service.generate(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', '../escape', components, tempDir)
      ).toThrow(PathValidationError);
    });

    it('should throw PathValidationError on path traversal in projectPath', () => {
      expect(() =>
        service.generate(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', 'generated', allEnabled(['models']), '../../../etc')
      ).toThrow(PathValidationError);
    });

    it('should throw PathValidationError for non-absolute projectPath', () => {
      expect(() =>
        service.generate(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', 'generated', allEnabled(['models']), 'relative/path')
      ).toThrow(PathValidationError);
    });
  });

  // --------------------------------------------------------------------------
  // scanConventions
  // --------------------------------------------------------------------------

  describe('scanConventions', () => {
    it('should detect prettier config — single quotes, no semis', () => {
      createMockProject(tempDir, {
        files: {
          '.prettierrc.json': JSON.stringify({ singleQuote: true, semi: false, tabWidth: 4 }),
        },
      });
      const conventions = service.scanConventions(tempDir);
      expect(conventions.formatting.quotes).toBe('single');
      expect(conventions.formatting.semicolons).toBe(false);
      expect(conventions.formatting.indentSize).toBe(4);
      expect(conventions.formatting.indent).toBe('spaces');
    });

    it('should detect prettier config — double quotes, tabs', () => {
      createMockProject(tempDir, {
        files: {
          '.prettierrc': JSON.stringify({ singleQuote: false, useTabs: true }),
        },
      });
      const conventions = service.scanConventions(tempDir);
      expect(conventions.formatting.quotes).toBe('double');
      expect(conventions.formatting.indent).toBe('tabs');
    });

    it('should detect tsconfig path aliases starting with @/', () => {
      createMockProject(tempDir, {
        files: {
          'tsconfig.json': JSON.stringify({
            compilerOptions: {
              paths: { '@/*': ['./src/*'] },
            },
          }),
        },
      });
      const conventions = service.scanConventions(tempDir);
      expect(conventions.imports.style).toBe('alias');
      expect(conventions.imports.aliasPrefix).toBe('@/');
    });

    it('should detect tsconfig path aliases starting with ~/', () => {
      createMockProject(tempDir, {
        files: {
          'tsconfig.json': JSON.stringify({
            compilerOptions: {
              paths: { '~/*': ['./src/*'] },
            },
          }),
        },
      });
      const conventions = service.scanConventions(tempDir);
      expect(conventions.imports.style).toBe('alias');
      expect(conventions.imports.aliasPrefix).toBe('~/');
    });

    it('should detect camelCase naming when ESLint config is present', () => {
      createMockProject(tempDir, {
        files: { '.eslintrc.json': JSON.stringify({ rules: {} }) },
      });
      const conventions = service.scanConventions(tempDir);
      expect(conventions.naming.variables).toBe('camelCase');
      expect(conventions.naming.components).toBe('PascalCase');
    });

    it('should detect result-type error handling when neverthrow is a dep', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test-project',
          dependencies: { neverthrow: '^6.0.0' },
        },
      });
      const conventions = service.scanConventions(tempDir);
      expect(conventions.errorHandling.pattern).toBe('result-type');
    });

    it('should detect try-catch error handling for regular projects', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test-project',
          dependencies: { express: '^4.0.0' },
        },
      });
      const conventions = service.scanConventions(tempDir);
      expect(conventions.errorHandling.pattern).toBe('try-catch');
    });

    it('should detect kebab-case file naming from src/ directory', () => {
      createMockProject(tempDir, {
        files: {
          'src/my-service.ts': '// service',
          'src/user-controller.ts': '// controller',
          'src/auth-middleware.ts': '// middleware',
        },
      });
      const conventions = service.scanConventions(tempDir);
      expect(conventions.naming.files).toBe('kebab-case');
    });

    it('should detect PascalCase file naming from src/ directory', () => {
      createMockProject(tempDir, {
        files: {
          'src/MyService.ts': '// service',
          'src/UserController.ts': '// controller',
          'src/AuthMiddleware.ts': '// middleware',
        },
      });
      const conventions = service.scanConventions(tempDir);
      expect(conventions.naming.files).toBe('PascalCase');
    });

    it('should return defaults for empty project', () => {
      createMockProject(tempDir);
      const conventions = service.scanConventions(tempDir);
      expect(conventions.naming.variables).toBe('unknown');
      expect(conventions.naming.files).toBe('unknown');
      expect(conventions.imports.style).toBe('unknown');
      expect(conventions.formatting.indent).toBe('unknown');
    });

    it('should throw PathValidationError on path traversal', () => {
      expect(() => service.scanConventions('../../../etc')).toThrow(PathValidationError);
    });

    it('should throw PathValidationError for non-absolute path', () => {
      expect(() => service.scanConventions('relative/path')).toThrow(PathValidationError);
    });
  });

  // --------------------------------------------------------------------------
  // buildRefinementJob
  // --------------------------------------------------------------------------

  describe('buildRefinementJob', () => {
    const makeSampleFiles = (): GeneratedFile[] => [
      { path: 'src/models.ts', content: 'export interface Pet { id: string; }', language: 'typescript', size: 38 },
      { path: 'src/routes.ts', content: 'const router = Router();', language: 'typescript', size: 24 },
      { path: 'src/validators.ts', content: "import { z } from 'zod';", language: 'typescript', size: 24 },
    ];

    it('should create subtasks for generated files', () => {
      createMockProject(tempDir);
      const files = makeSampleFiles();
      const job = service.buildRefinementJob(tempDir, files, 'openapi', 'typescript-express', DEFAULT_REFINEMENT_OPTIONS, DEFAULT_CONVENTIONS);

      expect(job.subTasks.length).toBeGreaterThan(0);
      expect(job.title).toContain('typescript-express');
      expect(job.prompt).toBeTruthy();
      expect(job.projectPath).toBe(tempDir);
    });

    it('should batch files — max 5 per subtask', () => {
      createMockProject(tempDir);
      const files: GeneratedFile[] = Array.from({ length: 11 }, (_, i) => ({
        path: `src/file${i}.ts`,
        content: `// file ${i}`,
        language: 'typescript',
        size: 12,
      }));
      const job = service.buildRefinementJob(tempDir, files, 'openapi', 'typescript-express', DEFAULT_REFINEMENT_OPTIONS, DEFAULT_CONVENTIONS);

      // 11 files / batch-size 5 = 3 subtasks (5 + 5 + 1)
      expect(job.subTasks.length).toBe(3);
    });

    it('should include conventions in subtask prompts', () => {
      createMockProject(tempDir);
      const files = makeSampleFiles();
      const conventions: ProjectConventions = {
        ...DEFAULT_CONVENTIONS,
        formatting: { indent: 'tabs', indentSize: 4, quotes: 'double', semicolons: false },
      };
      const job = service.buildRefinementJob(tempDir, files, 'openapi', 'typescript-express', DEFAULT_REFINEMENT_OPTIONS, conventions);

      const taskText = job.subTasks[0]!.task;
      expect(taskText).toContain('tabs');
      expect(taskText).toContain('double');
    });

    it('should include scope constraints in subtask prompts', () => {
      createMockProject(tempDir);
      const files = makeSampleFiles();
      const job = service.buildRefinementJob(tempDir, files, 'openapi', 'typescript-express', DEFAULT_REFINEMENT_OPTIONS, DEFAULT_CONVENTIONS);

      const taskText = job.subTasks[0]!.task;
      expect(taskText).toContain('ALLOWED');
      expect(taskText).toContain('FORBIDDEN');
    });

    it('should use the correct agentId from refinement profile', () => {
      createMockProject(tempDir);
      const files = makeSampleFiles();

      const tsJob = service.buildRefinementJob(tempDir, files, 'openapi', 'typescript-express', DEFAULT_REFINEMENT_OPTIONS, DEFAULT_CONVENTIONS);
      expect(tsJob.subTasks[0]!.agentId).toBe('typescript-expert');

      const javaJob = service.buildRefinementJob(tempDir, files, 'openapi', 'java-spring', DEFAULT_REFINEMENT_OPTIONS, DEFAULT_CONVENTIONS);
      expect(javaJob.subTasks[0]!.agentId).toBe('spring-boot-expert');
    });

    it('should include refinement instructions based on options', () => {
      createMockProject(tempDir);
      const files = makeSampleFiles();
      const options: RefinementOptions = {
        enabled: true,
        naming: true,
        codeStyle: false,
        errorHandling: true,
        testStubs: false,
      };
      const job = service.buildRefinementJob(tempDir, files, 'openapi', 'typescript-express', options, DEFAULT_CONVENTIONS);

      const taskText = job.subTasks[0]!.task;
      expect(taskText).toContain('naming');
      expect(taskText).toContain('error');
    });

    it('should include result-type instruction when project uses neverthrow', () => {
      createMockProject(tempDir);
      const files = makeSampleFiles();
      const conventions: ProjectConventions = {
        ...DEFAULT_CONVENTIONS,
        errorHandling: { pattern: 'result-type' },
      };
      const options: RefinementOptions = { enabled: true, naming: false, codeStyle: false, errorHandling: true, testStubs: false };
      const job = service.buildRefinementJob(tempDir, files, 'openapi', 'typescript-express', options, conventions);

      const taskText = job.subTasks[0]!.task;
      expect(taskText).toContain('neverthrow');
    });

    it('should produce a job with correct title format', () => {
      createMockProject(tempDir);
      const files = makeSampleFiles();
      const job = service.buildRefinementJob(tempDir, files, 'openapi', 'typescript-express', DEFAULT_REFINEMENT_OPTIONS, DEFAULT_CONVENTIONS);

      expect(job.title).toMatch(/typescript-express/);
      expect(job.title).toMatch(/openapi/);
    });

    it('should throw PathValidationError on path traversal in projectPath', () => {
      const files = makeSampleFiles();
      expect(() =>
        service.buildRefinementJob('../../../etc', files, 'openapi', 'typescript-express', DEFAULT_REFINEMENT_OPTIONS, DEFAULT_CONVENTIONS)
      ).toThrow(PathValidationError);
    });

    it('should throw PathValidationError for non-absolute projectPath', () => {
      const files = makeSampleFiles();
      expect(() =>
        service.buildRefinementJob('relative/path', files, 'openapi', 'typescript-express', DEFAULT_REFINEMENT_OPTIONS, DEFAULT_CONVENTIONS)
      ).toThrow(PathValidationError);
    });
  });

  // --------------------------------------------------------------------------
  // acceptFiles
  // --------------------------------------------------------------------------

  describe('acceptFiles', () => {
    it('should write accepted files to disk', () => {
      createMockProject(tempDir);
      const outputDir = path.join(tempDir, 'generated');
      const files: GeneratedFile[] = [
        { path: path.join(outputDir, 'models.ts'), content: 'export interface Pet {}', language: 'typescript', size: 22 },
        { path: path.join(outputDir, 'routes.ts'), content: 'export default {};', language: 'typescript', size: 18 },
      ];

      const result = service.acceptFiles(tempDir, outputDir, files);

      expect(result.written).toHaveLength(2);
      expect(result.skipped).toHaveLength(0);
      for (const writtenPath of result.written) {
        expect(fs.existsSync(writtenPath)).toBe(true);
      }
    });

    it('should create directories as needed', () => {
      createMockProject(tempDir);
      const outputDir = path.join(tempDir, 'deep', 'nested', 'output');
      const files: GeneratedFile[] = [
        { path: path.join(outputDir, 'models.ts'), content: 'export interface Pet {}', language: 'typescript', size: 22 },
      ];

      const result = service.acceptFiles(tempDir, outputDir, files);

      expect(result.written).toHaveLength(1);
      expect(fs.existsSync(path.join(outputDir, 'models.ts'))).toBe(true);
    });

    it('should write file content correctly', () => {
      createMockProject(tempDir);
      const outputDir = path.join(tempDir, 'generated');
      const expectedContent = 'export interface Pet { id: string; name: string; }';
      const files: GeneratedFile[] = [
        { path: path.join(outputDir, 'models.ts'), content: expectedContent, language: 'typescript', size: expectedContent.length },
      ];

      const result = service.acceptFiles(tempDir, outputDir, files);

      const actualContent = fs.readFileSync(result.written[0]!, 'utf-8');
      expect(actualContent).toBe(expectedContent);
    });

    it('should use relative outputDir joined with projectPath for relative file paths', () => {
      createMockProject(tempDir);
      const relOutputDir = 'src/generated';
      const files: GeneratedFile[] = [
        { path: 'generated/models.ts', content: 'export interface Foo {}', language: 'typescript', size: 22 },
      ];

      const result = service.acceptFiles(tempDir, relOutputDir, files);
      expect(result.written).toHaveLength(1);
      expect(result.written[0]).toContain(tempDir);
    });

    it('should skip files with path traversal in file path', () => {
      createMockProject(tempDir);
      const outputDir = path.join(tempDir, 'generated');
      const escapePath = path.resolve(outputDir, '..', '..', '..', 'etc', 'passwd');
      const files: GeneratedFile[] = [
        { path: escapePath, content: 'malicious', language: 'text', size: 9 },
      ];

      const result = service.acceptFiles(tempDir, outputDir, files);

      // File outside projectPath should be skipped
      expect(result.skipped).toHaveLength(1);
      expect(result.written).toHaveLength(0);
      expect(fs.existsSync(escapePath)).toBe(false);
    });

    it('should handle mixed accepted and skipped files', () => {
      createMockProject(tempDir);
      const outputDir = path.join(tempDir, 'generated');
      const validPath = path.join(outputDir, 'models.ts');
      const escapePath = path.resolve(tempDir, '..', 'escape.ts');

      const files: GeneratedFile[] = [
        { path: validPath, content: 'export interface Pet {}', language: 'typescript', size: 22 },
        { path: escapePath, content: 'malicious', language: 'typescript', size: 9 },
      ];

      const result = service.acceptFiles(tempDir, outputDir, files);

      expect(result.written).toHaveLength(1);
      expect(result.skipped).toHaveLength(1);
    });

    it('should throw PathValidationError on path traversal in projectPath', () => {
      const files: GeneratedFile[] = [
        { path: '/some/file.ts', content: '', language: 'typescript', size: 0 },
      ];
      expect(() =>
        service.acceptFiles('../../../etc', 'generated', files)
      ).toThrow(PathValidationError);
    });

    it('should throw PathValidationError for non-absolute projectPath', () => {
      const files: GeneratedFile[] = [];
      expect(() =>
        service.acceptFiles('relative/path', 'generated', files)
      ).toThrow(PathValidationError);
    });

    it('should throw PathValidationError on path traversal in outputDir', () => {
      createMockProject(tempDir);
      const files: GeneratedFile[] = [];
      expect(() =>
        service.acceptFiles(tempDir, '../escape', files)
      ).toThrow(PathValidationError);
    });

    it('should return empty arrays when given no files', () => {
      createMockProject(tempDir);
      const result = service.acceptFiles(tempDir, path.join(tempDir, 'out'), []);
      expect(result.written).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Integration: generate + acceptFiles round-trip
  // --------------------------------------------------------------------------

  describe('generate + acceptFiles round-trip', () => {
    it('should generate then write files to disk', () => {
      createMockProject(tempDir);
      const components = allEnabled(['models', 'routes', 'validators', 'services']);
      const outputDir = path.join(tempDir, 'src', 'generated');

      const files = service.generate(OPENAPI_JSON, 'api.json', 'openapi', 'typescript-express', outputDir, components, tempDir);
      expect(files.length).toBeGreaterThan(0);

      const result = service.acceptFiles(tempDir, outputDir, files);
      expect(result.written.length).toBe(files.length);
      expect(result.skipped).toHaveLength(0);

      for (const writtenPath of result.written) {
        expect(fs.existsSync(writtenPath)).toBe(true);
        const content = fs.readFileSync(writtenPath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
      }
    });

    it('should generate valid TypeSpec code and write it', () => {
      createMockProject(tempDir);
      const components = allEnabled(['models', 'routes']);
      const outputDir = path.join(tempDir, 'generated');

      const files = service.generate(TYPESPEC_CONTENT, 'spec.tsp', 'typespec', 'typescript-express', outputDir, components, tempDir);
      const result = service.acceptFiles(tempDir, outputDir, files);

      expect(result.written.length).toBeGreaterThan(0);
    });
  });
});
