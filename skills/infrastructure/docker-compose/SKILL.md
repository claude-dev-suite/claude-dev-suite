---
name: docker-compose
description: |
  Docker Compose for multi-container apps. Covers services, networks,
  and volumes. Use for local development environments.

  USE WHEN: user mentions "docker-compose", "docker-compose.yml", "multi-container",
  "service dependencies", "docker compose up", asks about "local dev environment",
  "microservices setup", "database + app setup", "docker networks", "docker volumes"

  DO NOT USE FOR: single container Dockerfiles - use `docker` skill instead,
  production orchestration - use `kubernetes` skill instead,
  CI/CD pipelines - use `github-actions` skill instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Docker Compose Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `docker-compose` for comprehensive documentation.

## Full Stack Example

```yaml
# docker-compose.yml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/mydb
      - REDIS_URL=redis://redis:6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    volumes:
      - ./src:/app/src  # Dev hot reload
    networks:
      - app-network

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d mydb"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    networks:
      - app-network

volumes:
  postgres_data:
  redis_data:

networks:
  app-network:
    driver: bridge
```

## Common Commands

```bash
# Start services
docker-compose up -d
docker-compose up --build  # Rebuild images

# Stop
docker-compose down
docker-compose down -v     # Remove volumes too

# Logs
docker-compose logs -f app
docker-compose logs --tail=100 app

# Execute
docker-compose exec app sh
docker-compose exec db psql -U user mydb

# Scale
docker-compose up -d --scale app=3
```

## Override for Dev

```yaml
# docker-compose.override.yml (auto-loaded)
services:
  app:
    build:
      target: development
    volumes:
      - .:/app
      - /app/node_modules
    command: npm run dev
```

## Environment Files

```yaml
services:
  app:
    env_file:
      - .env
      - .env.local
```

## When NOT to Use This Skill

Skip this skill when:
- Creating single-container Dockerfiles - use `docker` skill
- Deploying to production Kubernetes clusters - use `kubernetes` skill
- Setting up CI/CD workflows - use `github-actions` skill
- Working with Docker Swarm (deprecated) - use `kubernetes` skill
- Building Docker images only (no orchestration needed) - use `docker` skill

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Hardcoding ports in compose | Port conflicts, inflexible | Use `${PORT:-3000}:3000` with env vars |
| No health checks | Services start before ready | Add `healthcheck` and `depends_on.condition` |
| Exposing all ports publicly | Security risk | Bind to `127.0.0.1:port` for local only |
| Using `latest` tags | Unpredictable behavior | Pin specific versions `postgres:16-alpine` |
| Storing secrets in compose file | Secret exposure | Use Docker secrets or env files (gitignored) |
| No resource limits | Resource exhaustion | Set `deploy.resources.limits` |
| Mixing dev and prod config | Configuration drift | Use `docker-compose.override.yml` and `.prod.yml` |
| Not using named volumes | Data loss on recreation | Use named volumes for persistence |
| Services on default network | No isolation | Create custom networks per tier |
| Running as root | Security vulnerability | Set `user: "1000:1000"` or use Dockerfile USER |

## Quick Troubleshooting

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| Service won't start | Dependency not ready | Add `depends_on` with `condition: service_healthy` |
| Port already in use | Another service using port | Change port mapping or stop conflicting service |
| Database connection refused | Service name wrong, network issue | Use service name as host: `db:5432` not `localhost` |
| Changes not reflected | Old containers running | Run `docker-compose down && docker-compose up --build` |
| Volume data not persisting | Using anonymous volumes | Use named volumes in top-level `volumes:` |
| "network not found" | Network removed or wrong name | Run `docker-compose up` to recreate networks |
| Can't connect between services | Different networks | Put services on same network |
| Environment variables not working | Wrong syntax, not loaded | Use `${VAR:-default}` and check `.env` file |
| "service unhealthy" | Health check failing | Check `docker-compose logs` and fix health endpoint |
| Slow startup on Mac/Windows | Volume mounting overhead | Use named volumes instead of bind mounts for dependencies |

## Production Readiness

### Security Configuration

```yaml
# docker-compose.prod.yml
services:
  app:
    image: myapp:${VERSION:-latest}
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    user: "1000:1000"
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - postgres_data:/var/lib/postgresql/data:Z

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

### Health Checks

```yaml
services:
  app:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  db:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $POSTGRES_USER -d $POSTGRES_DB"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
```

### Networking

```yaml
services:
  app:
    networks:
      - frontend
      - backend
    ports:
      - "127.0.0.1:3000:3000"  # Only localhost

  db:
    networks:
      - backend
    # No ports exposed externally

  nginx:
    networks:
      - frontend
    ports:
      - "80:80"
      - "443:443"

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true  # No internet access
```

### Logging

```yaml
services:
  app:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
        labels: "service,environment"
    labels:
      - "service=app"
      - "environment=production"

  # Or use external logging
  app:
    logging:
      driver: fluentd
      options:
        fluentd-address: localhost:24224
        tag: "docker.{{.Name}}"
```

### Restart Policies

```yaml
services:
  app:
    restart: unless-stopped
    deploy:
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s

  db:
    restart: always
```

### Backup Strategy

```yaml
services:
  backup:
    image: postgres:16-alpine
    entrypoint: /bin/sh
    command: -c "pg_dump -h db -U $$POSTGRES_USER $$POSTGRES_DB | gzip > /backups/backup_$$(date +%Y%m%d_%H%M%S).sql.gz"
    environment:
      PGPASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - ./backups:/backups
    depends_on:
      db:
        condition: service_healthy
    profiles:
      - backup
```

### Testing

```yaml
# docker-compose.test.yml
services:
  test:
    build:
      context: .
      target: test
    environment:
      - DATABASE_URL=postgresql://test:test@db-test:5432/testdb
    depends_on:
      db-test:
        condition: service_healthy
    command: npm test

  db-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: testdb
    tmpfs:
      - /var/lib/postgresql/data  # In-memory for speed
```

```bash
# Run tests
docker-compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Container uptime | > 99.9% |
| Health check pass rate | 100% |
| Restart count | < 1/day |
| Memory usage | < 80% limit |

### Checklist

- [ ] Security opts (no-new-privileges, read_only)
- [ ] Resource limits (CPU, memory)
- [ ] Health checks on all services
- [ ] Internal networks for databases
- [ ] Secrets management (not env vars)
- [ ] Logging with rotation
- [ ] Restart policies configured
- [ ] Backup strategy defined
- [ ] Test compose file
- [ ] Production override file

## Reference Documentation
- [Networking](quick-ref/networking.md)
- [Production Setup](quick-ref/production.md)
