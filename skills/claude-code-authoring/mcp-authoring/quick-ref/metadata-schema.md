# metadata.json Schema (dev-suite)

Each MCP server in `mcp-servers/{name}/` must have a `metadata.json` for dashboard integration.

## Complete Schema

```json
{
  "name": "my-server",
  "description": "Full description of what this MCP server provides and when to use it",
  "shortDescription": "Brief one-liner for dashboard cards",
  "category": "development",
  "tools": [
    {
      "name": "search_docs",
      "description": "Search project documentation by keyword or phrase"
    },
    {
      "name": "get_doc",
      "description": "Retrieve a specific documentation page by path"
    }
  ],
  "envVars": [
    {
      "name": "API_KEY",
      "description": "API key for the documentation service",
      "default": "",
      "required": true
    },
    {
      "name": "CACHE_TTL",
      "description": "Cache time-to-live in seconds",
      "default": "7200",
      "required": false
    }
  ],
  "recommendedFor": [
    "react-expert",
    "typescript-expert",
    "documentation-expert"
  ],
  "detectedWhen": [
    "react",
    "typescript",
    "next.js"
  ]
}
```

## Field Reference

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | Yes | string | Server identifier (lowercase, hyphens) |
| `description` | Yes | string | Full description for detail views |
| `shortDescription` | Yes | string | One-liner for dashboard cards |
| `category` | Yes | string | Grouping category |
| `tools` | Yes | array | List of tools exposed by this server |
| `tools[].name` | Yes | string | Tool name (snake_case) |
| `tools[].description` | Yes | string | What the tool does |
| `envVars` | Yes | array | Environment variables needed |
| `envVars[].name` | Yes | string | Variable name (UPPER_SNAKE_CASE) |
| `envVars[].description` | Yes | string | What this variable is for |
| `envVars[].default` | No | string | Default value if not set |
| `envVars[].required` | Yes | boolean | Whether server fails without it |
| `recommendedFor` | Yes | array | Agent IDs that benefit from this server |
| `detectedWhen` | Yes | array | Technology keywords that trigger recommendation |

## Categories

| Category | Use for |
|----------|---------|
| `development` | Code quality, testing, build tools |
| `documentation` | Docs access, knowledge base |
| `database` | Database querying, schema inspection |
| `infrastructure` | Docker, deployment, monitoring |
| `security` | Vulnerability scanning, secrets |
| `performance` | Profiling, metrics, analysis |
| `integration` | External APIs, services |

## Relationship with Agents

- `recommendedFor`: Lists agent IDs that benefit from this server. The dashboard suggests the server when those agents are selected.
- `detectedWhen`: Technology keywords matched during project detection. If a project uses "react", servers with "react" in `detectedWhen` are suggested.

**Important:** MCP servers are NEVER required — agents must work without them. The `recommendedFor` field is advisory only.
