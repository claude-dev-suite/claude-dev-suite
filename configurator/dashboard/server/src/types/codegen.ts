// SPDX-License-Identifier: MIT
/**
 * Code Generator Types
 */

export type CodeGenTechnology = 'openapi' | 'asyncapi' | 'typespec' | 'protobuf' | 'bpmn';

export type CodeGenTargetLanguage =
  | 'typescript-express'
  | 'typescript-fastify'
  | 'typescript-nestjs'
  | 'typescript-koa'
  | 'java-spring'
  | 'python-fastapi'
  | 'python-flask'
  | 'go-gin'
  | 'go-echo';

export interface CodeGenComponent {
  id: string;
  label: string;
  enabled: boolean;
}

export interface RefinementOptions {
  enabled: boolean;
  naming: boolean;
  codeStyle: boolean;
  errorHandling: boolean;
  testStubs: boolean;
}

export interface ValidationResult {
  valid: boolean;
  technology: CodeGenTechnology | null;
  version: string | null;
  errors: string[];
  warnings: string[];
  summary: {
    title?: string;
    endpoints?: number;
    models?: number;
    channels?: number;
    services?: number;
    messages?: number;
  };
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
  size: number;
}

export interface RefinedFile {
  path: string;
  originalContent: string;
  refinedContent: string;
  changes: string[];
  accepted: boolean | null;
}

export interface CodeGenResult {
  jobId: string;
  status: 'validating' | 'generating' | 'refining' | 'completed' | 'failed';
  generatedFiles: GeneratedFile[];
  refinedFiles: RefinedFile[];
  errors: string[];
}

export interface CodeGenPreview {
  files: Array<{
    path: string;
    language: string;
    estimatedSize: number;
  }>;
  totalFiles: number;
  components: string[];
}

export interface ProjectConventions {
  naming: {
    variables: 'camelCase' | 'snake_case' | 'unknown';
    files: 'kebab-case' | 'PascalCase' | 'camelCase' | 'unknown';
    components: 'PascalCase' | 'camelCase' | 'unknown';
  };
  imports: {
    style: 'relative' | 'alias' | 'unknown';
    aliasPrefix?: string;
  };
  errorHandling: {
    pattern: 'try-catch' | 'result-type' | 'error-boundary' | 'unknown';
    customErrorClass?: string;
  };
  formatting: {
    indent: 'tabs' | 'spaces' | 'unknown';
    indentSize: number;
    quotes: 'single' | 'double' | 'unknown';
    semicolons: boolean;
  };
}

export interface RefinementProfile {
  agentId: string;
  scopeConstraints: {
    allowed: string[];
    forbidden: string[];
  };
}

export interface CodeGenTargetInfo {
  id: CodeGenTargetLanguage;
  label: string;
  technologies: CodeGenTechnology[];
  components: CodeGenComponent[];
}

// Type guards
export function isCodeGenTechnology(value: unknown): value is CodeGenTechnology {
  return typeof value === 'string' && ['openapi', 'asyncapi', 'typespec', 'protobuf', 'bpmn'].includes(value);
}

export function isCodeGenTargetLanguage(value: unknown): value is CodeGenTargetLanguage {
  return typeof value === 'string' && [
    'typescript-express', 'typescript-fastify', 'typescript-nestjs', 'typescript-koa',
    'java-spring', 'python-fastapi', 'python-flask', 'go-gin', 'go-echo',
  ].includes(value);
}
