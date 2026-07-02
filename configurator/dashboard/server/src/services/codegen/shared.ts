// SPDX-License-Identifier: MIT
/**
 * Code Generator — shared internal types and type-conversion helpers
 *
 * Extracted from codegen.service.ts (move refactor, no behaviour change).
 */

import type { CodeGenTechnology } from '../../types/codegen.js';

// ============================================
// INTERNAL HELPER TYPES
// ============================================

export interface ModelDef {
  name: string;
  properties: Array<{ name: string; type: string; required: boolean }>;
}

export interface EndpointDef {
  method: string;
  path: string;
  operationId: string;
  requestBody: string | null;
  responses: string[];
  tags: string[];
}

export interface ChannelDef {
  name: string;
  operationId: string;
  messageType: string;
}

export interface ProtoMessageDef {
  name: string;
  fields: Array<{ name: string; type: string; number: number }>;
}

export interface ProtoServiceDef {
  name: string;
  methods: Array<{ name: string; inputType: string; outputType: string }>;
}

export interface BpmnProcessDef {
  id: string;
  name: string;
  tasks: Array<{ id: string; name: string; type: string }>;
}

export interface SpecInfo {
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

export function protoTypeToTs(t: string): string {
  const m: Record<string, string> = {
    string: 'string', bool: 'boolean',
    int32: 'number', int64: 'number', uint32: 'number', uint64: 'number',
    float: 'number', double: 'number', bytes: 'Uint8Array',
  };
  return m[t] ?? t;
}

export function protoTypeToJava(t: string): string {
  const m: Record<string, string> = {
    string: 'String', bool: 'Boolean',
    int32: 'Integer', int64: 'Long',
    uint32: 'Integer', uint64: 'Long',
    float: 'Float', double: 'Double', bytes: 'byte[]',
  };
  return m[t] ?? t;
}

export function protoTypeToPython(t: string): string {
  const m: Record<string, string> = {
    string: 'str', bool: 'bool',
    int32: 'int', int64: 'int', uint32: 'int', uint64: 'int',
    float: 'float', double: 'float', bytes: 'bytes',
  };
  return m[t] ?? t;
}

export function protoTypeToGo(t: string): string {
  const m: Record<string, string> = {
    string: 'string', bool: 'bool',
    int32: 'int32', int64: 'int64', uint32: 'uint32', uint64: 'uint64',
    float: 'float32', double: 'float64', bytes: '[]byte',
  };
  return m[t] ?? t;
}

export function openApiTypeToTs(schemaType: string, format?: string): string {
  if (format === 'date-time' || format === 'date') return 'string';
  if (format === 'binary') return 'Blob';
  const m: Record<string, string> = {
    integer: 'number', number: 'number', boolean: 'boolean',
    array: 'unknown[]', object: 'Record<string, unknown>',
  };
  return m[schemaType] ?? 'string';
}

export function openApiTypeToJava(schemaType: string, format?: string): string {
  if (format === 'date-time') return 'java.time.OffsetDateTime';
  if (format === 'date') return 'java.time.LocalDate';
  if (format === 'int64') return 'Long';
  const m: Record<string, string> = {
    integer: 'Integer', number: 'Double', boolean: 'Boolean',
    array: 'java.util.List<Object>', object: 'java.util.Map<String, Object>',
  };
  return m[schemaType] ?? 'String';
}

export function openApiTypeToPython(schemaType: string): string {
  const m: Record<string, string> = {
    integer: 'int', number: 'float', boolean: 'bool', array: 'list', object: 'dict',
  };
  return m[schemaType] ?? 'str';
}

export function openApiTypeToGo(schemaType: string, format?: string): string {
  if (format === 'int64') return 'int64';
  const m: Record<string, string> = {
    integer: 'int', number: 'float64', boolean: 'bool',
    array: '[]interface{}', object: 'map[string]interface{}',
  };
  return m[schemaType] ?? 'string';
}

/** Derive a safe operationId from method + path when none is present in the spec */
export function deriveOperationId(method: string, endpointPath: string): string {
  const segments = endpointPath
    .split('/')
    .filter(Boolean)
    .map(s => s.replace(/[{}]/g, '').replace(/-/g, '_'));
  return `${method.toLowerCase()}${segments.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}`;
}
