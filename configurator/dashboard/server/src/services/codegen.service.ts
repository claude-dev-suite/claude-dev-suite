// SPDX-License-Identifier: MIT
/**
 * Code Generator Service
 *
 * Orchestrates spec validation, deterministic code generation, convention
 * scanning, and refinement-job creation for the orchestrator.
 *
 * Supported input technologies: openapi, asyncapi, typespec, protobuf, bpmn
 * Supported output targets: 9 target languages / frameworks
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
  RefinementProfile,
} from '../types/codegen.js';
import type { SubTask } from '../types/orchestrator.js';

const logger = getLogger('CodeGenService');

// ============================================
// STATIC DATA STRUCTURES
// ============================================

/** All available code-generation targets with their supported component lists */
const TARGETS: CodeGenTargetInfo[] = [
  {
    id: 'typescript-express',
    label: 'TypeScript + Express',
    technologies: ['openapi', 'asyncapi', 'typespec', 'protobuf'],
    components: [
      { id: 'models', label: 'TypeScript Interfaces', enabled: true },
      { id: 'routes', label: 'Express Routes', enabled: true },
      { id: 'validators', label: 'Zod Validators', enabled: true },
      { id: 'services', label: 'Service Stubs', enabled: true },
      { id: 'tests', label: 'Test Stubs (Vitest)', enabled: false },
    ],
  },
  {
    id: 'typescript-fastify',
    label: 'TypeScript + Fastify',
    technologies: ['openapi', 'asyncapi', 'typespec', 'protobuf'],
    components: [
      { id: 'models', label: 'TypeScript Interfaces', enabled: true },
      { id: 'routes', label: 'Fastify Routes', enabled: true },
      { id: 'validators', label: 'Zod Validators', enabled: true },
      { id: 'services', label: 'Service Stubs', enabled: true },
      { id: 'tests', label: 'Test Stubs (Vitest)', enabled: false },
    ],
  },
  {
    id: 'typescript-nestjs',
    label: 'TypeScript + NestJS',
    technologies: ['openapi', 'asyncapi', 'typespec', 'protobuf'],
    components: [
      { id: 'models', label: 'DTOs & Interfaces', enabled: true },
      { id: 'routes', label: 'NestJS Controllers', enabled: true },
      { id: 'validators', label: 'class-validator Decorators', enabled: true },
      { id: 'services', label: 'NestJS Services', enabled: true },
      { id: 'modules', label: 'NestJS Modules', enabled: true },
      { id: 'tests', label: 'Test Stubs (Jest)', enabled: false },
    ],
  },
  {
    id: 'typescript-koa',
    label: 'TypeScript + Koa',
    technologies: ['openapi', 'asyncapi', 'typespec', 'protobuf'],
    components: [
      { id: 'models', label: 'TypeScript Interfaces', enabled: true },
      { id: 'routes', label: 'Koa Router Routes', enabled: true },
      { id: 'validators', label: 'Zod Validators', enabled: true },
      { id: 'services', label: 'Service Stubs', enabled: true },
      { id: 'tests', label: 'Test Stubs (Vitest)', enabled: false },
    ],
  },
  {
    id: 'java-spring',
    label: 'Java + Spring Boot',
    technologies: ['openapi', 'asyncapi', 'protobuf'],
    components: [
      { id: 'models', label: 'Java POJOs / Records', enabled: true },
      { id: 'routes', label: 'Spring RestControllers', enabled: true },
      { id: 'validators', label: 'Bean Validation Annotations', enabled: true },
      { id: 'services', label: 'Service Interfaces & Stubs', enabled: true },
      { id: 'tests', label: 'Test Stubs (JUnit 5)', enabled: false },
    ],
  },
  {
    id: 'python-fastapi',
    label: 'Python + FastAPI',
    technologies: ['openapi', 'asyncapi', 'typespec', 'protobuf'],
    components: [
      { id: 'models', label: 'Pydantic Models', enabled: true },
      { id: 'routes', label: 'FastAPI Routers', enabled: true },
      { id: 'services', label: 'Service Stubs', enabled: true },
      { id: 'tests', label: 'Test Stubs (pytest)', enabled: false },
    ],
  },
  {
    id: 'python-flask',
    label: 'Python + Flask',
    technologies: ['openapi', 'asyncapi', 'protobuf'],
    components: [
      { id: 'models', label: 'dataclass Models', enabled: true },
      { id: 'routes', label: 'Flask Blueprints', enabled: true },
      { id: 'services', label: 'Service Stubs', enabled: true },
      { id: 'tests', label: 'Test Stubs (pytest)', enabled: false },
    ],
  },
  {
    id: 'go-gin',
    label: 'Go + Gin',
    technologies: ['openapi', 'asyncapi', 'protobuf'],
    components: [
      { id: 'models', label: 'Go Structs', enabled: true },
      { id: 'routes', label: 'Gin Handlers', enabled: true },
      { id: 'services', label: 'Service Stubs', enabled: true },
      { id: 'tests', label: 'Test Stubs', enabled: false },
    ],
  },
  {
    id: 'go-echo',
    label: 'Go + Echo',
    technologies: ['openapi', 'asyncapi', 'protobuf'],
    components: [
      { id: 'models', label: 'Go Structs', enabled: true },
      { id: 'routes', label: 'Echo Handlers', enabled: true },
      { id: 'services', label: 'Service Stubs', enabled: true },
      { id: 'tests', label: 'Test Stubs', enabled: false },
    ],
  },
];

/**
 * Maps each target language to a refinement agent and scope constraints.
 * Allowed = changes Claude may make. Forbidden = hard off-limits.
 */
