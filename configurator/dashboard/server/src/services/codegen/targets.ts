// SPDX-License-Identifier: MIT
/**
 * Code Generator — static target catalog and refinement profiles
 *
 * Extracted from codegen.service.ts (move refactor, no behaviour change).
 */

import type {
  CodeGenTargetLanguage,
  CodeGenTargetInfo,
  RefinementProfile,
} from '../../types/codegen.js';

// ============================================
// STATIC DATA STRUCTURES
// ============================================

/** All available code-generation targets with their supported component lists */
export const TARGETS: CodeGenTargetInfo[] = [
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
export const REFINEMENT_PROFILES: Record<CodeGenTargetLanguage, RefinementProfile> = {
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
