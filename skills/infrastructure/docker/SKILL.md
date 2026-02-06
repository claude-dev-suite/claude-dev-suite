---
name: docker
description: |
  Docker containerization. Covers Dockerfile, images, and best
  practices. Use for containerizing applications.

  USE WHEN: user mentions "dockerfile", "docker build", "docker run", "containerize",
  "docker image", "multi-stage build", asks about "how to dockerize", "container security",
  "docker optimization", "image size", "docker layers"

  DO NOT USE FOR: docker-compose multi-service setups - use `docker-compose` skill instead,
  Kubernetes orchestration - use `kubernetes` skill instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Docker Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `docker` for comprehensive documentation.

## Dockerfile (Node.js)

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

## Dockerfile (Python)

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

USER nobody
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Common Commands

```bash
# Build
docker build -t myapp:latest .
docker build -f Dockerfile.prod -t myapp:prod .

# Run
docker run -d -p 3000:3000 --name myapp myapp:latest
docker run --env-file .env myapp:latest

# Manage
docker ps                    # List running
docker logs myapp           # View logs
docker exec -it myapp sh    # Shell access
docker stop myapp           # Stop container
docker rm myapp             # Remove container

# Images
docker images               # List images
docker rmi myapp:latest     # Remove image
docker system prune         # Clean up
```

## Best Practices

| Do | Don't |
|----|----|
| Multi-stage builds | Run as root |
| Use .dockerignore | Copy node_modules |
| Specific base image tags | Use `latest` in prod |
| One process per container | Install unnecessary packages |
| Layer caching (COPY package.json first) | Hardcode secrets |

## .dockerignore

```
node_modules
.git
.env*
dist
*.log
```

## When NOT to Use This Skill

Skip this skill when:
- Managing multi-container applications with docker-compose.yml - use `docker-compose` skill
- Orchestrating containers in Kubernetes - use `kubernetes` skill
- CI/CD pipeline automation - use `github-actions` skill
- Only running third-party images without creating Dockerfiles
- Using container platforms that abstract Docker (e.g., Heroku, Google Cloud Run config)

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Using `:latest` in production | Unpredictable deployments | Pin specific versions `node:20.10.0-alpine` |
| Running as root | Security vulnerability | Use `USER node` or create non-root user |
| Copying `node_modules/` | Slow builds, platform issues | Add to `.dockerignore`, run `npm ci` in container |
| Installing dev dependencies | Bloated images | Use `npm ci --only=production` |
| No multi-stage builds | Large production images | Separate build and runtime stages |
| Hardcoding secrets in ENV | Secret exposure in image layers | Use Docker secrets or mount at runtime |
| Single RUN per command | Excessive layers | Chain related commands with `&&` |
| Not using `.dockerignore` | Slow context transfer | Exclude unnecessary files |
| Installing unnecessary packages | Attack surface, image size | Install only required packages |
| No health checks | Unhealthy containers keep running | Add HEALTHCHECK directive |

## Quick Troubleshooting

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| Build is slow | Large build context | Add `.dockerignore`, optimize layer caching |
| Image size too large | Dev dependencies, multiple stages | Multi-stage build, `--only=production` |
| "Permission denied" in container | Running as root, wrong file ownership | Use `USER` directive, `COPY --chown` |
| Build cache not working | COPY before dependency install | Copy `package.json` first, then install, then code |
| Container crashes immediately | Wrong CMD/ENTRYPOINT, missing deps | Check logs: `docker logs <container>` |
| Can't connect to database | Wrong network, wrong host | Use service name as host, check network |
| "Exec format error" | Wrong platform (ARM vs x86) | Build for correct platform: `--platform linux/amd64` |
| Port not accessible | Not exposed or published | Use `EXPOSE` + `docker run -p` |
| Files not updating | Cached layers | Clear cache: `docker build --no-cache` |
| Volume data persists after deletion | Named volumes not removed | Use `docker volume rm` or `docker-compose down -v` |

## Production Readiness

### Security Configuration

```dockerfile
# Security-hardened Dockerfile
FROM node:20-alpine AS builder

# Create non-root user
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Production image
FROM node:20-alpine

# Security: install security updates
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser

WORKDIR /app

# Copy with correct ownership
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

# Drop privileges
USER appuser

# Security: read-only filesystem (use with docker run --read-only)
# Make /tmp writable if needed
VOLUME ["/tmp"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Image Scanning

```bash
# Scan for vulnerabilities
docker scout cves myapp:latest
docker scout recommendations myapp:latest

# Alternative: Trivy scanner
trivy image myapp:latest

# Scan during CI/CD
docker build -t myapp:latest .
trivy image --exit-code 1 --severity HIGH,CRITICAL myapp:latest
```

### Resource Limits

```yaml
# docker-compose.yml with limits
services:
  app:
    image: myapp:latest
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
    # Security options
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

```bash
# Run with limits
docker run -d \
  --memory=512m \
  --memory-swap=512m \
  --cpus=1.0 \
  --read-only \
  --tmpfs /tmp \
  --security-opt=no-new-privileges:true \
  --cap-drop=ALL \
  myapp:latest
```

### Secrets Management

```yaml
# docker-compose.yml with secrets
services:
  app:
    image: myapp:latest
    secrets:
      - db_password
      - api_key
    environment:
      - DB_PASSWORD_FILE=/run/secrets/db_password

secrets:
  db_password:
    external: true  # Or use file: ./secrets/db_password.txt
  api_key:
    external: true
```

```typescript
// Read secrets in application
import { readFileSync } from 'fs';

const dbPassword = process.env.DB_PASSWORD_FILE
  ? readFileSync(process.env.DB_PASSWORD_FILE, 'utf8').trim()
  : process.env.DB_PASSWORD;
```

### Health Checks

```dockerfile
# Dockerfile health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

```yaml
# docker-compose.yml health check
services:
  app:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s
```

### Logging Best Practices

```yaml
# docker-compose.yml logging
services:
  app:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
        labels: "service,environment"
        tag: "{{.Name}}/{{.ID}}"
```

```bash
# View logs with timestamps
docker logs --timestamps --tail 100 myapp

# Follow logs
docker logs -f myapp

# Logs from all containers
docker-compose logs -f --tail=100
```

### Network Security

```yaml
# docker-compose.yml network isolation
services:
  app:
    networks:
      - frontend
      - backend

  db:
    networks:
      - backend  # Not accessible from frontend

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true  # No external access
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Container CPU usage | > 80% |
| Container memory usage | > 80% |
| Container restart count | > 3 in 5 minutes |
| Health check failures | > 0 |
| Image vulnerabilities (critical) | > 0 |

### Production Commands

```bash
# Cleanup unused resources
docker system prune -af --volumes

# Monitor resources
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Check container health
docker inspect --format='{{.State.Health.Status}}' myapp

# Update without downtime (with docker-compose)
docker-compose pull
docker-compose up -d --no-deps --build app
```

### Checklist

- [ ] Non-root user in container
- [ ] Multi-stage build (minimal final image)
- [ ] .dockerignore configured
- [ ] Specific base image tags (not :latest)
- [ ] Security updates installed
- [ ] Image vulnerability scanning
- [ ] Resource limits (CPU/memory)
- [ ] Read-only root filesystem
- [ ] Capabilities dropped
- [ ] Secrets via Docker secrets (not ENV)
- [ ] Health checks configured
- [ ] Log rotation configured
- [ ] Network isolation
- [ ] No sensitive data in image

## Reference Documentation
- [Multi-stage Builds](quick-ref/multistage.md)
- [Security](quick-ref/security.md)
