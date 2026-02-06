# Documentation MCP Server

MCP server for fetching and caching documentation for 66+ technologies.

## Features

- **On-Demand KB**: Git-based knowledge base with sparse checkout (v2.0+)
- **Version-Aware Docs**: Delta-based versioning for technology versions (v2.2+)
- **Smart Caching**: 2-hour TTL cache with automatic refresh
- **Fallback Support**: Graceful degradation to bundled docs
- **Live Fetching**: Fetch latest docs from official URLs
- **Search**: Full-text search across all documentation

## Installation

```bash
npm install
npm run build
```

## Configuration

### Bundled Mode (Default)

Uses documentation files bundled with the server:

```json
{
  "documentation": {
    "command": "node",
    "args": ["./mcp-servers/documentation/dist/index.js"]
  }
}
```

### On-Demand Git Mode (Recommended)

Fetches documentation on-demand from a Git repository:

```json
{
  "documentation": {
    "command": "node",
    "args": ["./mcp-servers/documentation/dist/index.js"],
    "env": {
      "KB_REPO_URL": "https://github.com/your-org/knowledge-base.git",
      "KB_REPO_BRANCH": "main",
      "KB_CACHE_PATH": "./.kb-cache",
      "KB_CACHE_TTL": "7200",
      "KB_MODE": "git"
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KB_MODE` | `auto` | KB mode: `auto` (Git if URL set, else bundled), `git`, `bundled` |
| `KB_REPO_URL` | - | Git repository URL for knowledge base |
| `KB_REPO_BRANCH` | `main` | Git branch to use |
| `KB_CACHE_PATH` | `./.kb-cache` | Local cache directory |
| `KB_CACHE_TTL` | `7200` | Cache TTL in seconds (default 2 hours) |

## Tools

### `fetch_docs`

Fetch documentation for a specific technology and topic.

```typescript
{
  technology: "react" | "spring-boot" | ...,
  topic: "hooks" | "security" | ...,
  version?: string,             // Technology version (e.g., "18" for React 18)
  source?: "local" | "live",    // default: "local"
  refresh?: boolean             // Force cache refresh (Git mode only)
}
```

**Example:**
```javascript
// Fetch latest version (React 19)
await fetch_docs({
  technology: "react",
  topic: "hooks",
  source: "local"
})

// Fetch specific version (React 18)
await fetch_docs({
  technology: "react",
  topic: "hooks",
  version: "18"
})
```

### `search_docs`

Search across all documentation.

```typescript
{
  query: string,
  technologies?: string[],
  maxResults?: number  // default: 5
}
```

**Example:**
```javascript
await search_docs({
  query: "authentication",
  technologies: ["spring-boot", "nextjs"],
  maxResults: 10
})
```

### `list_topics`

List available documentation topics for a technology.

```typescript
{
  technology: "react" | "spring-boot" | ...
}
```

**Example:**
```javascript
await list_topics({ technology: "react" })
// Returns: { files: ["hooks.md", "server-components.md", ...] }
```

### `list_versions`

List available versions for a technology (v2.2+).

```typescript
{
  technology: "react" | "svelte" | ...
}
```

**Example:**
```javascript
await list_versions({ technology: "react" })
// Returns: {
//   technology: "react",
//   latest: "19",
//   supported: ["18", "19"],
//   eol: ["17"],
//   breaking_changes: {
//     "18→19": ["use() hook", "useOptimistic()", ...]
//   }
// }
```

### `clear_kb_cache` (Git Mode Only)

Clear knowledge base cache.

```typescript
{
  technology?: string  // Clear specific tech, or all if omitted
}
```

**Example:**
```javascript
await clear_kb_cache({ technology: "react" })
await clear_kb_cache()  // Clear all
```

### `kb_cache_stats` (Git Mode Only)

Get cache statistics.

```typescript
{}
```

**Example:**
```javascript
await kb_cache_stats()
// Returns: {
//   technologies: 5,
//   totalFiles: 23,
//   oldestCache: 1234567890,
//   newestCache: 1234567900,
//   cache_path: "./.kb-cache",
//   ttl_seconds: 7200
// }
```

## On-Demand KB Architecture

### How It Works

1. **Request**: Claude requests docs for `react/hooks`
2. **Cache Check**: Check if cached and fresh (<2h old)
3. **Git Sparse Checkout**: If cache miss, clone only `knowledge/react/` from KB repo
4. **Cache Update**: Copy to `.kb-cache/react/` and set timestamp
5. **Serve**: Return content from cache
6. **Auto-Refresh**: Cache expires after 2h, refetches on next request

### Benefits

- **Always Up-to-Date**: KB updates don't require MCP server rebuild
- **Lightweight**: Only downloads requested technologies
- **Offline-Ready**: 2h cache for network failures
- **Fast**: Sparse checkout + cache = ~1-2s first request, instant after

