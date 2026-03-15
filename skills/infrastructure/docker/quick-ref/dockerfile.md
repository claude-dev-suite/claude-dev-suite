# Dockerfile Quick Reference

> **Knowledge Base:** Read `knowledge/docker/dockerfile.md` for complete documentation.

## Basic Structure

```dockerfile
# Base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production

# Start command
CMD ["node", "server.js"]
```

## Multi-Stage Build (Production)

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy only necessary files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser
USER appuser

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

## Common Instructions

```dockerfile
# FROM - Base image
FROM ubuntu:22.04
FROM node:20-alpine AS builder
FROM --platform=linux/amd64 python:3.11

# WORKDIR - Set working directory
WORKDIR /app
WORKDIR /home/user/app

# COPY - Copy files
COPY . .
COPY package*.json ./
COPY --from=builder /app/dist ./dist
COPY --chown=user:group file.txt .

# ADD - Copy + extract archives + download URLs
ADD archive.tar.gz /app/
ADD https://example.com/file.txt /app/

# RUN - Execute commands
RUN npm install
RUN apt-get update && apt-get install -y curl \
    && rm -rf /var/lib/apt/lists/*

# ENV - Set environment variables
ENV NODE_ENV=production
ENV PORT=3000 HOST=0.0.0.0

# ARG - Build-time variables
ARG VERSION=latest
ARG NODE_VERSION=20

# EXPOSE - Document port
EXPOSE 3000
EXPOSE 80 443

# USER - Set user
USER node
USER 1000:1000

# CMD - Default command (overridable)
CMD ["npm", "start"]
CMD ["node", "server.js"]

# ENTRYPOINT - Main executable
ENTRYPOINT ["docker-entrypoint.sh"]
ENTRYPOINT ["npm", "run"]

# HEALTHCHECK - Container health
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# LABEL - Metadata
LABEL maintainer="dev@example.com"
LABEL version="1.0"
```

## Python Example

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Java/Spring Boot Example

```dockerfile
# Build stage
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn package -DskipTests

# Run stage
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

## .dockerignore

```
node_modules
npm-debug.log
.git
.gitignore
.env
.env.*
Dockerfile*
docker-compose*
.dockerignore
README.md
.vscode
coverage
dist
*.log
```

## Best Practices

```dockerfile
# 1. Use specific tags, not :latest
FROM node:20.10-alpine

# 2. Minimize layers - combine RUN commands
RUN apt-get update \
    && apt-get install -y curl git \
    && rm -rf /var/lib/apt/lists/*

# 3. Order for cache efficiency (least to most changing)
COPY package*.json ./
RUN npm ci
COPY . .

# 4. Use non-root user
USER node

# 5. Use COPY instead of ADD (unless extracting)
COPY requirements.txt .

# 6. Set proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
```

## CLI Commands

```bash
# Build image
docker build -t myapp:1.0 .
docker build -f Dockerfile.prod -t myapp:prod .
docker build --build-arg VERSION=1.0 -t myapp .

# Run container
docker run -p 3000:3000 myapp
docker run -d --name myapp -p 3000:3000 myapp
docker run -e NODE_ENV=production myapp
docker run -v $(pwd):/app myapp

# Manage containers
docker ps
docker logs myapp
docker exec -it myapp sh
docker stop myapp
docker rm myapp
```

**Official docs:** https://docs.docker.com/reference/dockerfile/