const REFINEMENT_PROFILES: Record<CodeGenTargetLanguage, RefinementProfile> = {
  'typescript-express': {
    agentId: 'typescript-expert',
    scopeConstraints: {
      allowed: ['rename', 'restyle', 'error-handling', 'type-safety', 'import-style'],
      forbidden: ['restructure', 'add-features', 'change-api-contract', 'remove-endpoints'],
    },
  },
  'typescript-fastify': {
    agentId: 'typescript-expert',
    scopeConstraints: {
      allowed: ['rename', 'restyle', 'error-handling', 'type-safety', 'import-style'],
      forbidden: ['restructure', 'add-features', 'change-api-contract', 'remove-endpoints'],
    },
  },
  'typescript-nestjs': {
    agentId: 'typescript-expert',
    scopeConstraints: {
      allowed: ['rename', 'restyle', 'error-handling', 'type-safety', 'import-style'],
      forbidden: ['restructure', 'add-features', 'change-api-contract', 'remove-endpoints'],
    },
  },
  'typescript-koa': {
    agentId: 'typescript-expert',
    scopeConstraints: {
      allowed: ['rename', 'restyle', 'error-handling', 'type-safety', 'import-style'],
      forbidden: ['restructure', 'add-features', 'change-api-contract', 'remove-endpoints'],
    },
  },
  'java-spring': {
    agentId: 'spring-boot-expert',
    scopeConstraints: {
      allowed: ['rename', 'restyle', 'error-handling', 'type-safety', 'import-style'],
      forbidden: ['restructure', 'add-features', 'change-api-contract', 'remove-endpoints'],
    },
  },
  'python-fastapi': {
    agentId: 'fastapi-expert',
    scopeConstraints: {
      allowed: ['rename', 'restyle', 'error-handling', 'type-safety', 'import-style'],
      forbidden: ['restructure', 'add-features', 'change-api-contract', 'remove-endpoints'],
    },
  },
  'python-flask': {
    agentId: 'fastapi-expert',
    scopeConstraints: {
      allowed: ['rename', 'restyle', 'error-handling', 'type-safety', 'import-style'],
      forbidden: ['restructure', 'add-features', 'change-api-contract', 'remove-endpoints'],
    },
  },
  'go-gin': {
    agentId: 'go-expert',
    scopeConstraints: {
      allowed: ['rename', 'restyle', 'error-handling', 'type-safety', 'import-style'],
      forbidden: ['restructure', 'add-features', 'change-api-contract', 'remove-endpoints'],
    },
  },
  'go-echo': {
    agentId: 'go-expert',
    scopeConstraints: {
      allowed: ['rename', 'restyle', 'error-handling', 'type-safety', 'import-style'],
      forbidden: ['restructure', 'add-features', 'change-api-contract', 'remove-endpoints'],
    },
  },
};

// ============================================
// INTERNAL HELPER TYPES
// ============================================

interface ModelDef {
  name: string;
  properties: Array<{ name: string; type: string; required: boolean }>;
}

interface EndpointDef {
  method: string;
  path: string;
  operationId: string;
  requestBody: string | null;
  responses: string[];
  tags: string[];
}

interface ChannelDef {
  name: string;
  operationId: string;
  messageType: string;
}

interface ProtoMessageDef {
  name: string;
  fields: Array<{ name: string; type: string; number: number }>;
}

interface ProtoServiceDef {
  name: string;
  methods: Array<{ name: string; inputType: string; outputType: string }>;
}

interface BpmnProcessDef {
  id: string;
  name: string;
  tasks: Array<{ id: string; name: string; type: string }>;
}

interface SpecInfo {
  technology: CodeGenTechnology;
  title: string;
  version: string | null;
  models: ModelDef[];
  endpoints: EndpointDef[];
  channels: ChannelDef[];
  protoMessages: ProtoMessageDef[];
  protoServices: ProtoServiceDef[];
  bpmnProcesses: BpmnProcessDef[];
}

// ============================================
// TYPE CONVERSION HELPERS
// ============================================

function protoTypeToTs(t: string): string {
  const m: Record<string, string> = {
    string: 'string', bool: 'boolean',
    int32: 'number', int64: 'number', uint32: 'number', uint64: 'number',
    float: 'number', double: 'number', bytes: 'Uint8Array',
  };
  return m[t] ?? t;
}

function protoTypeToJava(t: string): string {
  const m: Record<string, string> = {
    string: 'String', bool: 'Boolean',
    int32: 'Integer', int64: 'Long',
    uint32: 'Integer', uint64: 'Long',
    float: 'Float', double: 'Double', bytes: 'byte[]',
  };
  return m[t] ?? t;
}

function protoTypeToPython(t: string): string {
  const m: Record<string, string> = {
    string: 'str', bool: 'bool',
    int32: 'int', int64: 'int', uint32: 'int', uint64: 'int',
    float: 'float', double: 'float', bytes: 'bytes',
  };
  return m[t] ?? t;
}

function protoTypeToGo(t: string): string {
  const m: Record<string, string> = {
    string: 'string', bool: 'bool',
    int32: 'int32', int64: 'int64', uint32: 'uint32', uint64: 'uint64',
    float: 'float32', double: 'float64', bytes: '[]byte',
  };
  return m[t] ?? t;
}

function openApiTypeToTs(schemaType: string, format?: string): string {
  if (format === 'date-time' || format === 'date') return 'string';
  if (format === 'binary') return 'Blob';
  const m: Record<string, string> = {
    integer: 'number', number: 'number', boolean: 'boolean',
    array: 'unknown[]', object: 'Record<string, unknown>',
  };
  return m[schemaType] ?? 'string';
}

function openApiTypeToJava(schemaType: string, format?: string): string {
  if (format === 'date-time') return 'java.time.OffsetDateTime';
  if (format === 'date') return 'java.time.LocalDate';
  if (format === 'int64') return 'Long';
  const m: Record<string, string> = {
    integer: 'Integer', number: 'Double', boolean: 'Boolean',
    array: 'java.util.List<Object>', object: 'java.util.Map<String, Object>',
  };
  return m[schemaType] ?? 'String';
}

function openApiTypeToPython(schemaType: string): string {
  const m: Record<string, string> = {
    integer: 'int', number: 'float', boolean: 'bool', array: 'list', object: 'dict',
  };
  return m[schemaType] ?? 'str';
}

function openApiTypeToGo(schemaType: string, format?: string): string {
  if (format === 'int64') return 'int64';
  const m: Record<string, string> = {
    integer: 'int', number: 'float64', boolean: 'bool',
    array: '[]interface{}', object: 'map[string]interface{}',
  };
  return m[schemaType] ?? 'string';
}

/** Derive a safe operationId from method + path when none is present in the spec */
function deriveOperationId(method: string, endpointPath: string): string {
  const segments = endpointPath
    .split('/')
    .filter(Boolean)
    .map(s => s.replace(/[{}]/g, '').replace(/-/g, '_'));
  return `${method.toLowerCase()}${segments.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}`;
}

// ============================================
// SPEC PARSING
// ============================================

