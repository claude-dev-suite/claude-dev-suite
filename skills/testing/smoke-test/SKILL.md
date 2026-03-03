---
name: smoke-test
description: |
  Smoke testing patterns for verifying backend implementations end-to-end.
  Covers build verification, service health checks, authentication flows,
  test data setup, and HTTP endpoint validation.

  USE WHEN: user mentions "smoke test", "verify implementation", "test endpoints",
  "check if it works", "end-to-end verification", "does it actually run"

  DO NOT USE FOR: Unit test writing - use `vitest` or `junit`; E2E browser tests - use `playwright`; Load testing - use `performance-expert`; Static API validation - use `integration-validator-expert`
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Smoke Testing Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `smoke-testing` for comprehensive documentation.

## When NOT to Use This Skill

- **Unit Testing** — Use `vitest`, `jest`, `junit`, or `pytest` for isolated unit tests
- **E2E Browser Testing** — Use `playwright` or `cypress` for browser-driven end-to-end tests
- **Static API Contract Validation** — Use `integration-validator-expert` for OpenAPI schema validation without running services
- **Load/Performance Testing** — Use `performance-expert` for benchmarks and profiling

## Stack Detection Table

| Marker File | Stack | Build Command | Test Command | Run Command | Default Port |
|-------------|-------|---------------|--------------|-------------|--------------|
| `pom.xml` | Spring Boot | `./mvnw clean compile -q` | `./mvnw test -q` | `./mvnw spring-boot:run &` | 8080 |
| `build.gradle` | Spring Boot (Gradle) | `./gradlew build -x test` | `./gradlew test` | `./gradlew bootRun &` | 8080 |
| `package.json` + `@nestjs/core` | NestJS | `npm run build` | `npm test` | `npm run start:dev &` | 3000 |
| `package.json` + `express` | Express | `npm run build` | `npm test` | `npm start &` | 3000 |
| `requirements.txt` + `fastapi` | FastAPI | — | `pytest` | `uvicorn main:app --reload &` | 8000 |
| `go.mod` | Go | `go build ./...` | `go test ./...` | `go run . &` | 8080 |
| `Cargo.toml` | Rust | `cargo build` | `cargo test` | `cargo run &` | 8080 |
| `*.csproj` | .NET | `dotnet build` | `dotnet test` | `dotnet run &` | 5000 |

## Health Check Endpoints

| Stack | Endpoint | Dependency |
|-------|----------|------------|
| Spring Boot | `/actuator/health` | `spring-boot-starter-actuator` |
| NestJS | `/health` | `@nestjs/terminus` (or custom) |
| FastAPI | `/health` or `/docs` | Custom route |
| Express | `/health` or `/api/health` | Custom route |
| Go | `/health` or `/healthz` | Custom handler |
| .NET | `/health` | `Microsoft.Extensions.Diagnostics.HealthChecks` |

## Port Detection Strategy

Search in order:
1. `CLAUDE.md` — explicit port mentions
2. `application.yml` / `application.properties` → `server.port`
3. `package.json` scripts → `--port` flag
4. `.env` / `.env.local` → `PORT=`
5. Fall back to stack default from table above

## Authentication Patterns

### JWT Login Flow

```
POST /api/auth/login
Content-Type: application/json

{"email": "{email}", "password": "{password}"}

→ Response: {"token": "eyJ...", "refreshToken": "..."}
→ Use: Authorization: Bearer {token}
```

### Credential Discovery

Search in order:
1. Test files → Grep for `login`, `password`, `testUser` in `src/test/` or `test/`
2. Config files → `application-test.yml`, `.env.test`, `test.env`
3. Seed/fixture files → `data.sql`, `seed.ts`, `fixtures/`
4. Known defaults → `admin/admin`, `test@test.com/password`

### Detecting Auth Requirement

No auth needed if:
- No security dependencies in `pom.xml` / `package.json`
- Health endpoint returns 200 without token
- No `@PreAuthorize`, `@UseGuards`, `Depends(get_current_user)` in controllers

## Log File Locations

| Stack | Typical Paths | Config Key |
|-------|---------------|------------|
| Spring Boot | `logs/`, `target/` | `logging.file.path` in `application*.yml` |
| NestJS | `logs/` | `LoggerModule` config or `winston` transport |
| FastAPI | `logs/` | `logging.config` in Python files |
| Docker | Container stdout | Access via `docker logs` or docker-manager MCP |

**Fallback chain:** `/tmp/smoke-test-app.log` (stdout redirect) → Glob `**/logs/*.log` → Docker container logs

## HTTP Verification Patterns

### Positive Cases

| Method | Expected Status | Body Check |
|--------|----------------|------------|
| GET (list) | 200 | Array response, non-empty |
| GET (by ID) | 200 | Object with matching ID |
| POST (create) | 201 | Created object with generated ID |
| PUT (update) | 200 | Updated fields reflected |
| DELETE | 204 or 200 | Subsequent GET returns 404 |

### Negative Cases

| Test | Expected Status | Meaning |
|------|----------------|---------|
| No auth token | 401 | Unauthorized |
| Invalid ID (e.g. 999999) | 404 | Not Found |
| Invalid body (missing required field) | 400 | Bad Request |
| Wrong HTTP method | 405 | Method Not Allowed |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|-------------|---------|
| Testing against production DB | Data corruption risk | Use test profile or Docker container |
| Hardcoding test credentials | Security risk, breaks across envs | Read from env/test config files |
| Skipping cleanup | Leftover processes and test data | Always kill PID, prefix data with `smoke-test-*` |
| Testing all endpoints | Scope creep, slow | Focus on recently implemented endpoints |
| Ignoring log errors | Hidden bugs slip through | Always check logs in Phase 7 |
| Retrying without fixing | Wastes iterations | Delegate fix before retrying |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|-------------|---------|
| Health check timeout | App not started or wrong port | Check log file, verify port in config |
| 401 on all endpoints | JWT expired or wrong header format | Re-authenticate, check `Authorization: Bearer` format |
| Connection refused | Service not listening yet | Increase health check retry interval |
| 500 on POST | Missing required fields or DB constraint | Check DTO validation and entity defaults |
| Port already in use | Previous smoke test didn't cleanup | `kill $(lsof -ti:PORT)` then retry |
| Build fails on Windows | Maven wrapper not executable | Use `mvnw.cmd` instead of `./mvnw` |

## Reference Documentation
- [HTTP Testing with api-tester MCP](quick-ref/http-testing.md)
