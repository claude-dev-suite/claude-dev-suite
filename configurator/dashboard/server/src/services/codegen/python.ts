// SPDX-License-Identifier: MIT
/**
 * Code Generator — Python target family (FastAPI, Flask)
 *
 * Extracted from codegen.service.ts (move refactor, no behaviour change).
 */

import type { CodeGenTargetLanguage, GeneratedFile } from '../../types/codegen.js';
import {
  openApiTypeToPython,
  protoTypeToPython,
  type ModelDef,
  type EndpointDef,
  type ProtoMessageDef,
  type SpecInfo,
} from './shared.js';

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
// CODE GENERATORS — Protobuf derived
// ============================================

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

// ============================================
// FILE ASSEMBLY
// ============================================

export function assemblePythonFiles(
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
