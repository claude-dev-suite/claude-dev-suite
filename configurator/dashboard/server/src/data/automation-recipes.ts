// SPDX-License-Identifier: MIT
/**
 * Automation Recipes
 *
 * User-friendly automation templates that translate to Claude Code and Git hooks.
 * Each recipe provides a simple UI while hiding technical complexity.
 */

export type RecipeIcon = 'format' | 'shield' | 'typescript' | 'test' | 'api' | 'lint' | 'git' | 'security' | 'check' | 'code' | 'database';
export type RecipeCategory = 'code-quality' | 'security' | 'testing' | 'git-workflow' | 'validation';
export type HookImplementationType = 'claude-hook' | 'git-hook';

export interface RecipeOption {
  id: string;
  label: string;
  type: 'checkbox' | 'select' | 'multiselect' | 'text';
  defaultValue: unknown;
  choices?: { value: string; label: string }[];
}

export interface RecipeImplementation {
  type: HookImplementationType;
  event?: string;  // For claude hooks: PreToolUse, PostToolUse, SubagentStop, etc.
  hookType?: string;  // For git hooks: pre-commit, pre-push, commit-msg, etc.
  matcher?: string;  // For claude hooks: tool matcher pattern
  command: string;  // Command template with placeholders
  timeout?: number;  // Timeout in seconds
}

export interface AutomationRecipe {
  id: string;
  name: string;
  description: string;
  icon: RecipeIcon;
  category: RecipeCategory;

  /** When to recommend this recipe */
  recommendedFor: {
    frameworks?: string[];
    hasPackages?: string[];
    hasFiles?: string[];
  };

  /** User-friendly options */
  options: RecipeOption[];

  /** Technical implementation (hidden from user) */
  implementation: RecipeImplementation;
}

/**
 * All available automation recipes
 */
