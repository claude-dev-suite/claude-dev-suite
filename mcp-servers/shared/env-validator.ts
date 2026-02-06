/**
 * Centralized environment variable validation for MCP servers
 *
 * Usage:
 * ```typescript
 * import { validateEnv, EnvSchema } from '../shared/env-validator.js';
 *
 * const env = validateEnv({
 *   DATABASE_URL: { required: true, pattern: /^postgresql:\/\// },
 *   PORT: { required: false, default: '3000', transform: parseInt },
 * });
 * ```
 */

export interface EnvVarConfig {
  /** Whether the variable is required */
  required?: boolean;
  /** Default value if not provided */
  default?: string;
  /** Regex pattern to validate the value */
  pattern?: RegExp;
  /** Description for error messages */
  description?: string;
  /** Transform function to convert the value */
  transform?: (value: string) => unknown;
  /** Custom validator function */
  validate?: (value: string) => boolean | string;
}

export interface EnvSchema {
  [key: string]: EnvVarConfig;
}

export interface ValidationResult<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  errors?: string[];
  warnings?: string[];
}

/**
 * Validates environment variables against a schema
 */
export function validateEnv<T extends EnvSchema>(
  schema: T
): ValidationResult<{ [K in keyof T]: unknown }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: Record<string, unknown> = {};

  for (const [key, config] of Object.entries(schema)) {
    const value = process.env[key];

    // Check required
    if (config.required && !value) {
      errors.push(
        `Missing required environment variable: ${key}${
          config.description ? ` (${config.description})` : ''
        }`
      );
      continue;
    }

    // Use default if not provided
    const finalValue = value || config.default;

    if (!finalValue) {
      // Optional and not provided
      data[key] = undefined;
      continue;
    }

    // Pattern validation
    if (config.pattern && !config.pattern.test(finalValue)) {
      errors.push(
        `Invalid format for ${key}: expected pattern ${config.pattern}${
          config.description ? ` (${config.description})` : ''
        }`
      );
      continue;
    }

    // Custom validation
    if (config.validate) {
      const validationResult = config.validate(finalValue);
      if (validationResult !== true) {
        const message =
          typeof validationResult === 'string'
            ? validationResult
            : `Validation failed for ${key}`;
        errors.push(message);
        continue;
      }
    }

    // Transform
    if (config.transform) {
      try {
        data[key] = config.transform(finalValue);
      } catch (e) {
        errors.push(`Failed to transform ${key}: ${e}`);
      }
    } else {
      data[key] = finalValue;
    }
  }

  return {
    success: errors.length === 0,
    data: data as { [K in keyof T]: unknown },
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validates and throws if invalid
 */
export function requireEnv<T extends EnvSchema>(
  schema: T,
  serverName: string
): { [K in keyof T]: unknown } {
  const result = validateEnv(schema);

  if (!result.success) {
    console.error(`[${serverName}] Environment validation failed:`);
    result.errors?.forEach((err) => console.error(`  - ${err}`));
    throw new Error(`Environment validation failed for ${serverName}`);
  }

  if (result.warnings) {
    result.warnings.forEach((warn) =>
      console.error(`[${serverName}] Warning: ${warn}`)
    );
  }

  return result.data!;
}

// Common validation patterns
export const patterns = {
  url: /^https?:\/\/.+/,
  postgresUrl: /^postgres(ql)?:\/\/.+/,
  mysqlUrl: /^mysql:\/\/.+/,
  mongoUrl: /^mongodb(\+srv)?:\/\/.+/,
  port: /^\d+$/,
  token: /^.{10,}$/, // At least 10 characters
  githubToken: /^gh[ps]_[a-zA-Z0-9]{36,}$/,
};

// Pre-built schemas for common MCP servers
export const schemas = {
  documentation: {
    KB_REPO_URL: {
      required: false,
      pattern: patterns.url,
      description: 'Knowledge base Git repository URL',
    },
    KB_REPO_BRANCH: {
      required: false,
      default: 'main',
      description: 'Git branch to fetch from',
    },
    KB_CACHE_PATH: {
      required: false,
      description: 'Path to cache directory',
    },
    KB_CACHE_TTL: {
      required: false,
      default: '7200',
      transform: parseInt,
      description: 'Cache TTL in seconds',
    },
    KB_MODE: {
      required: false,
      default: 'auto',
      validate: (v: string) =>
        ['auto', 'git', 'bundled'].includes(v) ||
        'KB_MODE must be auto, git, or bundled',
      description: 'Knowledge base mode',
    },
  },

  databaseQuery: {
    DATABASE_URL: {
      required: true,
      pattern: /^(postgres|mysql|mongodb)/,
      description: 'Database connection URL',
    },
  },

  gitManager: {
    GIT_PROVIDER: {
      required: true,
      validate: (v: string) =>
        ['github', 'gitlab', 'bitbucket', 'azure-devops'].includes(v) ||
        'GIT_PROVIDER must be github, gitlab, bitbucket, or azure-devops',
      description: 'Git provider name',
    },
    GIT_REPO: {
      required: false,
      description: 'Repository in owner/repo format (legacy)',
    },
    GIT_REPOS: {
      required: false,
      description: 'Multiple repositories configuration (JSON)',
    },
    GIT_API_TOKEN: {
      required: true,
      pattern: patterns.token,
      description: 'API token for Git provider',
    },
  },

  apiExplorer: {
    API_ENDPOINTS: {
      required: true,
      description: 'API endpoints in alias:url format',
    },
  },
};
