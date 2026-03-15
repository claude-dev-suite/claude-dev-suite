# MCP Server TypeScript Template

## Minimal Starter

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'my-server',
  version: '1.0.0',
});

// ── Tool: simple example ─────────────────────────────
server.tool(
  'hello',
  'Returns a greeting',
  { name: z.string().describe('Name to greet') },
  async ({ name }) => ({
    content: [{ type: 'text', text: `Hello, ${name}!` }],
  })
);

// ── Start server ─────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
```

## package.json

```json
{
  "name": "@dev-suite/my-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  }
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"]
}
```

## Tool with External API Call

```typescript
server.tool(
  'search_issues',
  'Search GitHub issues by query',
  {
    query: z.string().describe('Search query'),
    repo: z.string().describe('Repository in owner/repo format'),
    limit: z.number().optional().default(10).describe('Max results'),
  },
  async ({ query, repo, limit }) => {
    const response = await fetch(
      `https://api.github.com/search/issues?q=${encodeURIComponent(query)}+repo:${repo}&per_page=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const results = data.items.map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.html_url,
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }
);
```

## Resource Exposure

```typescript
// Expose a resource that Claude can read
server.resource(
  'config',
  'application://config',
  'Current application configuration',
  async () => ({
    contents: [{
      uri: 'application://config',
      mimeType: 'application/json',
      text: JSON.stringify(await loadConfig(), null, 2),
    }],
  })
);
```

## Error Handling Pattern

```typescript
server.tool('risky_operation', 'Does something that might fail', {
  input: z.string(),
}, async ({ input }) => {
  try {
    const result = await performOperation(input);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  } catch (error) {
    // MCP SDK converts thrown errors into proper error responses
    throw new Error(`Operation failed: ${(error as Error).message}`);
  }
});
```

## Testing Locally

```bash
# Build
npm run build

# Test with Claude Code
claude mcp add --transport stdio my-server -- node /path/to/dist/index.js

# Verify
# In Claude Code: /mcp
```
