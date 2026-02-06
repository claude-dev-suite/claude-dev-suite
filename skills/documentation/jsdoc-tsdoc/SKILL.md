---
name: jsdoc-tsdoc
description: |
  JSDoc and TSDoc documentation standards. Covers syntax, tags, TypeScript integration,
  documentation generation, and API documentation best practices.

  USE WHEN: user mentions "TSDoc", "TypeScript documentation", "API documentation", asks about "documenting TypeScript", "@param", "@returns", "TypeDoc", "API Extractor", "documentation tags"

  DO NOT USE FOR: JavaScript-only JSDoc - use `jsdoc` skill for plain JavaScript
allowed-tools: Read, Grep, Glob, Write, Edit
---
# JSDoc & TSDoc Documentation

> **Full Reference**: See [advanced.md](advanced.md) for JSDoc type annotations in JavaScript, TypeDoc/API Extractor configuration, ESLint plugin setup, and README templates.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `jsdoc` for comprehensive tag reference.

## When NOT to Use This Skill

- **Plain JavaScript projects** - Use the `jsdoc` skill for JavaScript-specific JSDoc patterns
- **Code comments (non-API)** - TSDoc is for public API documentation, not inline code comments
- **Auto-generated docs from code** - Use TypeDoc or API Extractor tools directly

## TSDoc vs JSDoc

| Feature | JSDoc | TSDoc |
|---------|-------|-------|
| **Purpose** | JS documentation + types | TS documentation only |
| **Type annotations** | `@type`, `@param {Type}` | Not needed (use TS types) |
| **Standardization** | De facto | Formal standard |

**Use TSDoc for TypeScript projects** - types come from TypeScript, comments describe behavior.

## Function Documentation

```typescript
/**
 * Calculates the total price including tax.
 *
 * @remarks
 * This method uses the default tax rate unless overridden.
 * For international orders, use {@link calculateInternationalPrice} instead.
 *
 * @param basePrice - The pre-tax price in cents
 * @param taxRate - Tax rate as decimal (default: 0.1 for 10%)
 * @returns The total price including tax in cents
 *
 * @throws {@link InvalidPriceError}
 * Thrown if basePrice is negative
 *
 * @example
 * ```typescript
 * const total = calculateTotalPrice(1000, 0.08);
 * console.log(total); // 1080
 * ```
 *
 * @beta
 */
function calculateTotalPrice(basePrice: number, taxRate = 0.1): number {
  if (basePrice < 0) {
    throw new InvalidPriceError('Price cannot be negative');
  }
  return Math.round(basePrice * (1 + taxRate));
}
```

## Interface Documentation

```typescript
/**
 * Configuration options for the HTTP client.
 *
 * @remarks
 * All timeouts are in milliseconds.
 *
 * @public
 */
interface HttpClientOptions {
  /**
   * Base URL for all requests.
   * @example 'https://api.example.com/v1'
   */
  baseUrl: string;

  /**
   * Request timeout in milliseconds.
   * @defaultValue 30000
   */
  timeout?: number;

  /**
   * Maximum number of retry attempts for failed requests.
   * @defaultValue 3
   */
  maxRetries?: number;
}
```

## All TSDoc Tags

### Block Tags

| Tag | Usage |
|-----|-------|
| `@param name - description` | Parameter documentation |
| `@returns description` | Return value description |
| `@throws {Type} description` | Thrown exceptions |
| `@example` | Usage examples (code block) |
| `@remarks` | Extended description |
| `@see` | Related references |
| `@deprecated reason` | Mark as deprecated |
| `@defaultValue value` | Default value |
| `@typeParam T - description` | Generic type parameter |

### Modifier Tags

| Tag | Meaning |
|-----|---------|
| `@public` | Part of public API |
| `@internal` | Internal implementation |
| `@alpha` | Early preview, may change |
| `@beta` | Maturing, API may change |
| `@readonly` | Read-only property |
| `@override` | Overrides parent |

### Inline Tags

| Tag | Usage |
|-----|-------|
| `{@link Target}` | Link to symbol |
| `{@link Target \| text}` | Link with custom text |
| `{@inheritDoc Parent.method}` | Inherit documentation |

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|-------------|----------------|------------------|
| Documenting types in TypeScript | Redundant, types already in signature | Describe behavior, not types |
| Copy-pasting function signature | Adds no value, desynchronizes | Explain purpose, edge cases, examples |
| Missing `@example` for complex APIs | Users don't know how to use it | Always include usage examples |
| Using `@deprecated` without migration | Users don't know what to use instead | `@deprecated Use {@link newFunction} instead` |
| No `@throws` documentation | Users don't know what to catch | Document all thrown exceptions |

## Quick Troubleshooting

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| VS Code not showing docs on hover | Malformed JSDoc comment | Ensure `/**` start and proper tag syntax |
| `eslint-plugin-tsdoc` errors | Invalid TSDoc syntax | Fix tag formatting per TSDoc spec |
| TypeDoc ignoring comments | Wrong comment location | Place JSDoc directly above declaration |
| `{@link}` not resolving | Incorrect symbol reference | Use fully qualified name or import path |

## Official References

| Resource | URL |
|----------|-----|
| TSDoc | https://tsdoc.org/ |
| JSDoc | https://jsdoc.app/ |
| TypeDoc | https://typedoc.org/ |
| API Extractor | https://api-extractor.com/ |
