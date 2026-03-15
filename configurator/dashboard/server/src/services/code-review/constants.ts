// SPDX-License-Identifier: MIT
/**
 * Code Review Constants
 */

import type { ReviewOption } from './types.js';

export const REVIEW_OPTIONS: Record<string, ReviewOption> = {
  security: {
    label: 'Security',
    agentId: 'security-expert',
    description: 'OWASP Top 10, SQL injection, XSS, secrets exposure',
    taskPrompt: `Analyze the codebase for security vulnerabilities.

Use the Read, Grep, and Glob tools to explore the source files.
Focus on:
- OWASP Top 10 vulnerabilities
- Injection attacks (SQL, NoSQL, Command, XSS)
- Authentication and authorization flaws
- Exposed secrets and credentials
- Insecure cryptographic practices
- Path traversal vulnerabilities

Output findings in format: [SEVERITY] file:line - description
Where SEVERITY is one of: CRITICAL, HIGH, MEDIUM, LOW, INFO`,
  },
  performance: {
    label: 'Performance',
    agentId: 'performance-expert',
    description: 'N+1 queries, memory leaks, bottlenecks',
    taskPrompt: `Analyze the codebase for performance issues.

Use the Read, Grep, and Glob tools to explore the source files.
Look for:
- N+1 query patterns
- Memory leaks and inefficient memory usage
- Blocking operations in async contexts
- Inefficient algorithms or data structures
- Unnecessary re-renders (React/Vue)
- Missing caching opportunities

Output findings in format: [SEVERITY] file:line - description
Where SEVERITY is one of: CRITICAL, HIGH, MEDIUM, LOW, INFO`,
  },
  quality: {
    label: 'Code Quality',
    agentId: 'qa-expert',
    description: 'Code smells, complexity, duplication',
    taskPrompt: `Analyze the codebase for code quality issues.

Use the Read, Grep, and Glob tools to explore the source files.
Check for:
- Code smells (bloaters, complexity, coupling)
- High cyclomatic/cognitive complexity
- Code duplication
- Missing error handling
- Dead code
- Maintainability issues

Output findings in format: [SEVERITY] file:line - description
Where SEVERITY is one of: CRITICAL, HIGH, MEDIUM, LOW, INFO`,
  },
  bestPractices: {
    label: 'Best Practices',
    agentId: 'code-reviewer',
    description: 'Clean code, SOLID, error handling',
    taskPrompt: `Analyze the codebase for best practices adherence.

Use the Read, Grep, and Glob tools to explore the source files.
Check:
- Naming conventions (clear, descriptive names)
- SOLID principles adherence
- Error handling patterns
- Code organization and structure
- Documentation where needed
- Consistent code style

Output findings in format: [SEVERITY] file:line - description
Where SEVERITY is one of: CRITICAL, HIGH, MEDIUM, LOW, INFO`,
  },
  architecture: {
    label: 'Architecture',
    agentId: 'architect',
    description: 'Design patterns, coupling, API design',
    taskPrompt: `Evaluate the architectural quality of the codebase.

Use the Read, Grep, and Glob tools to explore the source files.
Check:
- Separation of concerns
- Coupling and cohesion
- Design pattern usage
- API design quality
- Dependency direction
- Scalability considerations

Output findings in format: [SEVERITY] file:line - description
Where SEVERITY is one of: CRITICAL, HIGH, MEDIUM, LOW, INFO`,
  },
};

export const SOURCE_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.vue', '.svelte', '.astro',
  '.py',
  '.java', '.kt', '.scala', '.groovy',
  '.go', '.rs', '.c', '.cpp', '.h', '.hpp',
  '.rb', '.php', '.cs', '.swift', '.dart',
  '.json', '.yaml', '.yml', '.toml', '.xml', '.properties',
  '.env', '.env.example', '.env.local',
  '.dockerfile',
  '.sh', '.bash', '.zsh', '.ps1',
  '.html', '.css', '.scss', '.less',
  '.sql',
]);

export const INCLUDE_FILES = new Set([
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  'Makefile', 'Jenkinsfile', 'Vagrantfile',
  '.gitignore', '.dockerignore', '.npmrc', '.nvmrc',
  'nginx.conf', 'httpd.conf',
]);

export const EXCLUDED_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', 'vendor',
  '__pycache__', '.venv', 'venv', 'env',
  'target', 'out', 'bin', 'obj',
  '.next', '.nuxt', '.svelte-kit',
  'coverage', '.nyc_output',
]);

export const SEVERITY_LEVELS: Record<string, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};