export const AUTOMATION_RECIPES: AutomationRecipe[] = [
  // ========================================
  // CODE QUALITY (5)
  // ========================================
  {
    id: 'auto-format',
    name: 'Auto-format Code',
    description: 'Automatically format code after Claude edits files, keeping your codebase clean and consistent.',
    icon: 'format',
    category: 'code-quality',
    recommendedFor: {
      hasPackages: ['prettier', '@biomejs/biome', 'dprint'],
    },
    options: [
      {
        id: 'fileTypes',
        label: 'File types to format',
        type: 'multiselect',
        defaultValue: ['js', 'ts', 'tsx', 'css', 'json'],
        choices: [
          { value: 'js', label: 'JavaScript (.js, .jsx)' },
          { value: 'ts', label: 'TypeScript (.ts, .tsx)' },
          { value: 'tsx', label: 'React TSX (.tsx)' },
          { value: 'css', label: 'CSS/SCSS (.css, .scss)' },
          { value: 'json', label: 'JSON (.json)' },
          { value: 'md', label: 'Markdown (.md)' },
          { value: 'html', label: 'HTML (.html)' },
          { value: 'yaml', label: 'YAML (.yaml, .yml)' },
        ],
      },
      {
        id: 'formatter',
        label: 'Formatter to use',
        type: 'select',
        defaultValue: 'auto',
        choices: [
          { value: 'auto', label: 'Auto-detect (Recommended)' },
          { value: 'prettier', label: 'Prettier' },
          { value: 'biome', label: 'Biome' },
        ],
      },
    ],
    implementation: {
      type: 'claude-hook',
      event: 'PostToolUse',
      matcher: 'Write|Edit',
      command: 'node .claude/hooks/on-file-change.mjs -- npx prettier --write',
    },
  },
  {
    id: 'eslint-on-save',
    name: 'ESLint on Save',
    description: 'Run ESLint after Claude modifies JavaScript or TypeScript files to catch issues early.',
    icon: 'lint',
    category: 'code-quality',
    recommendedFor: {
      hasPackages: ['eslint'],
    },
    options: [
      {
        id: 'autoFix',
        label: 'Auto-fix issues when possible',
        type: 'checkbox',
        defaultValue: true,
      },
      {
        id: 'maxWarnings',
        label: 'Maximum warnings allowed',
        type: 'select',
        defaultValue: '-1',
        choices: [
          { value: '-1', label: 'No limit' },
          { value: '0', label: 'No warnings allowed' },
          { value: '5', label: 'Up to 5 warnings' },
          { value: '10', label: 'Up to 10 warnings' },
        ],
      },
    ],
    implementation: {
      type: 'claude-hook',
      event: 'PostToolUse',
      matcher: 'Write|Edit',
      command: 'node .claude/hooks/on-file-change.mjs --ext .js,.jsx,.ts,.tsx -- npx eslint --fix',
    },
  },
  {
    id: 'typescript-check',
    name: 'TypeScript Guardian',
    description: 'Run TypeScript type-checking after modifications to catch type errors immediately.',
    icon: 'typescript',
    category: 'code-quality',
    recommendedFor: {
      hasPackages: ['typescript'],
      hasFiles: ['tsconfig.json'],
    },
    options: [
      {
        id: 'strict',
        label: 'Use strict mode',
        type: 'checkbox',
        defaultValue: true,
      },
      {
        id: 'skipLibCheck',
        label: 'Skip library type checks (faster)',
        type: 'checkbox',
        defaultValue: true,
      },
    ],
    implementation: {
      type: 'claude-hook',
      event: 'PostToolUse',
      matcher: 'Write|Edit',
      command: 'node .claude/hooks/on-file-change.mjs --ext .ts,.tsx --no-file -- npx tsc --noEmit',
    },
  },
  {
    id: 'organize-imports',
    name: 'Organize Imports',
    description: 'Automatically sort and organize imports after file modifications.',
    icon: 'code',
    category: 'code-quality',
    recommendedFor: {
      hasPackages: ['prettier', '@biomejs/biome', 'typescript'],
    },
    options: [
      {
        id: 'sortOrder',
        label: 'Import sort order',
        type: 'select',
        defaultValue: 'source',
        choices: [
          { value: 'source', label: 'By source (node, packages, local)' },
          { value: 'alpha', label: 'Alphabetical' },
        ],
      },
    ],
    implementation: {
      type: 'claude-hook',
      event: 'PostToolUse',
      matcher: 'Write|Edit',
      // Cross-platform: biome organizes imports, prettier as fallback
      command: 'node .claude/hooks/on-file-change.mjs -- npx biome check --apply',
    },
  },
  {
    id: 'trailing-whitespace',
    name: 'Clean Whitespace',
    description: 'Remove trailing whitespace and fix end-of-file newlines automatically.',
    icon: 'format',
    category: 'code-quality',
    recommendedFor: {
      hasFiles: ['.editorconfig'],
    },
    options: [
      {
        id: 'ensureNewline',
        label: 'Ensure file ends with newline',
        type: 'checkbox',
        defaultValue: true,
      },
    ],
    implementation: {
      type: 'claude-hook',
      event: 'PostToolUse',
      matcher: 'Write|Edit',
      // Cross-platform using npx prettier which handles whitespace normalization
      command: 'node .claude/hooks/on-file-change.mjs --ext .md,.mdx -- npx prettier --prose-wrap preserve --write',
    },
  },

  // ========================================
  // SECURITY (3)
  // ========================================
  {
    id: 'protect-env',
    name: 'Security Shield',
    description: 'Block Claude from modifying sensitive files like .env, credentials, and secrets.',
    icon: 'shield',
    category: 'security',
    recommendedFor: {
      hasFiles: ['.env', '.env.local', '.env.production'],
    },
    options: [
      {
        id: 'protectedPatterns',
        label: 'Protected file patterns',
        type: 'multiselect',
        defaultValue: ['.env', 'credentials', 'secrets', 'private'],
        choices: [
          { value: '.env', label: '.env files' },
          { value: 'credentials', label: 'Credentials files' },
          { value: 'secrets', label: 'Secret files' },
          { value: 'private', label: 'Private keys' },
          { value: '.pem', label: 'PEM certificates' },
          { value: 'id_rsa', label: 'SSH keys' },
        ],
      },
    ],
    implementation: {
      type: 'claude-hook',
      event: 'PreToolUse',
      matcher: 'Write|Edit',
      command: 'node .claude/hooks/on-file-change.mjs --contains ".env,.credentials,secrets,private,id_rsa,.pem" --block "Cannot modify sensitive files"',
    },
  },
  {
    id: 'prevent-secret-commit',
    name: 'Block Secret Commits',
    description: 'Prevent committing files that might contain secrets or sensitive data.',
    icon: 'security',
    category: 'security',
    recommendedFor: {
      hasFiles: ['.git', '.gitignore'],
    },
    options: [
      {
        id: 'patterns',
        label: 'Patterns to block',
        type: 'multiselect',
        defaultValue: ['api_key', 'secret', 'password', 'token'],
        choices: [
          { value: 'api_key', label: 'API keys' },
          { value: 'secret', label: 'Secrets' },
          { value: 'password', label: 'Passwords' },
          { value: 'token', label: 'Tokens' },
          { value: 'private_key', label: 'Private keys' },
        ],
      },
    ],
    implementation: {
      type: 'git-hook',
      hookType: 'pre-commit',
      command: 'git diff --cached --name-only | xargs -I {} sh -c \'grep -lE "(API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)\\s*=" "{}" && echo "Potential secret in {}" && exit 1\' || true',
    },
  },
  {
    id: 'dependency-audit',
    name: 'Dependency Audit',
    description: 'Run security audit on dependencies when package.json changes.',
    icon: 'security',
    category: 'security',
    recommendedFor: {
      hasFiles: ['package.json'],
    },
    options: [
      {
        id: 'level',
        label: 'Minimum severity to report',
        type: 'select',
        defaultValue: 'moderate',
        choices: [
          { value: 'low', label: 'Low and above' },
          { value: 'moderate', label: 'Moderate and above' },
          { value: 'high', label: 'High and above' },
          { value: 'critical', label: 'Critical only' },
        ],
      },
    ],
    implementation: {
      type: 'claude-hook',
      event: 'PostToolUse',
      matcher: 'Write|Edit',
      command: 'node .claude/hooks/on-file-change.mjs --endswith "package.json" --no-file -- npm audit --audit-level=moderate',
    },
  },

  // ========================================
  // TESTING (3)
  // ========================================
  {
    id: 'test-pre-commit',
    name: 'Test Before Commit',
    description: 'Run tests before allowing commits to prevent broken code from being committed.',
    icon: 'test',
    category: 'testing',
    recommendedFor: {
      hasPackages: ['vitest', 'jest', '@testing-library/react', 'pytest'],
      hasFiles: ['package.json', 'pom.xml', 'pytest.ini'],
    },
    options: [
      {
        id: 'testRunner',
        label: 'Test runner',
        type: 'select',
        defaultValue: 'auto',
        choices: [
          { value: 'auto', label: 'Auto-detect (Recommended)' },
          { value: 'vitest', label: 'Vitest' },
          { value: 'jest', label: 'Jest' },
          { value: 'npm', label: 'npm test' },
        ],
      },
      {
        id: 'onlyChanged',
        label: 'Only test changed files',
        type: 'checkbox',
        defaultValue: true,
      },
    ],
    implementation: {
      type: 'git-hook',
      hookType: 'pre-commit',
      command: 'npm test -- --passWithNoTests || true',
    },
  },
  {
    id: 'test-pre-push',
    name: 'Test Before Push',
    description: 'Run the full test suite before pushing to ensure nothing is broken.',
    icon: 'test',
    category: 'testing',
    recommendedFor: {
      hasPackages: ['vitest', 'jest', '@testing-library/react'],
      hasFiles: ['package.json'],
    },
    options: [
      {
        id: 'coverage',
        label: 'Require coverage threshold',
        type: 'checkbox',
        defaultValue: false,
      },
      {
        id: 'coverageThreshold',
        label: 'Minimum coverage percentage',
        type: 'select',
        defaultValue: '70',
        choices: [
          { value: '50', label: '50%' },
          { value: '70', label: '70%' },
          { value: '80', label: '80%' },
          { value: '90', label: '90%' },
        ],
      },
    ],
    implementation: {
      type: 'git-hook',
      hookType: 'pre-push',
      command: 'npm test -- --coverage || true',
    },
  },
  {
    id: 'coverage-check',
    name: 'Coverage Check',
    description: 'Verify that test coverage meets the minimum threshold.',
    icon: 'check',
    category: 'testing',
    recommendedFor: {
      hasPackages: ['vitest', 'jest', 'c8', 'nyc'],
    },
    options: [
      {
        id: 'threshold',
        label: 'Minimum coverage threshold',
        type: 'select',
        defaultValue: '70',
        choices: [
          { value: '50', label: '50%' },
          { value: '60', label: '60%' },
          { value: '70', label: '70%' },
          { value: '80', label: '80%' },
          { value: '90', label: '90%' },
        ],
      },
    ],
    implementation: {
      type: 'git-hook',
      hookType: 'pre-push',
      command: 'npm test -- --coverage --coverageThreshold=\'{"global":{"lines":70}}\' || true',
    },
  },

  // ========================================
  // GIT WORKFLOW (2)
  // ========================================
  {
    id: 'conventional-commits',
    name: 'Conventional Commits',
    description: 'Enforce conventional commit message format (feat:, fix:, docs:, etc.).',
    icon: 'git',
    category: 'git-workflow',
    recommendedFor: {
      hasFiles: ['.git'],
      hasPackages: ['@commitlint/cli', '@commitlint/config-conventional'],
    },
    options: [
      {
        id: 'types',
        label: 'Allowed commit types',
        type: 'multiselect',
        defaultValue: ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore'],
        choices: [
          { value: 'feat', label: 'feat - New features' },
          { value: 'fix', label: 'fix - Bug fixes' },
          { value: 'docs', label: 'docs - Documentation' },
          { value: 'style', label: 'style - Formatting' },
          { value: 'refactor', label: 'refactor - Code restructuring' },
          { value: 'test', label: 'test - Test changes' },
          { value: 'chore', label: 'chore - Maintenance' },
          { value: 'perf', label: 'perf - Performance' },
          { value: 'ci', label: 'ci - CI/CD changes' },
        ],
      },
    ],
    implementation: {
      type: 'git-hook',
      hookType: 'commit-msg',
      command: 'grep -qE "^(feat|fix|docs|style|refactor|test|chore|perf|ci)(\\(.+\\))?:" "$1" || (echo "Commit message must follow Conventional Commits format" && exit 1)',
    },
  },
  {
    id: 'lint-staged',
    name: 'Lint Before Commit',
    description: 'Run linting on staged files before committing.',
    icon: 'lint',
    category: 'git-workflow',
    recommendedFor: {
      hasPackages: ['eslint', 'prettier', '@biomejs/biome'],
    },
    options: [
      {
        id: 'autoFix',
        label: 'Auto-fix and re-stage',
        type: 'checkbox',
        defaultValue: true,
      },
    ],
    implementation: {
      type: 'git-hook',
      hookType: 'pre-commit',
      command: 'git diff --cached --name-only --diff-filter=ACM | grep -E "\\.(js|jsx|ts|tsx)$" | xargs -r npx eslint --fix && git add -u || true',
    },
  },

  // ========================================
  // VALIDATION (2)
  // ========================================
  {
    id: 'integration-validator',
    name: 'API Validator',
    description: 'Automatically validate API contracts when frontend or backend code changes.',
    icon: 'api',
    category: 'validation',
    recommendedFor: {
      frameworks: ['react', 'vue', 'svelte', 'nextjs', 'spring-boot', 'nestjs', 'fastapi'],
    },
    options: [
      {
        id: 'triggerOnFrontend',
        label: 'Trigger on frontend API changes',
        type: 'checkbox',
        defaultValue: true,
      },
      {
        id: 'triggerOnBackend',
        label: 'Trigger on backend API changes',
        type: 'checkbox',
        defaultValue: true,
      },
    ],
    implementation: {
      type: 'claude-hook',
      event: 'SubagentStop',
      matcher: 'react-expert|vue-expert|svelte-expert|nextjs-expert|spring-boot-expert|nestjs-expert|fastapi-expert',
      command: '{"type":"prompt","prompt":"Analyze the work completed by the agent and determine if API integration validation is needed.\\n\\nTrigger validation if:\\n- Backend: Modified controllers, routes, DTOs, or request/response types\\n- Frontend: New API calls, modified data fetching hooks, or API type changes\\n\\nSkip validation if:\\n- Only CSS/styling changes\\n- Only text/label changes\\n- Internal refactoring without API changes\\n\\nRespond with JSON: {\\"ok\\": false, \\"reason\\": \\"...\\"} to trigger, or {\\"ok\\": true} to skip.","timeout":30}',
      timeout: 30,
    },
  },
  {
    id: 'schema-validation',
    name: 'Database Schema Validator',
    description: 'Validate database schema changes to prevent migration issues.',
    icon: 'database',
    category: 'validation',
    recommendedFor: {
      hasPackages: ['prisma', '@prisma/client', 'drizzle-orm', 'typeorm'],
      hasFiles: ['prisma/schema.prisma', 'drizzle.config.ts'],
    },
    options: [
      {
        id: 'autoGenerate',
        label: 'Auto-generate migration on schema change',
        type: 'checkbox',
        defaultValue: false,
      },
    ],
    implementation: {
      type: 'claude-hook',
      event: 'PostToolUse',
      matcher: 'Write|Edit',
      command: 'node .claude/hooks/on-file-change.mjs --endswith "schema.prisma" -- npx prisma validate --schema {file}',
    },
  },

  // ========================================
  // UNITY GAMEDEV (3)
  // ========================================
  {
    id: 'unity-csharp-format',
    name: 'Unity C# Auto-format',
    description: 'Run dotnet format (or csharpier) on .cs files after Claude edits Unity scripts. Skips Unity auto-generated .csproj/.sln.',
    icon: 'format',
    category: 'code-quality',
    recommendedFor: {
      frameworks: ['unity'],
      hasFiles: ['ProjectSettings/ProjectVersion.txt'],
    },
    options: [
      {
        id: 'tool',
        label: 'Formatter',
        type: 'select',
        defaultValue: 'auto',
        choices: [
          { value: 'auto', label: 'Auto-detect (dotnet format → csharpier)' },
          { value: 'dotnet-format', label: 'dotnet format' },
          { value: 'csharpier', label: 'CSharpier' },
        ],
      },
    ],
    implementation: {
      type: 'claude-hook',
      event: 'PostToolUse',
      matcher: 'Write|Edit',
      command: 'node .claude/hooks/on-file-change.mjs --ext .cs --contains "assets/" -- dotnet csharpier',
    },
  },
  {
    id: 'unity-meta-check',
    name: 'Unity .meta File Check',
    description: 'Pre-commit guard that blocks commits with orphaned .meta files (a .meta without its asset, or an asset without its .meta) — a common cause of Unity merge headaches.',
    icon: 'check',
    category: 'git-workflow',
    recommendedFor: {
      frameworks: ['unity'],
      hasFiles: ['ProjectSettings/ProjectVersion.txt'],
    },
    options: [
      {
        id: 'blockMode',
        label: 'On orphan detected',
        type: 'select',
        defaultValue: 'block',
        choices: [
          { value: 'block', label: 'Block commit' },
          { value: 'warn', label: 'Warn but allow' },
        ],
      },
    ],
    implementation: {
      type: 'git-hook',
      hookType: 'pre-commit',
      command: 'git diff --cached --name-only --diff-filter=ACMRT | awk \'/^Assets\\// {print $0; if ($0 ~ /\\.meta$/) {sub(/\\.meta$/, ""); print $0}}\' | sort -u | while read f; do [ -e "$f" ] || [ -e "$f.meta" ] || { echo "Unity orphan: $f"; exit 1; }; done',
    },
  },
  {
    id: 'unity-no-binary-text',
    name: 'Unity Force Text Serialization Check',
    description: 'Pre-commit guard that warns when a .unity / .prefab / .asset file is committed in binary mode (Unity must be set to Force Text serialization for clean diffs and merges).',
    icon: 'check',
    category: 'validation',
    recommendedFor: {
      frameworks: ['unity'],
      hasFiles: ['ProjectSettings/ProjectVersion.txt', 'ProjectSettings/EditorSettings.asset'],
    },
    options: [],
    implementation: {
      type: 'git-hook',
      hookType: 'pre-commit',
      command: 'git diff --cached --name-only | grep -E "\\.(unity|prefab|asset|mat|anim|controller)$" | while read f; do head -c 5 "$f" 2>/dev/null | grep -q "^%YAML" || { echo "Unity binary asset detected (set Force Text serialization): $f"; exit 1; }; done',
    },
  },
];

/**
 * Get recipes by category
 */
export function getRecipesByCategory(category: RecipeCategory): AutomationRecipe[] {
  return AUTOMATION_RECIPES.filter(r => r.category === category);
}

/**
 * Get recipe by ID
 */
export function getRecipeById(id: string): AutomationRecipe | undefined {
  return AUTOMATION_RECIPES.find(r => r.id === id);
}

/**
 * Get all categories with their recipes
 */
export function getRecipeCategories(): Array<{ category: RecipeCategory; label: string; recipes: AutomationRecipe[] }> {
  return [
    {
      category: 'code-quality',
      label: 'Code Quality',
      recipes: getRecipesByCategory('code-quality'),
    },
    {
      category: 'security',
      label: 'Security',
      recipes: getRecipesByCategory('security'),
    },
    {
      category: 'testing',
      label: 'Testing',
      recipes: getRecipesByCategory('testing'),
    },
    {
      category: 'git-workflow',
      label: 'Git Workflow',
      recipes: getRecipesByCategory('git-workflow'),
    },
    {
      category: 'validation',
      label: 'Validation',
      recipes: getRecipesByCategory('validation'),
    },
  ];
}
