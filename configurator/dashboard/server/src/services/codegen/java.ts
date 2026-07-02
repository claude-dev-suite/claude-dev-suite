// SPDX-License-Identifier: MIT
/**
 * Code Generator — Java target family (Spring Boot)
 *
 * Extracted from codegen.service.ts (move refactor, no behaviour change).
 */

import type { GeneratedFile } from '../../types/codegen.js';
import {
  openApiTypeToJava,
  protoTypeToJava,
  type ModelDef,
  type EndpointDef,
  type ProtoMessageDef,
  type SpecInfo,
} from './shared.js';

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
// CODE GENERATORS — Protobuf derived
// ============================================

function generateProtoJavaClasses(messages: ProtoMessageDef[]): string {
  return messages.map(msg => {
    const props = msg.fields.map(f => `  private ${protoTypeToJava(f.type)} ${f.name};`).join('\n');
    return ['import lombok.Data;', '@Data', `public class ${msg.name} {`, props, '}'].join('\n');
  }).join('\n\n');
}

// ============================================
// FILE ASSEMBLY
// ============================================

export function assembleJavaFiles(
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
