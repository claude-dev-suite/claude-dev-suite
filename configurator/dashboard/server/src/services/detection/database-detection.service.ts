// SPDX-License-Identifier: MIT
/**
 * Database Detection Service
 *
 * Detects database type and ORM from various project configurations.
 */

import type { DetectionResult } from '../../types.js';
import { fileExists, fileContains } from '../../utils/fs-utils.js';
import { DOCKER_DB_RULES } from './detection.constants.js';

// Spring Boot database patterns
const SPRING_DB_PATTERNS = [
  { pattern: 'jdbc:postgresql', value: 'postgresql' },
  { pattern: 'jdbc:mysql', value: 'mysql' },
  { pattern: 'jdbc:mariadb', value: 'mysql' },
  { pattern: 'jdbc:h2', value: 'h2' },
  { pattern: 'jdbc:sqlserver', value: 'mssql' },
  { pattern: 'jdbc:oracle', value: 'oracle' },
  { pattern: 'mongodb://', value: 'mongodb' },
  { pattern: 'spring.data.mongodb', value: 'mongodb' },
  { pattern: 'spring.redis', value: 'redis' },
] as const;

// Prisma provider patterns
const PRISMA_PROVIDER_PATTERNS = [
  { pattern: 'provider = "postgresql"', value: 'postgresql' },
  { pattern: 'provider = "postgres"', value: 'postgresql' },
  { pattern: "provider = 'postgresql'", value: 'postgresql' },
  { pattern: "provider = 'postgres'", value: 'postgresql' },
  { pattern: 'provider = "mysql"', value: 'mysql' },
  { pattern: "provider = 'mysql'", value: 'mysql' },
  { pattern: 'provider = "sqlite"', value: 'sqlite' },
  { pattern: "provider = 'sqlite'", value: 'sqlite' },
  { pattern: 'provider = "mongodb"', value: 'mongodb' },
  { pattern: "provider = 'mongodb'", value: 'mongodb' },
  { pattern: 'provider = "sqlserver"', value: 'mssql' },
  { pattern: "provider = 'sqlserver'", value: 'mssql' },
  { pattern: 'provider = "cockroachdb"', value: 'cockroachdb' },
  { pattern: "provider = 'cockroachdb'", value: 'cockroachdb' },
] as const;

export class DatabaseDetectionService {
  /**
   * Detect database from Docker Compose files
   */
  detectFromDocker(dirsToCheck: string[], result: DetectionResult): void {
    const composeFiles = [
      'docker-compose.yml',
      'docker-compose.yaml',
      'docker-compose.dev.yml',
      'docker-compose.prod.yml',
    ];

    for (const checkPath of dirsToCheck) {
      for (const composeFile of composeFiles) {
        if (fileExists(checkPath, composeFile)) {
          for (const rule of DOCKER_DB_RULES) {
            if (fileContains(checkPath, composeFile, rule.pattern) && !result.database?.dbType) {
              result.database = { ...result.database, dbType: rule.value };
              result.confidence += 10;
              return;
            }
          }
        }
      }
    }
  }

  /**
   * Detect database from Spring Boot configuration files
   */
  detectFromSpringConfig(dirsToCheck: string[], result: DetectionResult): void {
    if (result.database?.dbType) return;

    const configFiles = [
      'application.properties',
      'application.yml',
      'application.yaml',
      'src/main/resources/application.properties',
      'src/main/resources/application.yml',
      'src/main/resources/application.yaml',
    ];

    for (const checkPath of dirsToCheck) {
      for (const configFile of configFiles) {
        if (fileExists(checkPath, configFile)) {
          for (const rule of SPRING_DB_PATTERNS) {
            if (fileContains(checkPath, configFile, rule.pattern)) {
              result.database = { ...result.database, dbType: rule.value };
              result.confidence += 10;
              return;
            }
          }
        }
      }
    }
  }

  /**
   * Detect database from Prisma schema file
   */
  detectFromPrismaSchema(dirsToCheck: string[], result: DetectionResult): void {
    if (result.database?.dbType) return;

    const schemaFiles = ['prisma/schema.prisma', 'schema.prisma'];

    for (const checkPath of dirsToCheck) {
      for (const schemaFile of schemaFiles) {
        if (fileExists(checkPath, schemaFile)) {
          for (const rule of PRISMA_PROVIDER_PATTERNS) {
            if (fileContains(checkPath, schemaFile, rule.pattern)) {
              result.database = { ...result.database, dbType: rule.value };
              result.confidence += 10;
              return;
            }
          }
        }
      }
    }
  }

  /**
   * Run all database detection methods
   */
  detectAll(dirsToCheck: string[], result: DetectionResult): void {
    this.detectFromDocker(dirsToCheck, result);
    this.detectFromSpringConfig(dirsToCheck, result);
    this.detectFromPrismaSchema(dirsToCheck, result);
  }
}
