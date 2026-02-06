---
name: openapi-generator
description: |
  OpenAPI Generator - generate clients and servers from OpenAPI specs

  USE WHEN: user mentions "OpenAPI Generator CLI", "generate Java client", "generate Spring server",
  "openapi-generator-cli", "openapi-generator-maven-plugin", asks about "generate server from OpenAPI",
  "OpenAPI Generator templates"

  DO NOT USE FOR: TypeScript-only generation - use `openapi-codegen` instead;
  Writing OpenAPI specs - use `openapi` instead; GraphQL - use `graphql-codegen` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# OpenAPI Generator - Quick Reference

## When to Use This Skill
- Generate type-safe API clients from OpenAPI specs
- Generate server stubs from OpenAPI specs
- Maintain sync between API and code
- Multi-language client generation (Java, Python, Go, etc.)
- Spring Boot server generation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `openapi-generator` for comprehensive documentation.

## CLI Usage

### Install
```bash
npm install @openapitools/openapi-generator-cli -g
# or
brew install openapi-generator
```

### Generate TypeScript Client
```bash
openapi-generator-cli generate \
  -i api.yaml \
  -g typescript-fetch \
  -o ./generated/api \
  --additional-properties=supportsES6=true,typescriptThreePlus=true
```

### Generate TypeScript Axios Client
```bash
openapi-generator-cli generate \
  -i api.yaml \
  -g typescript-axios \
  -o ./generated/api
```

### Generate Java Client
```bash
openapi-generator-cli generate \
  -i api.yaml \
  -g java \
  -o ./generated/api \
  --additional-properties=library=webclient,dateLibrary=java8
```

### Generate Spring Server
```bash
openapi-generator-cli generate \
  -i api.yaml \
  -g spring \
  -o ./generated/server \
  --additional-properties=interfaceOnly=true,useSpringBoot3=true
```

## NPM Script Integration

### package.json
```json
{
  "scripts": {
    "generate:api": "openapi-generator-cli generate -i ./api/openapi.yaml -g typescript-fetch -o ./src/generated/api"
  }
}
```

## Maven Plugin

```xml
<plugin>
    <groupId>org.openapitools</groupId>
    <artifactId>openapi-generator-maven-plugin</artifactId>
    <version>7.0.0</version>
    <executions>
        <execution>
            <goals>
                <goal>generate</goal>
            </goals>
            <configuration>
                <inputSpec>${project.basedir}/src/main/resources/api.yaml</inputSpec>
                <generatorName>spring</generatorName>
                <configOptions>
                    <interfaceOnly>true</interfaceOnly>
                    <useSpringBoot3>true</useSpringBoot3>
                </configOptions>
            </configuration>
        </execution>
    </executions>
</plugin>
```

## Common Generators

| Generator | Description |
|-----------|-------------|
| typescript-fetch | TypeScript with Fetch API |
| typescript-axios | TypeScript with Axios |
| java | Java client |
| spring | Spring Boot server |
| python | Python client |
| go | Go client |

## When NOT to Use This Skill

- TypeScript-only projects (use `openapi-codegen` with openapi-typescript instead)
- Writing OpenAPI specifications (use `openapi` skill)
- GraphQL code generation (use `graphql-codegen` skill)
- tRPC projects (use `trpc` skill)
- Simple type-only generation (openapi-typescript is lighter)

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Committing generated code | Merge conflicts, stale code | Add to .gitignore, generate in build |
| Not pinning generator version | Breaking changes between versions | Lock version in package.json/pom.xml |
| Editing generated files | Lost on regeneration | Extend classes or use custom templates |
| No spec validation before generation | Invalid code generated | Use @redocly/cli lint first |
| Generating entire API for one endpoint | Bloated client | Use tags or paths filter |
| Missing operationId in spec | Poor method names | Add operationId to all operations |
| Not configuring additional properties | Suboptimal output | Use additionalProperties for customization |
| Generating without .openapi-generator-ignore | Overwrites custom files | Add ignore file for manual code |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| Generation fails | Invalid OpenAPI spec | Validate with `@redocly/cli lint` |
| Missing methods | No operationId in spec | Add operationId to all paths |
| Compilation errors in generated code | Spec type mismatch | Check schema types, run with --skip-validate-spec to debug |
| Wrong package names | Config not set | Use --additional-properties for package config |
| Duplicate model names | Same schema name in different tags | Rename schemas or use x-model-name |
| Maven plugin not running | Wrong phase or configuration | Check plugin execution phase |
| NPM global command not found | Not installed globally | Install with npm install -g or use npx |
| Generated code has wrong types | Generator doesn't support type | Use custom templates or different generator |
