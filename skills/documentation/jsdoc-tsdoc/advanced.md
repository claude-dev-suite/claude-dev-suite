# JSDoc & TSDoc Advanced Patterns

## JSDoc for JavaScript - Type Annotations

### Typedef and Complex Types
```javascript
/**
 * @typedef {Object} User
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} [email] - Optional email
 * @property {boolean} active - Account status
 */

/**
 * Creates a new user.
 *
 * @param {string} name - User's name
 * @param {Object} [options] - Optional settings
 * @param {string} [options.email] - User's email
 * @param {boolean} [options.active=true] - Initial status
 * @returns {User} The created user
 */
function createUser(name, options = {}) {
  return {
    id: crypto.randomUUID(),
    name,
    email: options.email,
    active: options.active ?? true,
  };
}

/**
 * @template T
 * @param {T[]} items - Array of items
 * @param {(item: T) => boolean} predicate - Filter function
 * @returns {T | undefined} First matching item
 */
function find(items, predicate) {
  return items.find(predicate);
}
```

### Import Types in JSDoc
```javascript
/**
 * @typedef {import('./types').User} User
 * @typedef {import('express').Request} Request
 */

/**
 * @param {Request} req
 * @param {User} user
 */
function handleRequest(req, user) {
  // ...
}
```

## Documentation Generation

### TypeDoc Configuration
```bash
npm install --save-dev typedoc
```

```json
// typedoc.json
{
  "entryPoints": ["src/index.ts"],
  "out": "docs",
  "plugin": ["typedoc-plugin-markdown"],
  "excludePrivate": true,
  "excludeInternal": true,
  "readme": "README.md",
  "name": "My Library API",
  "includeVersion": true
}
```

```bash
npx typedoc
```

### API Extractor
```bash
npm install --save-dev @microsoft/api-extractor
```

```json
// api-extractor.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "mainEntryPointFilePath": "<projectFolder>/dist/index.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFolder": "<projectFolder>/api"
  },
  "docModel": {
    "enabled": true
  },
  "dtsRollup": {
    "enabled": true,
    "untrimmedFilePath": "<projectFolder>/dist/index.d.ts"
  }
}
```

## ESLint Plugin for TSDoc

```bash
npm install --save-dev eslint-plugin-tsdoc
```

```javascript
// eslint.config.mjs
import tsdocPlugin from 'eslint-plugin-tsdoc';

export default [
  {
    plugins: {
      tsdoc: tsdocPlugin,
    },
    rules: {
      'tsdoc/syntax': 'warn',
    },
  },
];
```

## Best Practices Examples

### Do's - Complete Function Documentation
```typescript
/**
 * Searches for users matching the given criteria.
 *
 * @remarks
 * Results are paginated with a default of 20 items per page.
 * Use the `page` and `limit` parameters for custom pagination.
 *
 * @param query - Search query (matches name, email)
 * @param options - Search options
 * @returns Paginated list of matching users
 *
 * @example
 * // Search by name
 * const results = await searchUsers('john');
 *
 * @example
 * // With pagination
 * const results = await searchUsers('john', { page: 2, limit: 50 });
 */
async function searchUsers(
  query: string,
  options?: SearchOptions
): Promise<PaginatedResponse<User>> {
  // ...
}
```

### Don'ts - Common Mistakes
```typescript
// DON'T: Redundant type information
/**
 * @param name {string} - The name  // Type already in TS
 * @returns {number} A number       // Type already in TS
 */
function greet(name: string): number { }

// DON'T: Obvious documentation
/**
 * Gets the user.           // Adds no value
 * @returns The user        // Adds no value
 */
function getUser(): User { }

// DON'T: Outdated documentation
/**
 * @param userId - The user ID  // Wrong! Parameter was renamed
 */
function getUser(id: string): User { }
```

## README Template

```markdown
# Package Name

Brief description of what this package does.

## Installation

\`\`\`bash
npm install package-name
\`\`\`

## Quick Start

\`\`\`typescript
import { MainClass } from 'package-name';

const instance = new MainClass({ option: 'value' });
const result = await instance.doSomething();
\`\`\`

## API Reference

See [API Documentation](./docs/README.md).

## License

MIT
```

## Complete Checklist

### Public API
- [ ] All exports documented
- [ ] Examples for main functions
- [ ] @remarks for complex logic
- [ ] @throws for exceptions
- [ ] @deprecated with migration path
- [ ] @see for related APIs

### Internal Code
- [ ] @internal tag used
- [ ] Complex algorithms explained
- [ ] Edge cases documented
- [ ] TODO comments tracked

### CI/CD
- [ ] eslint-plugin-tsdoc enabled
- [ ] TypeDoc or API Extractor in build
- [ ] API report checked for breaking changes
