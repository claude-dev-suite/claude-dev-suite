---
name: mcp-authoring
description: |
  Creates MCP (Model Context Protocol) servers for Claude Code. Covers TypeScript
  implementation with MCP SDK, tool definitions, transport types, metadata.json
  for dev-suite, and deployment patterns. Follows official MCP specification.

  USE WHEN: user mentions "MCP server", "create MCP", "model context protocol",
  "MCP tool", "external tool", "mcp-servers/", "metadata.json", "tool integration"

  DO NOT USE FOR: configuring existing MCP servers - check MCP docs;
  creating skills - use `skill-authoring`; creating hooks - use `hook-authoring`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# MCP Server Authoring

## What MCP Servers Do

MCP servers expose tools, resources, and prompts to Claude via the Model Context Protocol. They run as separate processes (stdio) or HTTP endpoints that Claude communicates with.

## Project Structure (dev-suite)

```
mcp-servers/{server-name}/
├── package.json              # @dev-suite/{name}, main: dist/index.js
├── tsconfig.json             # TypeScript config
├── metadata.json             # Server metadata for dev-suite dashboard
└── src/
    └── index.ts              # Server implementation
```

## TypeScript MCP Server Template

See [quick-ref/typescript-template.md](quick-ref/typescript-template.md) for the complete starter template.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'my-server',
  version: '1.0.0',
});

// Define a tool
server.tool(
  'search_docs',                           // Tool name
  'Search documentation by query',         // Description
  { query: z.string(), limit: z.number().optional().default(10) }, // Input schema
  async ({ query, limit }) => {            // Handler
    const results = await searchDocumentation(query, limit);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Tool Definition Best Practices

- **Name**: snake_case, descriptive (`search_docs` not `search`)
- **Description**: clear, includes when to use it
- **Input schema**: Zod validation with sensible defaults
- **Output**: Always return `content` array with `type: 'text'`
- **Errors**: Throw errors with descriptive messages — MCP SDK handles formatting

## metadata.json (dev-suite specific)

See [quick-ref/metadata-schema.md](quick-ref/metadata-schema.md) for the complete schema.

```json
{
  "name": "my-server",
  "description": "Full description of what this server does",
  "shortDescription": "Brief one-liner",
  "category": "development",
  "tools": [
    {
      "name": "search_docs",
      "description": "Search documentation by query"
    }
  ],
  "envVars": [
    {
      "name": "API_KEY",
      "description": "API key for the service",
      "required": true
    }
  ],
  "recommendedFor": ["react-expert", "typescript-expert"],
  "detectedWhen": ["react", "typescript"]
}
```

## Transport Types

| Transport | When to use | Config |
|-----------|-------------|--------|
| `stdio` | Local process, development, CLI tools | `command` + `args` in .mcp.json |
| `http` | Cloud services, shared servers | URL endpoint |
| `sse` | Legacy (deprecated) | URL endpoint |

## .mcp.json Configuration

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["path/to/dist/index.js"],
      "env": { "API_KEY": "${API_KEY}" }
    }
  }
}
```

Environment variables: `${VAR}` syntax, `${VAR:-default}` for defaults.

## Adding to dev-suite

1. Create `mcp-servers/{name}/` with `package.json` (`@dev-suite/{name}`)
2. Add `metadata.json` with tools, envVars, recommendedFor, detectedWhen
3. Add `src/index.ts` with MCP server implementation
4. Add `tsconfig.json`
5. Update `mcp-servers/package.json` workspaces array
6. Build: `cd mcp-servers && npm install && npm run build`

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Huge tool output (> 10K tokens) | Paginate, filter, or summarize results |
| No input validation | Use Zod schemas for all inputs |
| Blocking operations without timeout | Add timeouts to external calls |
| Hardcoded credentials | Use env vars via `process.env` |
| Tool names that are too generic | Use specific, descriptive names |

## Checklist

- [ ] Tools have descriptive names (snake_case) and clear descriptions
- [ ] Input schemas use Zod with validation and defaults
- [ ] Error handling with descriptive messages
- [ ] Environment variables for credentials
- [ ] metadata.json complete (for dev-suite)
- [ ] Package.json added to workspaces
- [ ] Builds successfully: `npm run build`
- [ ] Output stays under 10K tokens per tool call

## Reference
- [TypeScript MCP server template](quick-ref/typescript-template.md)
- [metadata.json schema](quick-ref/metadata-schema.md)