### Knowledge Base Structure

Expected Git repository structure:

```
knowledge-base/
└── knowledge/
    ├── react/
    │   ├── manifest.json          # Version metadata
    │   ├── hooks.md               # Latest version (React 19)
    │   ├── server-components.md
    │   └── _versions/
    │       └── v18/
    │           ├── hooks.md       # Delta: React 18 differences
    │           └── server-components.md
    ├── svelte/
    │   ├── manifest.json
    │   ├── runes.md               # Latest version (Svelte 5)
    │   └── _versions/
    │       └── v4/
    │           └── runes.md       # Delta: Svelte 4 differences
    ├── spring-boot/
    │   ├── basics.md
    │   └── security.md
    └── [66 technologies...]
```

## Version-Aware Documentation (v2.2+)

### Delta-Based Versioning

Instead of duplicating full documentation for each version, we use a **delta-based approach**:

1. **Base File**: Contains complete documentation for the **latest** version
2. **Delta Files**: Small files in `_versions/vN/` with only the **differences**

### manifest.json Structure

Each versioned technology has a `manifest.json`:

```json
{
  "technology": "react",
  "latest": "19",
  "supported": ["18", "19"],
  "eol": ["17"],
  "topics": {
    "hooks": {
      "has_delta": ["18"],
      "not_in": []
    },
    "server-components": {
      "has_delta": ["18"],
      "not_in": []
    }
  },
  "breaking_changes": {
    "18→19": [
      "use() hook for promises and context",
      "useOptimistic() hook",
      "useFormStatus() hook",
      "useActionState() hook"
    ]
  }
}
```

### Delta File Structure

Delta files follow this format:

```markdown
# Technology X → Topic Delta

## Not Available in Version X
- Feature A (Version Y+)
- Feature B (Version Y+)

## Syntax Differences

### Feature Name
\`\`\`jsx
// Version Y (latest)
const data = use(promise);

// Version X - Alternative approach
const { data } = useSuspenseQuery(...)
\`\`\`

## Still Current in Version X
- Feature C
- Feature D

## Recommendations for Version X Users
1. Use library X for feature A
2. Consider upgrading for feature B
```

### How Version Resolution Works

1. **Request**: `fetch_docs({ technology: "react", topic: "hooks", version: "18" })`
2. **Load Base**: Fetch `react/hooks.md` (React 19 content)
3. **Check Manifest**: `manifest.json` shows `hooks` has delta for v18
4. **Load Delta**: Fetch `react/_versions/v18/hooks.md`
5. **Merge**: Combine base + delta information
6. **Return**: Version-specific documentation

### Benefits

- **Minimal Storage**: Only differences stored, not full copies
- **Easy Updates**: Update base file, deltas remain valid
- **Clear Migration Path**: Breaking changes documented per version
- **Graceful Fallback**: Missing delta = return base with warning

## Supported Technologies (66)

**Frontend:** React, Vue, Angular, Svelte, Solid, Next.js, Nuxt, Remix, SvelteKit, Astro, Electron

**Backend:** NestJS, Express, Fastify, Hono, Spring Boot, FastAPI, Django, Flask

**Databases:** PostgreSQL, MySQL, MongoDB, Redis

**ORM:** Prisma, Drizzle, TypeORM, SQLAlchemy, Spring Data JPA

**Testing:** Vitest, Jest, Playwright, Cypress, pytest, JUnit, Testing Library

**State:** Zustand, Redux Toolkit, Pinia, TanStack Query

**Auth:** JWT, OAuth2, NextAuth, Spring Security

**Infrastructure:** Docker, Kubernetes, GitHub Actions

**API:** REST, GraphQL, tRPC, OpenAPI

**Tooling:** Tailwind, Biome, Flyway, Lombok, MapStruct, shadcn/ui, react-hook-form

See `src/docs-index.ts` for complete list.

## Development

```bash
# Build
npm run build

# Development mode (watch)
npm run dev

# Test server
npm test
```

## Migration from v1.x

v2.0 maintains backward compatibility. Existing `.mcp.json` configurations work unchanged (bundled mode).

To enable on-demand KB:
1. Set `KB_REPO_URL` environment variable
2. Ensure Git is installed and accessible
3. Create knowledge base repository with expected structure

## Troubleshooting

### Git Mode Falls Back to Bundled

**Causes:**
- Git not installed or not in PATH
- KB repository URL invalid or inaccessible
- Network connectivity issues

**Solution:** Check logs for `[KB] Warning: Git KB not available`. Server automatically falls back to bundled mode.

### Cache Not Refreshing

Clear cache manually:
```javascript
await clear_kb_cache()
```

Or delete `.kb-cache/` directory and restart.

### Sparse Checkout Fails

Ensure Git version >= 2.25 (sparse checkout v2 support):
```bash
git --version
```

## License

MIT
