---
name: New agent
about: Propose a specialized agent for a domain we don't cover
title: 'agent: '
labels: agent
assignees: ''
---

## Domain

What the agent is an expert in, and the category it belongs to (`ls agents`).

## Skills it would rely on

Existing skill paths under `skills/` (`{category}/{name}`). Flag any that would have to be written first.

## Tools it needs

Proposed `allowed-tools`. Remember: an agent that runs test suites needs `Bash`, one that delegates needs `Task`
— `validate-catalog.mjs` fails without them.

## Why an existing agent isn't enough

Which agent comes closest today, and where it falls short.

## I'd like to write this

- [ ] Yes — assign it to me
- [ ] No — just proposing it
