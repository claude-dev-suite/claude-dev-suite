# Nx - Advanced Patterns

## Custom Generator

```typescript
// tools/generators/my-generator/index.ts
import {
  Tree,
  formatFiles,
  generateFiles,
  names,
  joinPathFragments,
} from '@nx/devkit';

interface Schema {
  name: string;
  directory?: string;
}

export default async function (tree: Tree, schema: Schema) {
  const projectRoot = joinPathFragments('libs', schema.directory ?? '', schema.name);

  generateFiles(
    tree,
    joinPathFragments(__dirname, 'files'),
    projectRoot,
    {
      ...schema,
      ...names(schema.name),
      tmpl: '',
    }
  );

  await formatFiles(tree);
}
```

```json
// tools/generators/my-generator/schema.json
{
  "$schema": "http://json-schema.org/schema",
  "cli": "nx",
  "id": "my-generator",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Library name",
      "$default": { "$source": "argv", "index": 0 }
    },
    "directory": {
      "type": "string",
      "description": "Directory"
    }
  },
  "required": ["name"]
}
```

## Custom Executor

```typescript
// tools/executors/my-executor/executor.ts
import { ExecutorContext } from '@nx/devkit';

interface Options {
  param1: string;
}

export default async function executor(
  options: Options,
  context: ExecutorContext
): Promise<{ success: boolean }> {
  console.log(`Running with ${options.param1}`);
  console.log(`Project: ${context.projectName}`);

  // Your logic here

  return { success: true };
}
```

## Remote Cache (Nx Cloud)

```bash
# Connect to Nx Cloud
npx nx connect

# Or manually
nx g @nx/workspace:ci-workflow
```

```json
// nx.json
{
  "nxCloudAccessToken": "your-token"
}
```

## Self-hosted Cache

```json
// nx.json
{
  "tasksRunnerOptions": {
    "default": {
      "runner": "nx/tasks-runners/default",
      "options": {
        "cacheableOperations": ["build", "test", "lint"],
        "remoteCache": {
          "enabled": true,
          "url": "https://your-cache-server.com"
        }
      }
    }
  }
}
```

## Module Boundaries

```json
// .eslintrc.json (root)
{
  "overrides": [
    {
      "files": ["*.ts", "*.tsx"],
      "rules": {
        "@nx/enforce-module-boundaries": [
          "error",
          {
            "depConstraints": [
              {
                "sourceTag": "type:app",
                "onlyDependOnLibsWithTags": ["type:lib", "type:util"]
              },
              {
                "sourceTag": "scope:web",
                "onlyDependOnLibsWithTags": ["scope:web", "scope:shared"]
              },
              {
                "sourceTag": "type:util",
                "onlyDependOnLibsWithTags": ["type:util"]
              }
            ]
          }
        ]
      }
    }
  ]
}
```

## CI/CD GitHub Actions

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - uses: nrwl/nx-set-shas@v4

      - run: npx nx affected -t lint test build
```

## Distributed Task Execution

```yaml
# With Nx Cloud
- run: npx nx affected -t lint test build --parallel=3
  env:
    NX_CLOUD_ACCESS_TOKEN: ${{ secrets.NX_CLOUD_ACCESS_TOKEN }}
```

## Plugin Configuration

```json
// nx.json
{
  "plugins": [
    {
      "plugin": "@nx/vite/plugin",
      "options": {
        "buildTargetName": "build",
        "serveTargetName": "serve",
        "testTargetName": "test"
      }
    },
    {
      "plugin": "@nx/eslint/plugin",
      "options": {
        "targetName": "lint"
      }
    }
  ]
}
```

## Run Commands Executor

```json
{
  "targets": {
    "deploy": {
      "executor": "nx:run-commands",
      "options": {
        "commands": [
          "echo Deploying...",
          "aws s3 sync dist/apps/web s3://my-bucket"
        ],
        "parallel": false
      }
    }
  }
}
```
