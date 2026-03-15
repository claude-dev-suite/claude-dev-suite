# Docker Compose Services Quick Reference

> **Knowledge Base:** Read `knowledge/docker-compose/services.md` for complete documentation.

## Basic Structure

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:
      - db
      - redis

  db:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: myapp

  redis:
    image: redis:7-alpine

volumes:
  postgres_data:
```

## Service Configuration

```yaml
services:
  app:
    # Build from Dockerfile
    build:
      context: .
      dockerfile: Dockerfile.prod
      args:
        NODE_VERSION: 20

    # Or use image
    image: node:20-alpine

    # Container name
    container_name: myapp

    # Port mapping
    ports:
      - "3000:3000"           # HOST:CONTAINER
      - "127.0.0.1:3001:3001" # Specific host
      - "3000"                # Random host port

    # Environment
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:pass@db:5432/app
    env_file:
      - .env
      - .env.local

    # Volumes
    volumes:
      - .:/app                 # Bind mount
      - /app/node_modules      # Anonymous volume
      - cache:/app/.cache      # Named volume

    # Command override
    command: npm run dev
    entrypoint: /docker-entrypoint.sh

    # Working directory
    working_dir: /app

    # User
    user: "1000:1000"

    # Restart policy
    restart: always  # no, on-failure, unless-stopped

    # Dependencies
    depends_on:
      - db
      - redis

    # Resource limits
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

## Full Stack Example

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8080
    depends_on:
      - backend
    volumes:
      - ./frontend:/app
      - /app/node_modules
      - /app/.next

  backend:
    build: ./backend
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgres://postgres:postgres@db:5432/app
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=your-secret-key
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    volumes:
      - ./backend:/app
      - /app/node_modules

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: app
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - frontend
      - backend

volumes:
  postgres_data:
  redis_data:
```

## Networks

```yaml
services:
  app:
    networks:
      - frontend
      - backend

  db:
    networks:
      - backend

  nginx:
    networks:
      - frontend

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true  # No external access
```

## Health Checks

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
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
```

## Profiles

```yaml
services:
  app:
    profiles: []  # Always started

  debug:
    image: busybox
    profiles:
      - debug

  test:
    build:
      context: .
      dockerfile: Dockerfile.test
    profiles:
      - test

# Usage: docker compose --profile debug up
```

## Multiple Environments

```yaml
# docker-compose.yml (base)
services:
  app:
    build: .

# docker-compose.override.yml (development - auto-loaded)
services:
  app:
    volumes:
      - .:/app
    environment:
      - DEBUG=true

# docker-compose.prod.yml (production)
services:
  app:
    restart: always
    environment:
      - NODE_ENV=production

# Usage: docker compose -f docker-compose.yml -f docker-compose.prod.yml up
```

**Official docs:** https://docs.docker.com/compose/compose-file/
