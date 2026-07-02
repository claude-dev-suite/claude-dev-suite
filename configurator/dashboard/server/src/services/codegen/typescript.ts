// SPDX-License-Identifier: MIT
/**
 * Code Generator — TypeScript target family (Express, Fastify, NestJS, Koa)
 *
 * Includes the shared TypeScript generators (interfaces, Zod validators),
 * the Protobuf- and BPMN-derived TypeScript generators, and the TypeScript
 * file assembler.
 *
 * Extracted from codegen.service.ts (move refactor, no behaviour change).
 */

import type { CodeGenTargetLanguage, GeneratedFile } from '../../types/codegen.js';
import {
  protoTypeToTs,
  type ModelDef,
  type EndpointDef,
  type ProtoMessageDef,
  type ProtoServiceDef,
  type BpmnProcessDef,
  type SpecInfo,
} from './shared.js';

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

export function assembleTypeScriptFiles(
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
