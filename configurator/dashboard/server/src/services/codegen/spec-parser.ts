// SPDX-License-Identifier: MIT
/**
 * Code Generator — spec parsing (OpenAPI, AsyncAPI, TypeSpec, Protobuf, BPMN)
 *
 * Extracted from codegen.service.ts (move refactor, no behaviour change).
 */

import type { CodeGenTechnology } from '../../types/codegen.js';
import {
  deriveOperationId,
  openApiTypeToTs,
  type ModelDef,
  type EndpointDef,
  type ChannelDef,
  type ProtoMessageDef,
  type ProtoServiceDef,
  type BpmnProcessDef,
  type SpecInfo,
} from './shared.js';

// ============================================
// SPEC PARSING
// ============================================

/**
 * Trim a YAML-fallback scalar and strip one pair of surrounding quotes.
 * Done in JS (not in the regex) to keep the extraction regexes linear-time
 * on untrusted spec content.
 */
function stripYamlScalar(raw: string): string {
  return raw.trim().replace(/^["']/, '').replace(/["']$/, '');
}

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
    // YAML fallback — regex-based extraction (no YAML parser dependency).
    // The capture starts with a non-blank char so it cannot overlap the
    // preceding [ \t]* (linear-time on untrusted spec content); quotes are
    // stripped in JS.
    const titleMatch = content.match(/^[ \t]*title:[ \t]*([^ \t\r\n][^\r\n]*)$/m);
    if (titleMatch?.[1]) title = stripYamlScalar(titleMatch[1]);
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
    const titleMatch = content.match(/^[ \t]*title:[ \t]*([^ \t\r\n][^\r\n]*)$/m);
    if (titleMatch?.[1]) title = stripYamlScalar(titleMatch[1]);
    const versionMatch = content.match(/asyncapi:\s*["']?([0-9.]+)["']?/i);
    if (versionMatch?.[1]) version = versionMatch[1];
    const channelRe = /^(\s{0,2})([\w./{}:-]+):[ \t]*$/gm;
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

  // [^{}]* (not [^}]*) keeps the scan linear on unbalanced braces (CodeQL js/polynomial-redos)
  const modelRe = /model\s+(\w+)\s*\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(content)) !== null) {
    const name = m[1] ?? '';
    const body = m[2] ?? '';
    const propRe = /^[ \t]*(\w+)(\?)?[ \t]*:[ \t]*([\w\[\]]+)[ \t]*$/gm;
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

  // [^{}]* (not [^}]*) keeps the scan linear on unbalanced braces (CodeQL js/polynomial-redos)
  const msgRe = /message\s+(\w+)\s*\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = msgRe.exec(content)) !== null) {
    const name = m[1] ?? '';
    const body = m[2] ?? '';
    const fieldRe = /^[ \t]*(?:repeated[ \t]+)?(\w+)[ \t]+(\w+)[ \t]*=[ \t]*(\d+)[ \t]*;[ \t]*$/gm;
    const fields: ProtoMessageDef['fields'] = [];
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(body)) !== null) {
      fields.push({ type: fm[1] ?? 'string', name: fm[2] ?? '', number: parseInt(fm[3] ?? '0', 10) });
    }
    protoMessages.push({ name, fields });
  }

  const svcRe = /service\s+(\w+)\s*\{([^{}]*)\}/g;
  while ((m = svcRe.exec(content)) !== null) {
    const name = m[1] ?? '';
    const body = m[2] ?? '';
    const rpcRe = /rpc[ \t]+(\w+)[ \t]*\([ \t]*(\w+)[ \t]*\)[ \t]*returns[ \t]*\([ \t]*(\w+)[ \t]*\)/g;
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

  const processRe = /<(?:bpmn2?:)?process\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = processRe.exec(content)) !== null) {
    const attrs = m[1] ?? '';
    const idMatch = attrs.match(/\bid=["']([^"']+)["']/);
    if (!idMatch) continue;
    const id = idMatch[1] ?? '';
    const nameMatch = attrs.match(/\bname=["']([^"']+)["']/);
    const name = nameMatch?.[1] ?? id;
    const tasks: BpmnProcessDef['tasks'] = [];

    const svcRe = /<(?:bpmn2?:)?serviceTask\b([^>]*)>/g;
    let tm: RegExpExecArray | null;
    while ((tm = svcRe.exec(content)) !== null) {
      const svcAttrs = tm[1] ?? '';
      const svcIdMatch = svcAttrs.match(/\bid=["']([^"']+)["']/);
      if (!svcIdMatch) continue;
      const svcId = svcIdMatch[1] ?? '';
      const svcNameMatch = svcAttrs.match(/\bname=["']([^"']+)["']/);
      const svcName = svcNameMatch?.[1] ?? svcId;
      tasks.push({ id: svcId, name: svcName, type: 'serviceTask' });
    }

    const userRe = /<(?:bpmn2?:)?userTask\b([^>]*)>/g;
    while ((tm = userRe.exec(content)) !== null) {
      const userAttrs = tm[1] ?? '';
      const userIdMatch = userAttrs.match(/\bid=["']([^"']+)["']/);
      if (!userIdMatch) continue;
      const userId = userIdMatch[1] ?? '';
      const userNameMatch = userAttrs.match(/\bname=["']([^"']+)["']/);
      const userName = userNameMatch?.[1] ?? userId;
      tasks.push({ id: userId, name: userName, type: 'userTask' });
    }

    bpmnProcesses.push({ id, name, tasks });
  }

  if (bpmnProcesses.length === 0) {
    bpmnProcesses.push({ id: 'process_1', name: 'Process', tasks: [] });
  }

  return { title: bpmnProcesses[0]?.name ?? 'Workflow', version: null, bpmnProcesses };
}

export function buildSpecInfo(content: string, technology: CodeGenTechnology): SpecInfo {
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
