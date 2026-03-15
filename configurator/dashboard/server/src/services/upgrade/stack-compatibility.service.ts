// SPDX-License-Identifier: MIT
/**
 * Stack Compatibility Service
 *
 * Checks if project stack is compatible with feature requirements.
 */

import * as path from 'path';
import { readJsonSync } from '../../utils/fs-utils.js';
import type { Feature, StackInfo } from '../../types/index.js';

export interface StackCompatibilityResult {
  compatible: boolean;
  reason?: string;
  missingPackages?: string[];
}

/**
 * Extract stack values from either StackInfo or legacy array format
 */
function getStackValues(
  stack: StackInfo | Record<string, string[]> | undefined,
  category: 'frontend' | 'backend' | 'database'
): string[] {
  if (!stack) return [];

  const value = stack[category];
  if (!value) return [];

  // Legacy array format: { frontend: ['react', 'nextjs'], backend: ['spring-boot'] }
  if (Array.isArray(value)) {
    return value.map(v => v.toLowerCase());
  }

  // New StackInfo format: { frontend: { framework: 'react', meta_framework: 'nextjs' } }
  const result: string[] = [];
  if (typeof value === 'object' && value !== null) {
    const obj = value as unknown as Record<string, string | undefined>;
    if (obj.framework) result.push(obj.framework.toLowerCase());
    if (obj.meta_framework) result.push(obj.meta_framework.toLowerCase());
    if (obj.runtime) result.push(obj.runtime.toLowerCase());
    if (obj.db_type) result.push(obj.db_type.toLowerCase());
    if (obj.orm) result.push(obj.orm.toLowerCase());
  }
  return result;
}

/**
 * Infer stack from installed agents when detectedStack is missing
 */
function inferStackFromAgents(
  installedAgents: string[]
): { frontend: string[]; backend: string[]; database: string[] } {
  const inferred = { frontend: [] as string[], backend: [] as string[], database: [] as string[] };

  // Frontend frameworks
  if (installedAgents.includes('react-expert')) inferred.frontend.push('react');
  if (installedAgents.includes('nextjs-expert')) inferred.frontend.push('nextjs', 'react');
  if (installedAgents.includes('vue-expert')) inferred.frontend.push('vue');
  if (installedAgents.includes('svelte-expert')) inferred.frontend.push('svelte');

  // Backend frameworks
  if (installedAgents.includes('spring-boot-expert')) inferred.backend.push('spring-boot');
  if (installedAgents.includes('nestjs-expert')) inferred.backend.push('nestjs');
  if (installedAgents.includes('fastapi-expert')) inferred.backend.push('fastapi');
  if (installedAgents.includes('go-expert')) inferred.backend.push('go');
  if (installedAgents.includes('rust-expert')) inferred.backend.push('rust');
  if (installedAgents.includes('deno-expert')) inferred.backend.push('deno');

  // Databases
  if (installedAgents.includes('sql-expert') || installedAgents.includes('prisma-expert')) {
    inferred.database.push('postgresql', 'mysql');
  }
  if (installedAgents.includes('mongodb-expert')) inferred.database.push('mongodb');

  return inferred;
}

/**
 * Check if stack matches requirements
 */
export function checkStackCompatibility(
  stack: StackInfo | Record<string, string[]> | undefined,
  requirements: Feature['stackRequirements'],
  projectPath: string,
  installedAgents?: string[]
): StackCompatibilityResult {
  if (!requirements) {
    return { compatible: true };
  }

  // Check requiresAny
  if (requirements.requiresAny) {
    let hasMatch = false;

    // Get stack values, inferring from agents if stack is missing
    let frontendValues = getStackValues(stack, 'frontend');
    let backendValues = getStackValues(stack, 'backend');
    let dbValues = getStackValues(stack, 'database');

    // If no stack info, infer from installed agents
    if (frontendValues.length === 0 && backendValues.length === 0 && dbValues.length === 0) {
      const inferred = inferStackFromAgents(installedAgents ?? []);
      frontendValues = inferred.frontend;
      backendValues = inferred.backend;
      dbValues = inferred.database;
    }

    if (requirements.requiresAny.frontend && frontendValues.length > 0) {
      hasMatch = requirements.requiresAny.frontend.some(
        f => frontendValues.some(v => v.includes(f.toLowerCase()) || f.toLowerCase().includes(v))
      );
    }

    if (!hasMatch && requirements.requiresAny.backend && backendValues.length > 0) {
      hasMatch = requirements.requiresAny.backend.some(
        b => backendValues.some(v => v.includes(b.toLowerCase()) || b.toLowerCase().includes(v))
      );
    }

    if (!hasMatch && requirements.requiresAny.database && dbValues.length > 0) {
      hasMatch = requirements.requiresAny.database.some(
        d => dbValues.some(v => v.includes(d.toLowerCase()) || d.toLowerCase().includes(v))
      );
    }

    if (!hasMatch) {
      return {
        compatible: false,
        reason: 'Project stack does not match feature requirements',
      };
    }
  }

  // Check requiresPackage (check package.json in root and common monorepo dirs)
  if (requirements.requiresPackage && requirements.requiresPackage.length > 0) {
    // Check multiple possible package.json locations for monorepos
    const packageJsonPaths = [
      path.join(projectPath, 'package.json'),
      path.join(projectPath, 'frontend', 'package.json'),
      path.join(projectPath, 'client', 'package.json'),
      path.join(projectPath, 'app', 'package.json'),
      path.join(projectPath, 'web', 'package.json'),
    ];

    type PackageJson = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    let packageJson: PackageJson | null = null;
    for (const pkgPath of packageJsonPaths) {
      packageJson = readJsonSync<PackageJson>(pkgPath);
      if (packageJson) break;
    }

    if (packageJson) {
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };
      // requiresPackage is a list of alternatives - only ONE needs to be installed
      const hasAnyPackage = requirements.requiresPackage.some(pkg => pkg in allDeps);

      if (!hasAnyPackage) {
        // None of the alternative packages are installed - return all as options
        return {
          compatible: true,
          missingPackages: requirements.requiresPackage,
        };
      }
      // At least one package is installed - requirement satisfied
    } else {
      return {
        compatible: false,
        reason: 'No package.json found',
      };
    }
  }

  return { compatible: true };
}
