# Docker Compose Commands Quick Reference

> **Knowledge Base:** Read `knowledge/docker-compose/commands.md` for complete documentation.

## Basic Commands

```bash
# Start services
docker compose up
docker compose up -d              # Detached mode
docker compose up --build         # Rebuild images
docker compose up --force-recreate # Recreate containers

# Stop services
docker compose down
docker compose down -v            # Remove volumes
docker compose down --rmi all     # Remove images
docker compose down --rmi local   # Remove only local images

# Restart
docker compose restart
docker compose restart app        # Specific service

# Start/Stop without recreating
docker compose start
docker compose stop
```

## Build

```bash
# Build images
docker compose build
docker compose build --no-cache
docker compose build app          # Specific service
docker compose build --pull       # Pull base images

# Build and start
docker compose up --build
```

## Logs

```bash
# View logs
docker compose logs
docker compose logs -f            # Follow
docker compose logs app           # Specific service
docker compose logs --tail 100    # Last 100 lines
docker compose logs --since 1h    # Since 1 hour ago
docker compose logs -f app db     # Multiple services
```

## Exec & Run

```bash
# Execute command in running container
docker compose exec app sh
docker compose exec app npm test
docker compose exec -u root app bash  # As root

# Run one-off command (new container)
docker compose run app npm test
docker compose run --rm app npm test  # Remove after
docker compose run -e DEBUG=true app  # With env var
```

## Status & Info

```bash
# List containers
docker compose ps
docker compose ps -a              # Include stopped

# List images
docker compose images

# View config
docker compose config             # Validate and view
docker compose config --services  # List services

# Top (processes)
docker compose top
docker compose top app
```

## Scaling

```bash
# Scale services (legacy)
docker compose up -d --scale app=3

# Scale specific service
docker compose up -d --scale worker=5
```

## Managing Services

```bash
# Pull images
docker compose pull
docker compose pull app           # Specific service

# Push images
docker compose push

# Create without starting
docker compose create

# Pause/Unpause
docker compose pause
docker compose unpause

# Kill (force stop)
docker compose kill
```

## Cleanup

```bash
# Remove stopped containers
docker compose rm
docker compose rm -f              # Force
docker compose rm -s              # Stop first

# Remove volumes
docker compose down -v

# Remove everything
docker compose down --rmi all -v --remove-orphans
```

## Multiple Files & Environments

```bash
# Specify compose file
docker compose -f docker-compose.prod.yml up

# Multiple files (merged)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up

# Specify project name
docker compose -p myproject up

# Use .env file
docker compose --env-file .env.production up

# Profiles
docker compose --profile debug up
docker compose --profile test up
```

## Copy Files

```bash
# Copy from container
docker compose cp app:/app/file.txt ./file.txt

# Copy to container
docker compose cp ./file.txt app:/app/file.txt
```

## Events & Wait

```bash
# Stream events
docker compose events

# Wait for service to be healthy
docker compose up -d
docker compose exec app wait-for-it db:5432

# Using depends_on with condition
# In docker-compose.yml:
# depends_on:
#   db:
#     condition: service_healthy
```

## Common Workflows

```bash
# Development workflow
docker compose up -d
docker compose logs -f app
docker compose exec app npm test
docker compose down

# Production deployment
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose logs -f

# Database reset
docker compose down -v
docker compose up -d db
docker compose exec app npm run migrate
docker compose up -d

# Rebuild single service
docker compose build app
docker compose up -d --no-deps app

# View service config
docker compose config --services
docker compose ps app
docker compose logs app
```

## Environment Variables

```bash
# Pass env var to compose
DEBUG=true docker compose up

# Use .env file (auto-loaded)
# .env:
# POSTGRES_PASSWORD=secret

# Specify env file
docker compose --env-file .env.local up

# Variable in compose file
# environment:
#   - DATABASE_URL=${DATABASE_URL:-postgres://localhost/db}
```

**Official docs:** https://docs.docker.com/compose/reference/