function parseOpenApiSpec(content: string): Pick<SpecInfo, 'title' | 'version' | 'models' | 'endpoints'> {
  const models: ModelDef[] = [];
  const endpoints: EndpointDef[] = [];
  let title = 'API';
  let version: string | null = null;

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const info = parsed.info as Record<string, unknown> | undefined;
    title = (info?.title as string) ?? 'API';
    version = (parsed.openapi as string) ?? (parsed.swagger as string) ?? null;

    const schemas = (
      (parsed.components as Record<string, unknown>)?.schemas ??
      (parsed.definitions as Record<string, unknown>) ??
      {}
    ) as Record<string, Record<string, unknown>>;

    for (const [name, schemaDef] of Object.entries(schemas)) {
      const required = (schemaDef.required as string[]) ?? [];
      const rawProps = (schemaDef.properties as Record<string, Record<string, unknown>>) ?? {};
      const properties = Object.entries(rawProps).map(([propName, propSchema]) => ({
        name: propName,
        type: openApiTypeToTs(
          (propSchema.type as string) ?? 'string',
          propSchema.format as string | undefined,
        ),
        required: required.includes(propName),
      }));
      models.push({ name, properties });
    }

    const paths = (parsed.paths as Record<string, Record<string, unknown>>) ?? {};
    for (const [endpointPath, pathItem] of Object.entries(paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
        const operation = (pathItem as Record<string, unknown>)[method] as Record<string, unknown> | undefined;
        if (!operation) continue;
        const operationId = (operation.operationId as string) ?? deriveOperationId(method, endpointPath);
        const tags = (operation.tags as string[]) ?? [];
        const requestBody = operation.requestBody ? 'body' : null;
        const responses = Object.keys((operation.responses as Record<string, unknown>) ?? {});
        endpoints.push({ method: method.toUpperCase(), path: endpointPath, operationId, requestBody, responses, tags });
      }
    }
  } catch {
    // YAML fallback — regex-based extraction (no YAML parser dependency)
    const titleMatch = content.match(/^\s*title:\s*["']?(.+?)["']?\s*$/m);
    if (titleMatch?.[1]) title = titleMatch[1].trim();
    const versionMatch = content.match(/(?:openapi|swagger):\s*["']?([0-9.]+)["']?/i);
    if (versionMatch?.[1]) version = versionMatch[1];

    const pathRe = /^(\/[^\s:#]+):/gm;
    const methodRe = /^\s{2,6}(get|post|put|patch|delete):/gm;
    let pm: RegExpExecArray | null;
    while ((pm = pathRe.exec(content)) !== null) {
      const endpointPath = pm[1] ?? '';
      const blockStart = pm.index;
      const blockEnd = content.indexOf('\n/', blockStart + 1);
      const block = content.slice(blockStart, blockEnd === -1 ? undefined : blockEnd);
      let mm: RegExpExecArray | null;
      methodRe.lastIndex = 0;
      while ((mm = methodRe.exec(block)) !== null) {
        const method = mm[1] ?? 'get';
        endpoints.push({
          method: method.toUpperCase(), path: endpointPath,
          operationId: deriveOperationId(method, endpointPath),
          requestBody: null, responses: ['200'], tags: [],
        });
      }
    }
  }

  if (models.length === 0) {
    models.push({
      name: 'Resource',
      properties: [
        { name: 'id', type: 'string', required: true },
        { name: 'createdAt', type: 'string', required: false },
      ],
    });
  }

  return { title, version, models, endpoints };
}

function parseAsyncApiSpec(content: string): Pick<SpecInfo, 'title' | 'version' | 'channels' | 'models'> {
  const channels: ChannelDef[] = [];
  const models: ModelDef[] = [];
  let title = 'AsyncAPI';
  let version: string | null = null;

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const info = parsed.info as Record<string, unknown> | undefined;
    title = (info?.title as string) ?? 'AsyncAPI';
    version = (parsed.asyncapi as string) ?? null;
    const rawChannels = (parsed.channels as Record<string, unknown>) ?? {};
    for (const [channelName, channelDef] of Object.entries(rawChannels)) {
      const ch = channelDef as Record<string, unknown>;
      const subscribe = ch.subscribe as Record<string, unknown> | undefined;
      const publish = ch.publish as Record<string, unknown> | undefined;
      const op = subscribe ?? publish;
      const operationId = (op?.operationId as string) ?? deriveOperationId('handle', channelName);
      const payload = (op?.message as Record<string, unknown>)?.payload as Record<string, unknown> | undefined;
      const messageType = payload?.$ref
        ? ((payload.$ref as string).split('/').pop() ?? 'Message')
        : 'Message';
      channels.push({ name: channelName, operationId, messageType });
    }
  } catch {
    const titleMatch = content.match(/^\s*title:\s*["']?(.+?)["']?\s*$/m);
    if (titleMatch?.[1]) title = titleMatch[1].trim();
    const versionMatch = content.match(/asyncapi:\s*["']?([0-9.]+)["']?/i);
    if (versionMatch?.[1]) version = versionMatch[1];
    const channelRe = /^(\s{0,2})([\w./{}:-]+):\s*\n(?:[\s\S]*?)(?=\n\s{0,2}\w|\Z)/gm;
    let m: RegExpExecArray | null;
    while ((m = channelRe.exec(content)) !== null) {
      const channelName = m[2] ?? '';
      if (channelName && !['info', 'channels', 'servers', 'components', 'tags'].includes(channelName)) {
        channels.push({ name: channelName, operationId: deriveOperationId('handle', channelName), messageType: 'Message' });
      }
    }
  }

  models.push({ name: 'Message', properties: [{ name: 'id', type: 'string', required: true }] });
  return { title, version, channels, models };
}

function parseTypeSpecContent(content: string): Pick<SpecInfo, 'title' | 'version' | 'models' | 'endpoints'> {
  const models: ModelDef[] = [];
  const endpoints: EndpointDef[] = [];

  const nsMatch = content.match(/namespace\s+([\w.]+)/);
  const title = nsMatch?.[1] ?? 'TypeSpec';

  const modelRe = /model\s+(\w+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(content)) !== null) {
    const name = m[1] ?? '';
    const body = m[2] ?? '';
    const propRe = /(\w+)(\?)?\s*:\s*([\w\[\]]+)/g;
    const properties: ModelDef['properties'] = [];
    let pm: RegExpExecArray | null;
    while ((pm = propRe.exec(body)) !== null) {
      const tsType = pm[3] === 'int32' || pm[3] === 'float32' ? 'number'
        : pm[3] === 'boolean' ? 'boolean'
        : 'string';
      properties.push({ name: pm[1] ?? '', type: tsType, required: pm[2] !== '?' });
    }
    models.push({ name, properties });
  }

  const opRe = /(?:@route\(["']([^"']+)["']\)\s*)?@(get|post|put|patch|delete)\s*(?:\w+\s+)?(\w+)\s*\(/g;
  while ((m = opRe.exec(content)) !== null) {
    const endpointPath = m[1] ?? `/${(m[3] ?? 'op').toLowerCase()}`;
    const method = (m[2] ?? 'get').toUpperCase();
    endpoints.push({ method, path: endpointPath, operationId: m[3] ?? deriveOperationId(method, endpointPath), requestBody: null, responses: ['200'], tags: [] });
  }

  if (models.length === 0) {
    models.push({ name: 'Resource', properties: [{ name: 'id', type: 'string', required: true }] });
  }

  return { title, version: null, models, endpoints };
}

function parseProtobufContent(content: string): Pick<SpecInfo, 'title' | 'version' | 'protoMessages' | 'protoServices'> {
  const protoMessages: ProtoMessageDef[] = [];
  const protoServices: ProtoServiceDef[] = [];

  const pkgMatch = content.match(/package\s+([\w.]+)\s*;/);
  const title = pkgMatch?.[1] ?? 'proto';

  const msgRe = /message\s+(\w+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = msgRe.exec(content)) !== null) {
    const name = m[1] ?? '';
    const body = m[2] ?? '';
    const fieldRe = /(?:repeated\s+)?(\w+)\s+(\w+)\s*=\s*(\d+)\s*;/g;
    const fields: ProtoMessageDef['fields'] = [];
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(body)) !== null) {
      fields.push({ type: fm[1] ?? 'string', name: fm[2] ?? '', number: parseInt(fm[3] ?? '0', 10) });
    }
    protoMessages.push({ name, fields });
  }

  const svcRe = /service\s+(\w+)\s*\{([^}]*)\}/g;
  while ((m = svcRe.exec(content)) !== null) {
    const name = m[1] ?? '';
    const body = m[2] ?? '';
    const rpcRe = /rpc\s+(\w+)\s*\((\w+)\)\s*returns\s*\((\w+)\)/g;
    const methods: ProtoServiceDef['methods'] = [];
    let rm: RegExpExecArray | null;
    while ((rm = rpcRe.exec(body)) !== null) {
      methods.push({ name: rm[1] ?? '', inputType: rm[2] ?? '', outputType: rm[3] ?? '' });
    }
    protoServices.push({ name, methods });
  }

  if (protoMessages.length === 0) {
    protoMessages.push({ name: 'Resource', fields: [{ name: 'id', type: 'string', number: 1 }] });
  }

  return { title, version: null, protoMessages, protoServices };
}

function parseBpmnContent(content: string): Pick<SpecInfo, 'title' | 'version' | 'bpmnProcesses'> {
  const bpmnProcesses: BpmnProcessDef[] = [];

  const processRe = /<(?:bpmn2?:)?process[^>]+id=["']([^"']+)["'][^>]*(?:name=["']([^"']+)["'])?[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = processRe.exec(content)) !== null) {
    const id = m[1] ?? '';
    const name = m[2] ?? id;
    const tasks: BpmnProcessDef['tasks'] = [];

    const svcRe = /<(?:bpmn2?:)?serviceTask[^>]+id=["']([^"']+)["'][^>]*(?:name=["']([^"']+)["'])?[^>]*>/g;
    let tm: RegExpExecArray | null;
    while ((tm = svcRe.exec(content)) !== null) {
      tasks.push({ id: tm[1] ?? '', name: tm[2] ?? '', type: 'serviceTask' });
    }

    const userRe = /<(?:bpmn2?:)?userTask[^>]+id=["']([^"']+)["'][^>]*(?:name=["']([^"']+)["'])?[^>]*>/g;
    while ((tm = userRe.exec(content)) !== null) {
      tasks.push({ id: tm[1] ?? '', name: tm[2] ?? '', type: 'userTask' });
    }

    bpmnProcesses.push({ id, name, tasks });
  }

  if (bpmnProcesses.length === 0) {
    bpmnProcesses.push({ id: 'process_1', name: 'Process', tasks: [] });
  }

  return { title: bpmnProcesses[0]?.name ?? 'Workflow', version: null, bpmnProcesses };
}

function buildSpecInfo(content: string, technology: CodeGenTechnology): SpecInfo {
  const base: SpecInfo = {
    technology,
    title: 'API', version: null,
    models: [], endpoints: [], channels: [],
    protoMessages: [], protoServices: [], bpmnProcesses: [],
  };

  switch (technology) {
    case 'openapi': {
      const info = parseOpenApiSpec(content);
      return { ...base, ...info };
    }
    case 'asyncapi': {
      const info = parseAsyncApiSpec(content);
      return { ...base, ...info };
    }
    case 'typespec': {
      const info = parseTypeSpecContent(content);
      return { ...base, ...info };
    }
    case 'protobuf': {
      const info = parseProtobufContent(content);
      return { ...base, ...info };
    }
    case 'bpmn': {
      const info = parseBpmnContent(content);
      return { ...base, ...info };
    }
  }
}

// ============================================
// CODE GENERATORS — TypeScript shared
// ============================================

function generateTsInterfaces(models: ModelDef[]): string {
  return models.map(model => {
    const props = model.properties
      .map(p => `  ${p.name}${p.required ? '' : '?'}: ${p.type};`)
      .join('\n');
    return `export interface ${model.name} {\n${props}\n}`;
  }).join('\n\n');
}

function generateZodValidators(models: ModelDef[]): string {
  const lines: string[] = ["import { z } from 'zod';", ''];
  for (const model of models) {
    const fields = model.properties.map(p => {
      const zodType = p.type === 'number' ? 'z.number()'
        : p.type === 'boolean' ? 'z.boolean()'
        : 'z.string()';
      return `  ${p.name}: ${p.required ? zodType : `${zodType}.optional()`},`;
    }).join('\n');
    lines.push(`export const ${model.name}Schema = z.object({\n${fields}\n});`);
    lines.push(`export type ${model.name} = z.infer<typeof ${model.name}Schema>;`);
    lines.push('');
  }
  return lines.join('\n');
}

// ============================================
// CODE GENERATORS — Express
// ============================================

function generateExpressRoutes(endpoints: EndpointDef[], models: ModelDef[]): string {
  const modelNames = models.map(m => m.name);
  const lines = [
    "import { Router, type Request, type Response, type NextFunction } from 'express';",
    modelNames.length > 0 ? `import type { ${modelNames.join(', ')} } from './models.js';` : null,
    '',
    'const router = Router();',
    '',
  ].filter((l): l is string => l !== null);

  for (const ep of endpoints) {
    const method = ep.method.toLowerCase();
    const hasBody = ep.requestBody !== null || ['post', 'put', 'patch'].includes(method);
    lines.push(`router.${method}('${ep.path}', async (req: Request, res: Response, next: NextFunction) => {`);
    lines.push(`  try {`);
    if (hasBody) lines.push(`    const body = req.body as unknown;`);
    lines.push(`    // TODO: implement ${ep.operationId}`);
    lines.push(`    res.json({ success: true, data: null });`);
    lines.push(`  } catch (err) {`);
    lines.push(`    next(err);`);
    lines.push(`  }`);
    lines.push(`});`);
    lines.push('');
  }

  lines.push('export default router;');
  return lines.join('\n');
}

function generateExpressServices(models: ModelDef[]): string {
  return models.map(model => {
    const lc = model.name.charAt(0).toLowerCase() + model.name.slice(1);
    return [
      `export class ${model.name}Service {`,
      `  async findAll(): Promise<${model.name}[]> {`,
      `    // TODO: implement`,
      `    return [];`,
      `  }`,
      `  async findById(id: string): Promise<${model.name} | null> {`,
      `    void id;`,
      `    return null;`,
      `  }`,
      `  async create(data: Partial<${model.name}>): Promise<${model.name}> {`,
      `    void data;`,
      `    throw new Error('Not implemented');`,
      `  }`,
      `  async update(id: string, data: Partial<${model.name}>): Promise<${model.name} | null> {`,
      `    void id; void data;`,
      `    return null;`,
      `  }`,
      `  async delete(id: string): Promise<boolean> {`,
      `    void id;`,
      `    return false;`,
      `  }`,
      `}`,
      '',
      `export const ${lc}Service = new ${model.name}Service();`,
    ].join('\n');
  }).join('\n\n');
}

function generateExpressTests(endpoints: EndpointDef[]): string {
  const lines = [
    "import { describe, it, expect } from 'vitest';",
    "import request from 'supertest';",
    "import app from '../app.js';",
    '',
  ];
  const grouped = new Map<string, EndpointDef[]>();
  for (const ep of endpoints) {
    const tag = ep.tags[0] ?? 'api';
    if (!grouped.has(tag)) grouped.set(tag, []);
    grouped.get(tag)!.push(ep);
  }
  for (const [tag, eps] of grouped) {
    lines.push(`describe('${tag}', () => {`);
    for (const ep of eps) {
      lines.push(`  it('${ep.operationId} returns < 500', async () => {`);
      lines.push(`    const res = await request(app).${ep.method.toLowerCase()}('${ep.path}');`);
      lines.push(`    expect(res.status).toBeLessThan(500);`);
      lines.push(`  });`);
    }
    lines.push(`});`);
    lines.push('');
  }
  return lines.join('\n');
}

// ============================================
// CODE GENERATORS — Fastify
// ============================================

function generateFastifyRoutes(endpoints: EndpointDef[], models: ModelDef[]): string {
  const modelNames = models.map(m => m.name);
  const lines = [
    "import type { FastifyPluginAsync } from 'fastify';",
    modelNames.length > 0 ? `import type { ${modelNames.join(', ')} } from './models.js';` : null,
    '',
    'const routes: FastifyPluginAsync = async (fastify) => {',
  ].filter((l): l is string => l !== null);

  for (const ep of endpoints) {
    const method = ep.method.toLowerCase();
    const hasBody = ep.requestBody !== null || ['post', 'put', 'patch'].includes(method);
    lines.push(`  fastify.${method}('${ep.path}', async (request, reply) => {`);
    if (hasBody) lines.push(`    const body = request.body as unknown;`);
    lines.push(`    // TODO: implement ${ep.operationId}`);
    lines.push(`    return reply.send({ success: true, data: null });`);
    lines.push(`  });`);
    lines.push('');
  }

  lines.push('};', '', 'export default routes;');
  return lines.join('\n');
}

// ============================================
// CODE GENERATORS — NestJS
// ============================================

function generateNestJsController(endpoints: EndpointDef[], models: ModelDef[]): string {
  const modelNames = models.map(m => m.name);
  const decoratorMap: Record<string, string> = {
    GET: 'Get', POST: 'Post', PUT: 'Put', PATCH: 'Patch', DELETE: 'Delete',
  };
  const usedDecorators = [...new Set(endpoints.map(e => decoratorMap[e.method] ?? 'Get'))];

  const lines = [
    `import { Controller, ${['Body', 'Param', 'Query', ...usedDecorators].join(', ')} } from '@nestjs/common';`,
    modelNames.length > 0 ? `import type { ${modelNames.join(', ')} } from './models.js';` : null,
    '',
    `@Controller()`,
    `export class AppController {`,
  ].filter((l): l is string => l !== null);

  for (const ep of endpoints) {
    const dec = decoratorMap[ep.method] ?? 'Get';
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(ep.method);
    lines.push(`  @${dec}('${ep.path}')`);
    lines.push(`  async ${ep.operationId}(${hasBody ? '@Body() body: unknown' : ''}) {`);
    lines.push(`    // TODO: implement`);
    lines.push(`    return { success: true, data: null };`);
    lines.push(`  }`);
    lines.push('');
  }

  lines.push('}');
  return lines.join('\n');
}

function generateNestJsService(models: ModelDef[]): string {
  return [
    "import { Injectable } from '@nestjs/common';",
    '',
    '@Injectable()',
    'export class AppService {',
    ...models.flatMap(model => [
      `  async findAll${model.name}(): Promise<${model.name}[]> {`,
      `    // TODO: implement`,
      `    return [];`,
      `  }`,
      '',
    ]),
    '}',
  ].join('\n');
}

function generateNestJsModule(): string {
  return [
    "import { Module } from '@nestjs/common';",
    "import { AppController } from './app.controller.js';",
    "import { AppService } from './app.service.js';",
    '',
    '@Module({',
    '  imports: [],',
    '  controllers: [AppController],',
    '  providers: [AppService],',
    '})',
    'export class AppModule {}',
  ].join('\n');
}

// ============================================
// CODE GENERATORS — Koa
// ============================================

function generateKoaRoutes(endpoints: EndpointDef[], models: ModelDef[]): string {
  const modelNames = models.map(m => m.name);
  const lines = [
    "import Router from '@koa/router';",
    "import type { Context, Next } from 'koa';",
    modelNames.length > 0 ? `import type { ${modelNames.join(', ')} } from './models.js';` : null,
    '',
    'const router = new Router();',
    '',
  ].filter((l): l is string => l !== null);

  for (const ep of endpoints) {
    const method = ep.method.toLowerCase();
    lines.push(`router.${method}('${ep.path}', async (ctx: Context, next: Next) => {`);
    lines.push(`  // TODO: implement ${ep.operationId}`);
    lines.push(`  ctx.body = { success: true, data: null };`);
    lines.push(`  await next();`);
    lines.push(`});`);
    lines.push('');
  }

  lines.push('export default router;');
  return lines.join('\n');
}

// ============================================
// CODE GENERATORS — Java Spring Boot
// ============================================

function generateSpringModels(models: ModelDef[]): string {
  return models.map(model => {
    const props = model.properties.map(p => {
      const javaType = openApiTypeToJava(
        p.type === 'number' ? 'number' : p.type === 'boolean' ? 'boolean' : 'string',
      );
      return `  private ${javaType} ${p.name};`;
    }).join('\n');

    return [
      'import lombok.Data;',
      'import lombok.NoArgsConstructor;',
      'import lombok.AllArgsConstructor;',
      '',
      '@Data',
      '@NoArgsConstructor',
      '@AllArgsConstructor',
      `public class ${model.name} {`,
      props,
      '}',
    ].join('\n');
  }).join('\n\n');
}

function generateSpringController(endpoints: EndpointDef[]): string {
  const annMap: Record<string, string> = {
    GET: 'GetMapping', POST: 'PostMapping', PUT: 'PutMapping',
    PATCH: 'PatchMapping', DELETE: 'DeleteMapping',
  };
  const lines = [
    'import org.springframework.web.bind.annotation.*;',
    'import org.springframework.http.ResponseEntity;',
    '',
    '@RestController',
    '@RequestMapping("/api")',
    'public class AppController {',
    '',
  ];

  for (const ep of endpoints) {
    const ann = annMap[ep.method] ?? 'GetMapping';
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(ep.method);
    lines.push(`  @${ann}("${ep.path}")`);
    lines.push(`  public ResponseEntity<Object> ${ep.operationId}(${hasBody ? '@RequestBody Object body' : ''}) {`);
    lines.push(`    // TODO: implement`);
    lines.push(`    return ResponseEntity.ok().build();`);
    lines.push(`  }`);
    lines.push('');
  }

  lines.push('}');
  return lines.join('\n');
}

function generateSpringServices(models: ModelDef[]): string {
  return models.map(model => [
    'import org.springframework.stereotype.Service;',
    'import java.util.List;',
    '',
    '@Service',
    `public class ${model.name}Service {`,
    `  public List<${model.name}> findAll() { return List.of(); }`,
    `  public ${model.name} findById(String id) { return null; }`,
    `  public ${model.name} create(${model.name} entity) { return entity; }`,
    '}',
  ].join('\n')).join('\n\n');
}

// ============================================
// CODE GENERATORS — Python FastAPI
// ============================================

function generateFastApiModels(models: ModelDef[]): string {
  const lines = ['from pydantic import BaseModel', 'from typing import Optional', ''];
  for (const model of models) {
    lines.push(`class ${model.name}(BaseModel):`);
    if (model.properties.length === 0) {
      lines.push('    pass');
    } else {
      for (const p of model.properties) {
        const pyType = openApiTypeToPython(p.type === 'number' ? 'number' : p.type === 'boolean' ? 'boolean' : 'string');
        lines.push(`    ${p.name}: ${p.required ? pyType : `Optional[${pyType}]`} = ${p.required ? '...' : 'None'}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function generateFastApiRoutes(endpoints: EndpointDef[], models: ModelDef[]): string {
  const modelNames = models.map(m => m.name).join(', ');
  const lines = [
    'from fastapi import APIRouter, HTTPException',
    'from typing import List',
    modelNames ? `from .models import ${modelNames}` : '',
    '',
    'router = APIRouter()',
    '',
  ].filter(Boolean);

  for (const ep of endpoints) {
    const method = ep.method.toLowerCase();
    const hasBody = ['post', 'put', 'patch'].includes(method);
    lines.push(`@router.${method}("${ep.path}")`);
    lines.push(`async def ${ep.operationId}(${hasBody ? 'body: dict' : ''}):`);
    lines.push(`    # TODO: implement ${ep.operationId}`);
    lines.push(`    return {"success": True, "data": None}`);
    lines.push('');
  }
  return lines.join('\n');
}

function generateFastApiServices(models: ModelDef[]): string {
  return models.map(model => {
    const lc = model.name.toLowerCase();
    return [
      `class ${model.name}Service:`,
      `    async def find_all(self) -> list[${model.name}]:`,
      `        return []`,
      `    async def find_by_id(self, id: str) -> ${model.name} | None:`,
      `        return None`,
      `    async def create(self, data: dict) -> ${model.name}:`,
      `        raise NotImplementedError`,
      ``,
      `${lc}_service = ${model.name}Service()`,
    ].join('\n');
  }).join('\n\n');
}

// ============================================
// CODE GENERATORS — Python Flask
// ============================================

function generateFlaskModels(models: ModelDef[]): string {
  const lines = ['from dataclasses import dataclass', 'from typing import Optional', ''];
  for (const model of models) {
    lines.push('@dataclass');
    lines.push(`class ${model.name}:`);
    if (model.properties.length === 0) {
      lines.push('    pass');
    } else {
      for (const p of model.properties) {
        const pyType = openApiTypeToPython(p.type === 'number' ? 'number' : p.type === 'boolean' ? 'boolean' : 'string');
        lines.push(`    ${p.name}: ${p.required ? pyType : `Optional[${pyType}]`} = None`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function generateFlaskRoutes(endpoints: EndpointDef[]): string {
  const lines = [
    'from flask import Blueprint, jsonify, request',
    '',
    "bp = Blueprint('api', __name__, url_prefix='/api')",
    '',
  ];
  for (const ep of endpoints) {
    const method = ep.method.toLowerCase();
    const hasBody = ['post', 'put', 'patch'].includes(method);
    lines.push(`@bp.route("${ep.path}", methods=["${ep.method}"])`);
    lines.push(`def ${ep.operationId}():`);
    if (hasBody) lines.push(`    body = request.get_json()`);
    lines.push(`    # TODO: implement ${ep.operationId}`);
    lines.push(`    return jsonify({"success": True, "data": None})`);
    lines.push('');
  }
  return lines.join('\n');
}

// ============================================
// CODE GENERATORS — Go Gin
// ============================================

function generateGoStructs(models: ModelDef[]): string {
  const lines = ['package models', ''];
  for (const model of models) {
    lines.push(`type ${model.name} struct {`);
    for (const p of model.properties) {
      const goType = openApiTypeToGo(p.type === 'number' ? 'number' : p.type === 'boolean' ? 'boolean' : 'string');
      const capitalName = p.name.charAt(0).toUpperCase() + p.name.slice(1);
      lines.push(`\t${capitalName} ${goType} \`json:"${p.name}${p.required ? '' : ',omitempty'}"\``);
    }
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n');
}

function generateGinHandlers(endpoints: EndpointDef[]): string {
  const lines = [
    'package handlers',
    '',
    'import (',
    '\t"net/http"',
    '\t"github.com/gin-gonic/gin"',
    ')',
    '',
  ];
  for (const ep of endpoints) {
    const handlerName = ep.operationId.charAt(0).toUpperCase() + ep.operationId.slice(1);
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(ep.method);
    lines.push(`func ${handlerName}(c *gin.Context) {`);
    if (hasBody) {
      lines.push(`\tvar body map[string]interface{}`);
      lines.push(`\tif err := c.ShouldBindJSON(&body); err != nil {`);
      lines.push(`\t\tc.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})`);
      lines.push(`\t\treturn`);
      lines.push(`\t}`);
    }
    lines.push(`\t// TODO: implement ${ep.operationId}`);
    lines.push(`\tc.JSON(http.StatusOK, gin.H{"success": true, "data": nil})`);
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n');
}

function generateGinRoutes(endpoints: EndpointDef[]): string {
  const lines = [
    'package routes',
    '',
    'import (',
    '\t"github.com/gin-gonic/gin"',
    '\t"./handlers"',
    ')',
    '',
    'func RegisterRoutes(r *gin.Engine) {',
  ];
  for (const ep of endpoints) {
    const method = ep.method.charAt(0) + ep.method.slice(1).toLowerCase();
    const handlerName = ep.operationId.charAt(0).toUpperCase() + ep.operationId.slice(1);
    lines.push(`\tr.${method}("${ep.path}", handlers.${handlerName})`);
  }
  lines.push('}');
  return lines.join('\n');
}

// ============================================
// CODE GENERATORS — Go Echo
// ============================================

function generateEchoHandlers(endpoints: EndpointDef[]): string {
  const lines = [
    'package handlers',
    '',
    'import (',
    '\t"net/http"',
    '\t"github.com/labstack/echo/v4"',
    ')',
    '',
  ];
  for (const ep of endpoints) {
    const handlerName = ep.operationId.charAt(0).toUpperCase() + ep.operationId.slice(1);
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(ep.method);
    lines.push(`func ${handlerName}(c echo.Context) error {`);
    if (hasBody) {
      lines.push(`\tbody := new(map[string]interface{})`);
      lines.push(`\tif err := c.Bind(body); err != nil {`);
      lines.push(`\t\treturn err`);
      lines.push(`\t}`);
    }
    lines.push(`\t// TODO: implement ${ep.operationId}`);
    lines.push(`\treturn c.JSON(http.StatusOK, map[string]interface{}{"success": true, "data": nil})`);
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n');
}

function generateEchoRoutes(endpoints: EndpointDef[]): string {
  const lines = [
    'package routes',
    '',
    'import (',
    '\t"github.com/labstack/echo/v4"',
    '\t"./handlers"',
    ')',
    '',
    'func RegisterRoutes(e *echo.Echo) {',
  ];
  for (const ep of endpoints) {
    const method = ep.method.charAt(0) + ep.method.slice(1).toLowerCase();
    const handlerName = ep.operationId.charAt(0).toUpperCase() + ep.operationId.slice(1);
    lines.push(`\te.${method}("${ep.path}", handlers.${handlerName})`);
  }
  lines.push('}');
  return lines.join('\n');
}

// ============================================
// CODE GENERATORS — Protobuf derived
// ============================================

function generateProtoTsInterfaces(messages: ProtoMessageDef[], services: ProtoServiceDef[]): string {
  const lines: string[] = [];
  for (const msg of messages) {
    lines.push(`export interface ${msg.name} {`);
    for (const f of msg.fields) lines.push(`  ${f.name}: ${protoTypeToTs(f.type)};`);
    lines.push('}', '');
  }
  for (const svc of services) {
    lines.push(`export abstract class ${svc.name}Service {`);
    for (const m of svc.methods) {
      lines.push(`  abstract ${m.name}(request: ${m.inputType}): Promise<${m.outputType}>;`);
    }
    lines.push('}', '');
  }
  return lines.join('\n');
}

function generateProtoJavaClasses(messages: ProtoMessageDef[]): string {
  return messages.map(msg => {
    const props = msg.fields.map(f => `  private ${protoTypeToJava(f.type)} ${f.name};`).join('\n');
    return ['import lombok.Data;', '@Data', `public class ${msg.name} {`, props, '}'].join('\n');
  }).join('\n\n');
}

function generateProtoPythonModels(messages: ProtoMessageDef[]): string {
  const lines = ['from dataclasses import dataclass', ''];
  for (const msg of messages) {
    lines.push('@dataclass');
    lines.push(`class ${msg.name}:`);
    if (msg.fields.length === 0) lines.push('    pass');
    else for (const f of msg.fields) lines.push(`    ${f.name}: ${protoTypeToPython(f.type)}`);
    lines.push('');
  }
  return lines.join('\n');
}

function generateProtoGoStructs(messages: ProtoMessageDef[]): string {
  const lines = ['package models', ''];
  for (const msg of messages) {
    lines.push(`type ${msg.name} struct {`);
    for (const f of msg.fields) {
      const cap = f.name.charAt(0).toUpperCase() + f.name.slice(1);
      lines.push(`\t${cap} ${protoTypeToGo(f.type)} \`json:"${f.name}"\``);
    }
    lines.push('}', '');
  }
  return lines.join('\n');
}

// ============================================
// CODE GENERATORS — BPMN
// ============================================

function generateBpmnWorkflowTs(processes: BpmnProcessDef[]): string {
  const lines: string[] = [];
  for (const proc of processes) {
    const safeName = proc.name.replace(/\s+/g, '');
    const taskNames = proc.tasks.map(t => `'${t.name.replace(/\s+/g, '_').toUpperCase()}'`);
    lines.push(`export type ${safeName}State = ${taskNames.length > 0 ? taskNames.join(' | ') : 'string'};`);
    lines.push('');
    lines.push(`export class ${safeName}Engine {`);
    lines.push(`  private state: ${safeName}State${taskNames.length > 0 ? ` = ${taskNames[0]}` : " = 'INITIAL'"};`);
    lines.push('');
    lines.push(`  getState(): ${safeName}State { return this.state; }`);
    lines.push('');
    for (const task of proc.tasks) {
      const methodName = `execute${task.name.replace(/\s+/g, '')}`;
      lines.push(`  async ${methodName}(): Promise<void> {`);
      lines.push(`    // ${task.type}: ${task.name}`);
      lines.push(`    // TODO: implement task logic`);
      lines.push(`  }`);
      lines.push('');
    }
    lines.push('}', '');
  }
  return lines.join('\n');
}

// ============================================
// FILE ASSEMBLY
// ============================================

function assembleTypeScriptFiles(
  specInfo: SpecInfo,
  targetLanguage: CodeGenTargetLanguage,
  outputDir: string,
  enabledComponents: Set<string>,
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const { models, endpoints, channels, protoMessages, protoServices, bpmnProcesses, technology } = specInfo;

  // For protobuf, synthesise model defs from proto messages
  const effectiveModels: ModelDef[] = technology === 'protobuf'
    ? protoMessages.map(m => ({
        name: m.name,
        properties: m.fields.map(f => ({ name: f.name, type: protoTypeToTs(f.type), required: true })),
      }))
    : models;

  // For asyncapi, synthesise endpoints from channels
  const effectiveEndpoints: EndpointDef[] = technology === 'asyncapi'
    ? channels.map(c => ({
        method: 'POST', path: `/${c.name}`, operationId: c.operationId,
        requestBody: 'body', responses: ['200'], tags: [],
      }))
    : endpoints;

  const push = (filePath: string, content: string, lang = 'typescript') => {
    files.push({ path: filePath, content, language: lang, size: content.length });
  };

  if (enabledComponents.has('models')) {
    let content: string;
    if (technology === 'protobuf') content = generateProtoTsInterfaces(protoMessages, protoServices);
    else if (technology === 'bpmn') content = generateBpmnWorkflowTs(bpmnProcesses);
    else content = generateTsInterfaces(effectiveModels);
    push(`${outputDir}/models.ts`, content);
  }

  if (enabledComponents.has('validators') && technology !== 'bpmn') {
    const content = generateZodValidators(effectiveModels);
    push(`${outputDir}/validators.ts`, content);
  }

  if (enabledComponents.has('routes')) {
    let content: string;
    let fileName = 'routes.ts';
    if (targetLanguage === 'typescript-express') {
      content = generateExpressRoutes(effectiveEndpoints, effectiveModels);
    } else if (targetLanguage === 'typescript-fastify') {
      content = generateFastifyRoutes(effectiveEndpoints, effectiveModels);
    } else if (targetLanguage === 'typescript-nestjs') {
      content = generateNestJsController(effectiveEndpoints, effectiveModels);
      fileName = 'app.controller.ts';
    } else {
      content = generateKoaRoutes(effectiveEndpoints, effectiveModels);
    }
    push(`${outputDir}/${fileName}`, content);
  }

  if (enabledComponents.has('services')) {
    let content: string;
    let fileName = 'services.ts';
    if (targetLanguage === 'typescript-nestjs') {
      content = generateNestJsService(effectiveModels);
      fileName = 'app.service.ts';
    } else {
      content = generateExpressServices(effectiveModels);
    }
    push(`${outputDir}/${fileName}`, content);
  }

  if (enabledComponents.has('modules') && targetLanguage === 'typescript-nestjs') {
    const content = generateNestJsModule();
    push(`${outputDir}/app.module.ts`, content);
  }

  if (enabledComponents.has('tests')) {
    const content = generateExpressTests(effectiveEndpoints);
    push(`${outputDir}/routes.test.ts`, content);
  }

  return files;
}

function assembleJavaFiles(
  specInfo: SpecInfo,
  outputDir: string,
  enabledComponents: Set<string>,
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const { models, endpoints, protoMessages, technology } = specInfo;
  const effectiveModels: ModelDef[] = technology === 'protobuf'
    ? protoMessages.map(m => ({
        name: m.name,
        properties: m.fields.map(f => ({ name: f.name, type: protoTypeToJava(f.type), required: true })),
      }))
    : models;

  const push = (filePath: string, content: string) => {
    files.push({ path: filePath, content, language: 'java', size: content.length });
  };

  if (enabledComponents.has('models')) {
    const content = technology === 'protobuf'
      ? generateProtoJavaClasses(protoMessages)
      : generateSpringModels(effectiveModels);
    push(`${outputDir}/models/Models.java`, content);
  }
  if (enabledComponents.has('routes')) {
    const content = generateSpringController(endpoints);
    push(`${outputDir}/controllers/AppController.java`, content);
  }
  if (enabledComponents.has('services')) {
    for (const model of effectiveModels) {
      const content = generateSpringServices([model]);
      push(`${outputDir}/services/${model.name}Service.java`, content);
    }
  }

  return files;
}

function assemblePythonFiles(
  specInfo: SpecInfo,
  targetLanguage: CodeGenTargetLanguage,
  outputDir: string,
  enabledComponents: Set<string>,
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const { models, endpoints, protoMessages, technology } = specInfo;
  const effectiveModels: ModelDef[] = technology === 'protobuf'
    ? protoMessages.map(m => ({
        name: m.name,
        properties: m.fields.map(f => ({ name: f.name, type: protoTypeToPython(f.type), required: true })),
      }))
    : models;

  const push = (filePath: string, content: string) => {
    files.push({ path: filePath, content, language: 'python', size: content.length });
  };

  if (enabledComponents.has('models')) {
    const content = technology === 'protobuf'
      ? generateProtoPythonModels(protoMessages)
      : targetLanguage === 'python-fastapi'
        ? generateFastApiModels(effectiveModels)
        : generateFlaskModels(effectiveModels);
    push(`${outputDir}/models.py`, content);
  }
  if (enabledComponents.has('routes')) {
    const content = targetLanguage === 'python-fastapi'
      ? generateFastApiRoutes(endpoints, effectiveModels)
      : generateFlaskRoutes(endpoints);
    push(`${outputDir}/routes.py`, content);
  }
  if (enabledComponents.has('services')) {
    const content = generateFastApiServices(effectiveModels);
    push(`${outputDir}/services.py`, content);
  }

  return files;
}

function assembleGoFiles(
  specInfo: SpecInfo,
  targetLanguage: CodeGenTargetLanguage,
  outputDir: string,
  enabledComponents: Set<string>,
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const { models, endpoints, protoMessages, technology } = specInfo;
  const effectiveModels: ModelDef[] = technology === 'protobuf'
    ? protoMessages.map(m => ({
        name: m.name,
        properties: m.fields.map(f => ({ name: f.name, type: protoTypeToGo(f.type), required: true })),
      }))
    : models;

  const push = (filePath: string, content: string) => {
    files.push({ path: filePath, content, language: 'go', size: content.length });
  };

  if (enabledComponents.has('models')) {
    const content = technology === 'protobuf'
      ? generateProtoGoStructs(protoMessages)
      : generateGoStructs(effectiveModels);
    push(`${outputDir}/models/models.go`, content);
  }

  if (enabledComponents.has('routes')) {
    const handlerContent = targetLanguage === 'go-gin'
      ? generateGinHandlers(endpoints)
      : generateEchoHandlers(endpoints);
    push(`${outputDir}/handlers/handlers.go`, handlerContent);

    const routerContent = targetLanguage === 'go-gin'
      ? generateGinRoutes(endpoints)
      : generateEchoRoutes(endpoints);
    push(`${outputDir}/routes/routes.go`, routerContent);
  }

  if (enabledComponents.has('services')) {
    const lines = ['package services', ''];
    for (const model of effectiveModels) {
      const lc = model.name.charAt(0).toLowerCase() + model.name.slice(1);
      lines.push(
        `type ${model.name}Service struct{}`,
        '',
        `func (s *${model.name}Service) FindAll() ([]*${model.name}, error) {`,
        '\t// TODO: implement',
        '\treturn nil, nil',
        '}',
        '',
        `var ${lc}Service = &${model.name}Service{}`,
        '',
      );
    }
    push(`${outputDir}/services/services.go`, lines.join('\n'));
  }

  return files;
}

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
          const titleMatch = content.match(/^\s*title:\s*["']?(.+?)["']?\s*$/m);
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
          const titleMatch = content.match(/^\s*title:\s*["']?(.+?)["']?\s*$/m);
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
        const resolvedFilePath = path.isAbsolute(file.path)
          ? file.path
          : path.join(baseOutputDir, path.basename(file.path));

        if (resolvedFilePath.includes('..') || !resolvedFilePath.startsWith(resolvedProject)) {
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
