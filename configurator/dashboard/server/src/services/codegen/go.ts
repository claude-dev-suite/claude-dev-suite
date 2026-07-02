// SPDX-License-Identifier: MIT
/**
 * Code Generator — Go target family (Gin, Echo)
 *
 * Extracted from codegen.service.ts (move refactor, no behaviour change).
 */

import type { CodeGenTargetLanguage, GeneratedFile } from '../../types/codegen.js';
import {
  openApiTypeToGo,
  protoTypeToGo,
  type ModelDef,
  type EndpointDef,
  type ProtoMessageDef,
  type SpecInfo,
} from './shared.js';

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
// FILE ASSEMBLY
// ============================================

export function assembleGoFiles(
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
