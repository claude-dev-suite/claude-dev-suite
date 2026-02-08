---
name: javascript
description: |
  JavaScript language fundamentals. Covers ES6+, modules, async patterns.
  Use when working with plain JS projects without TypeScript.

  USE WHEN: user mentions "javascript", "ES6", "async/await", "promises", "modules",
  asks about "destructuring", "spread operator", "arrow functions", "ESM vs CommonJS"

  DO NOT USE FOR: TypeScript projects - use `typescript` skill instead
  DO NOT USE FOR: Node.js runtime - use `nodejs` skill instead
  DO NOT USE FOR: Browser APIs - use framework-specific skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# JavaScript Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `javascript` for comprehensive documentation.

## ES6+ Features

```javascript
// Destructuring
const { name, age = 18 } = user;
const [first, ...rest] = items;

// Spread operator
const merged = { ...defaults, ...options };
const combined = [...arr1, ...arr2];

// Template literals
const message = `Hello ${name}, you are ${age} years old`;

// Arrow functions
const add = (a, b) => a + b;
const fetchUser = async (id) => {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
};

// Optional chaining & nullish coalescing
const city = user?.address?.city ?? 'Unknown';

// Logical assignment
user.name ||= 'Anonymous';   // Assign if falsy
user.data ??= {};            // Assign if null/undefined
user.count &&= user.count++; // Assign if truthy
```

## Modules (ESM vs CommonJS)

```javascript
// ESM (package.json: "type": "module")
import { readFile } from 'fs/promises';
import config from './config.js';
export const helper = () => {};
export default class Service {}

// CommonJS (default Node.js, .cjs)
const { readFile } = require('fs/promises');
const config = require('./config');
module.exports = { helper };
module.exports = Service;

// Dynamic imports (both)
const module = await import('./dynamic.js');
```

### Module Interop Issues

```javascript
// Importing CommonJS from ESM
import pkg from 'cjs-package';       // Default export = module.exports
import { named } from 'cjs-package'; // May not work!

// Fix: use createRequire
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cjsModule = require('cjs-package');

// __dirname / __filename in ESM
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

## Async Patterns

```javascript
// Promises
fetch('/api/data')
  .then(res => res.json())
  .then(data => console.log(data))
  .catch(err => console.error(err))
  .finally(() => cleanup());

// Async/await
async function fetchData() {
  try {
    const response = await fetch('/api/data');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Fetch failed:', error);
    throw error;
  }
}

// Parallel execution
const [users, products] = await Promise.all([
  fetch('/api/users').then(r => r.json()),
  fetch('/api/products').then(r => r.json()),
]);

// Promise utilities
await Promise.allSettled(promises);  // Never rejects
const first = await Promise.race(promises);
const firstSuccess = await Promise.any(promises);
```

## Array Methods

```javascript
// Transform
const doubled = items.map(x => x * 2);
const names = users.map(u => u.name);

// Filter
const adults = users.filter(u => u.age >= 18);
const unique = [...new Set(items)];

// Find
const user = users.find(u => u.id === id);
const index = users.findIndex(u => u.id === id);
const exists = users.some(u => u.active);
const allActive = users.every(u => u.active);

// Reduce
const total = items.reduce((sum, x) => sum + x, 0);
const grouped = items.reduce((acc, item) => {
  (acc[item.category] ||= []).push(item);
  return acc;
}, {});

// Flat & FlatMap
const flat = [[1, 2], [3, 4]].flat();
const expanded = users.flatMap(u => u.orders);

// At (negative indexing)
const last = items.at(-1);
const secondLast = items.at(-2);
```

## Object Methods

```javascript
// Entries/Keys/Values
Object.keys(obj);    // ['a', 'b']
Object.values(obj);  // [1, 2]
Object.entries(obj); // [['a', 1], ['b', 2]]

// From entries
const obj = Object.fromEntries([['a', 1], ['b', 2]]);

// Assign & spread
const merged = Object.assign({}, defaults, options);
const merged2 = { ...defaults, ...options };

// Property descriptors
Object.defineProperty(obj, 'readonly', {
  value: 42,
  writable: false,
  enumerable: true,
});

// Freeze/Seal
Object.freeze(obj);  // No changes at all
Object.seal(obj);    // No add/delete, can modify
```

## Classes

```javascript
class Service {
  #privateField = 'secret';  // Private field
  static count = 0;          // Static field

  constructor(name) {
    this.name = name;
    Service.count++;
  }

  // Instance method
  greet() {
    return `Hello, ${this.name}`;
  }

  // Private method
  #validate() {
    return this.#privateField.length > 0;
  }

  // Getter/Setter
  get upperName() {
    return this.name.toUpperCase();
  }

  set upperName(value) {
    this.name = value.toLowerCase();
  }

  // Static method
  static getCount() {
    return Service.count;
  }
}

// Inheritance
class Admin extends Service {
  constructor(name, role) {
    super(name);
    this.role = role;
  }
}
```

## Error Handling

```javascript
// Custom error
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

// Try/catch with specific handling
try {
  const data = JSON.parse(input);
} catch (error) {
  if (error instanceof SyntaxError) {
    console.error('Invalid JSON');
  } else if (error instanceof ValidationError) {
    console.error(`Validation failed: ${error.field}`);
  } else {
    throw error; // Re-throw unknown errors
  }
}

// Error cause (ES2022)
try {
  await fetchData();
} catch (error) {
  throw new Error('Failed to load data', { cause: error });
}
```

---

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| TypeScript project | `typescript` skill |
| Node.js runtime internals | `nodejs` skill |
| Frontend frameworks | `frontend-react`, `frontend-vue`, etc. |
| Build tooling | `vite`, `webpack`, etc. skills |
| Testing | `testing-vitest`, `testing-jest` skills |

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using `var` | Function scope, hoisting issues | Use `const` or `let` |
| `==` instead of `===` | Type coercion bugs | Always use `===` |
| Mutating function parameters | Side effects, hard to debug | Return new object/array |
| Missing `await` on Promise | Unhandled rejections | Always await or .catch() |
| Mixing ESM and CommonJS | Module system conflicts | Choose one, prefer ESM |
| Callback hell | Unreadable code | Use async/await |
| Not handling Promise rejections | Silent failures | Add .catch() or try/catch |
| Global variables | Namespace pollution | Use modules |

---

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "X is not defined" | Variable not declared | Check spelling, imports |
| "Cannot read property of undefined" | Object is undefined | Use optional chaining ?. |
| "Promise rejected but not handled" | Missing .catch() | Add error handling |
| "Module not found" | Wrong import path | Check file path, extension |
| "Unexpected token" | Syntax error | Check for missing brackets, commas |
| "This is undefined" | Arrow function context | Use regular function or bind |
| Memory leak in event listeners | Not removing listeners | Use removeEventListener |
| Slow performance with large arrays | Inefficient algorithms | Use appropriate data structures |

---

## When to Use JS vs TypeScript

| Scenario | Choice |
|----------|--------|
| New project | TypeScript |
| Quick scripts | JavaScript |
| Legacy codebase | JavaScript (gradual migration) |
| Public libraries | TypeScript with .d.ts |
| Prototype/MVP | JavaScript ok |

---

## Reference Documentation
- [JavaScript Info](https://javascript.info/)
- [MDN JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
- [Node.js ES Modules](https://nodejs.org/api/esm.html)

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `javascript` for comprehensive documentation.
