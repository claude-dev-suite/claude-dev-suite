---
name: jsdoc
description: |
  JSDoc - documentation generator for JavaScript with type annotations.

  USE WHEN: user mentions "JSDoc", "JavaScript documentation", asks about "documenting JavaScript", "type hints", "jsdoc comments", "API documentation generation"

  DO NOT USE FOR: TypeScript - use `jsdoc-tsdoc` skill for TypeScript/TSDoc
allowed-tools: Read, Grep, Glob, Write, Edit
---
# JSDoc - Quick Reference

## When NOT to Use This Skill

- **TypeScript projects** - Use the `jsdoc-tsdoc` skill for TSDoc and TypeScript-specific patterns
- **JSDoc generation config** - This is for writing JSDoc comments, not configuring the tool
- **Complex type systems** - TypeScript provides better type checking than JSDoc annotations
- **API documentation hosting** - Use documentation platforms (TypeDoc, Docusaurus, etc.)

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `jsdoc` for comprehensive tag reference, type expressions, and generation options.

## Pattern Essenziali

### Function Documentation
```javascript
/**
 * Calculates the sum of two numbers.
 * @param {number} a - The first number
 * @param {number} b - The second number
 * @returns {number} The sum of a and b
 * @example
 * const result = add(2, 3); // 5
 */
function add(a, b) {
  return a + b;
}
```

### Object Types
```javascript
/**
 * @typedef {Object} User
 * @property {string} id - Unique identifier
 * @property {string} name - Full name
 * @property {string} email - Email address
 * @property {boolean} [active=true] - Optional, defaults to true
 */

/**
 * Creates a new user.
 * @param {User} userData - The user data
 * @returns {Promise<User>} The created user
 */
async function createUser(userData) {
  // ...
}
```

### Class Documentation
```javascript
/**
 * Represents a user in the system.
 * @class
 */
class User {
  /**
   * Creates a User instance.
   * @param {string} name - User's name
   * @param {string} email - User's email
   */
  constructor(name, email) {
    /** @type {string} */
    this.name = name;
    /** @type {string} */
    this.email = email;
  }

  /**
   * Gets the user's display name.
   * @returns {string} Display name
   */
  getDisplayName() {
    return this.name;
  }
}
```

### Callback Types
```javascript
/**
 * @callback FetchCallback
 * @param {Error|null} error - Error if failed
 * @param {Object} data - Response data
 */

/**
 * Fetches data from the API.
 * @param {string} url - The URL to fetch
 * @param {FetchCallback} callback - Called with the result
 */
function fetchData(url, callback) {
  // ...
}
```

### Generic Types
```javascript
/**
 * @template T
 * @param {T[]} array - Array of items
 * @returns {T|undefined} First item or undefined
 */
function first(array) {
  return array[0];
}
```

### Module Documentation
```javascript
/**
 * @module utils/string
 * @description String utility functions
 */

/**
 * Capitalizes the first letter.
 * @param {string} str - Input string
 * @returns {string} Capitalized string
 */
export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|-------------|----------------|------------------|
| No documentation at all | No IDE hints, hard to use API | Document at least public functions and complex logic |
| Copying implementation as comment | Adds no value, becomes outdated | Describe behavior, not implementation |
| Missing `@param` types | No type checking or autocomplete | Always specify parameter types |
| Outdated documentation | Misleading, worse than none | Update docs when changing code |
| Over-documenting obvious code | Clutters code, maintenance burden | Document complex logic, skip trivial getters/setters |
| Using wrong tag for purpose | Confuses tools, incorrect types | Use `@typedef` for types, `@callback` for functions |
| Not importing types | Broken type references | Use `@typedef {import('./types').Type}` |
| Duplicate type info in TypeScript | Redundant, desynchronizes | Let TypeScript types speak for themselves |

## Quick Troubleshooting

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| IDE not showing type hints | JSDoc comments malformed or incomplete | Ensure `@param {Type}` and `@returns {Type}` are present |
| Type errors in VS Code | Incorrect JSDoc type syntax | Use TypeScript-style types: `{string\|null}` not `{?string}` |
| Broken type imports | Wrong import path in `@typedef` | Use `@typedef {import('./file').TypeName}` with correct path |
| Generic types not working | Improper `@template` usage | Declare `@template T` before using it in params |
| Documentation not generated | JSDoc tool not configured | Run `jsdoc -c jsdoc.json` with proper config |
| Optional params showing as required | Missing `[]` in param name | Use `@param {string} [optional]` or `{string=}` |
| Types not recognized | Typo or undeclared typedef | Define types with `@typedef` before use |
| Return type ignored | Missing `@returns` tag | Always document return value with `@returns {Type}` |

## Related Skills

- [TSDoc/JSDoc](../jsdoc-tsdoc/SKILL.md)
- [TypeScript](../../languages/typescript/SKILL.md)
