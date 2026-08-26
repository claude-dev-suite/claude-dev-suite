---
name: docs
description: Search and fetch documentation for a specific technology
allowed-tools: Read, Glob, Grep, mcp__documentation__fetch_docs, mcp__documentation__search_docs, mcp__documentation__list_topics, mcp__documentation__list_docs
argument-hint: <technology> [topic]
---

# Documentation Search

Fetch documentation for a specific technology.

## Usage

- `/docs nextjs` - List available topics for Next.js
- `/docs nextjs caching` - Fetch caching documentation
- `/docs search authentication` - Search across all docs

## Process

1. If only technology provided:
   - Call `list_topics` for that technology and show what is available
   - If the technology is not indexed, call `list_docs` to show what is
   - Suggest common starting points

2. If technology and topic provided:
   - Fetch documentation using MCP documentation server
   - Prefer local cache, fallback to live fetch

3. If "search" keyword:
   - Search across all documentation
   - Return relevant sections

## Technologies Available

Frontend: react, vue, angular, svelte, nextjs, nuxt, remix
Backend: express, fastify, nestjs, fastapi, django, spring-boot
Database: postgresql, mongodb, redis, prisma, drizzle
Infra: docker, kubernetes, github-actions
Testing: vitest, jest, playwright, cypress
