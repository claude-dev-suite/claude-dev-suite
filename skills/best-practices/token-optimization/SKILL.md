---
name: token-optimization
description: |
  Token optimization best practices for MCP server and tool interactions.
  Minimizes token consumption while maintaining effectiveness.

  USE WHEN: user mentions "token usage", "optimize tokens", "reduce API calls", "MCP efficiency",
  asks about "how to use less tokens", "MCP best practices", "limit output size", "efficient queries"

  DO NOT USE FOR: Code optimization - use `performance` instead,
  Text compression - this is about API usage patterns,
  Cost optimization (infrastructure) - use cloud/DevOps skills
allowed-tools: Read, Grep, Glob
---

# Token Optimization Best Practices

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `token-optimization` for comprehensive documentation.

Guidelines for minimizing token consumption in MCP server and external tool interactions.

## When NOT to Use This Skill

This skill focuses on API/tool call optimization. Do NOT use for:

- **Runtime performance** - Use `performance` skill for speed optimization
- **Code minification** - Use build tools (Vite, Webpack, etc.)
- **Database query optimization** - Use database-specific skills
- **Algorithm efficiency** - Use computer science fundamentals
- **Prompt engineering** - This is about tool usage, not prompt design

## General Principles

| Principle | Description |
|-----------|-------------|
| **Lazy Loading** | Load information only when strictly necessary |
| **Minimal Output** | Request only needed data, use `limit` and `compact` parameters |
| **Progressive Detail** | Start with overview/summary, drill down only if needed |
| **Cache First** | Check if information is already in context before external calls |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Token-Efficient Solution |
|--------------|--------------|--------------------------|
| **SELECT *** | Returns unnecessary columns | Specify exact columns needed |
| **No LIMIT clause** | Returns entire dataset | Always add LIMIT (e.g., 100) |
| **Full schema requests** | Returns massive specs | Use `compact=true` or `format="summary"` |
| **Recursive documentation fetch** | Fetches entire doc tree | Use `search_docs` with specific query |
| **Fetching full logs** | Returns thousands of lines | Use `tail_logs` or `find_errors` with limit |
| **Copy-paste documentation** | Duplicates content | Summarize and reference, don't quote verbatim |
| **No pagination** | Returns all results at once | Use offset/limit for large datasets |
| **Full API schema exploration** | Multi-MB specifications | Get endpoint list first, details on-demand |

## Quick Troubleshooting

| Issue | Check | Solution |
|-------|-------|----------|
| **Large MCP response** | Output size > 2000 tokens | Add `limit` parameter, use compact format |
| **Repeated API calls** | Calling same tool multiple times | Cache results in conversation context |
| **Slow context buildup** | Too many tool calls | Batch related queries, use more specific tools |
| **Unnecessary documentation fetch** | Info already known | Check skill files first, fetch docs as last resort |
| **Full table scan results** | Database query returns too much | Add WHERE clause and LIMIT |
| **Verbose error logs** | Full stack traces repeated | Summarize errors, reference line numbers |

## MCP Server Patterns

### database-query

```sql
-- BAD: Query without limits
SELECT * FROM users

-- GOOD: Query with filters and limits
SELECT id, name, email FROM users WHERE active = true LIMIT 100
```

**Tool usage**:
- `execute_query`: ALWAYS use `limit` parameter (default: 1000)
- `get_schema(compact=true)`: For DB structure overview
- `describe_table`: Before exploratory queries
- `explain_query`: Before complex queries on large tables

### api-explorer

```
-- BAD: Full schema
get_api_schema(format="full")

-- GOOD: Summary only for overview
get_api_schema(format="summary")

-- GOOD: Path list with limit
list_api_paths(limit=50)

-- GOOD: Single endpoint details
get_api_endpoint_details(path="/users/{id}", method="GET")
```

**Tool usage**:
- `get_api_schema(format="summary")`: For API overview
- `list_api_paths(limit=50)`: For endpoint list
- `get_api_models(compact=true)`: For model list without full schema
- `search_api(limit=10)`: For targeted searches

### documentation

```
-- BAD: Entire document
fetch_docs(topic="react")

-- GOOD: Targeted search
search_docs(query="useEffect cleanup", maxResults=3)
```

**Tool usage**:
- `search_docs(maxResults=3)`: For specific information search
- `fetch_docs`: Only for very specific topics
- Check skill files FIRST before fetching documentation

### log-analyzer

```
-- BAD: All logs
parse_logs(file="/var/log/app.log")

-- GOOD: Recent errors only
find_errors(file="/var/log/app.log", limit=50)

-- GOOD: Tail for live debugging
tail_logs(file="/var/log/app.log", lines=50)
```

**Tool usage**:
- `tail_logs(lines=50)`: For recent logs
- `find_errors(limit=50)`: For error debugging
- `parse_logs(limit=200)`: Only if full analysis needed

### security-scanner

**Tool usage**:
- `scan_dependencies`: Prefer over `scan_all`
- `scan_secrets`: Faster than full scan
- `scan_all`: Only for complete audits

### code-quality

**Tool usage**:
- `analyze_complexity(path="src/specific/file.ts")`: Target specific files
- `find_duplicates(minLines=10)`: Filter significant duplicates only
- `code_metrics`: Compact output for overview

## Pre-Call MCP Checklist

Before calling an MCP tool, verify:

- [ ] Do I already have this information in context?
- [ ] Can I use a more specific tool instead of a generic one?
- [ ] Have I set an appropriate `limit`?
- [ ] Have I used `compact=true` if available?
- [ ] Is the expected output reasonable (< 2000 tokens)?

## Output Format Standards

### For code analysis
- Max 5 issues per category
- Snippets max 10 lines
- Use tables for lists

### For database queries
- Max 20 rows in direct output
- For results > 20: "Found N rows. First 20: ..."
- Compact tabular format

### For documentation
- Quote only relevant parts (max 500 characters)
- Link to complete docs instead of copying content
- Summarize instead of quoting verbatim

## Efficient Response Examples

### Database Query - Compact Output
```
Found 1523 rows. First 20:
| id | name | status |
|----|------|--------|
| 1  | ...  | active |
...
Use offset=20 for next page.
```

### API Exploration - Progressive Detail
```
API has 45 endpoints. Summary by tag:
- users: 8 endpoints
- auth: 5 endpoints
- products: 12 endpoints
...
Use get_api_endpoint_details for specifics.
```

### Log Analysis - Focused Output
```
Found 234 errors in last hour. Top 5 by frequency:
1. ConnectionTimeout: 89 occurrences
2. ValidationError: 45 occurrences
...
Use tail_logs or parse_logs with filters for details.
```

## Reference Documentation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `token-optimization` for advanced optimization techniques.
