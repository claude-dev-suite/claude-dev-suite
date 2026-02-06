# Docker Commands Quick Reference

> **Knowledge Base:** Read `knowledge/docker/commands.md` for complete documentation.

## Images

```bash
# Build
docker build -t myapp .
docker build -t myapp:1.0 .
docker build -f Dockerfile.prod -t myapp:prod .
docker build --build-arg VERSION=1.0 -t myapp .
docker build --no-cache -t myapp .

# List images
docker images
docker images -a  # Include intermediate images

# Pull/Push
docker pull nginx:alpine
docker push myregistry/myapp:1.0

# Tag
docker tag myapp:latest myregistry/myapp:1.0

# Remove
docker rmi myapp:1.0
docker rmi $(docker images -q)  # Remove all
docker image prune  # Remove unused
docker image prune -a  # Remove all unused
```

## Containers

```bash
# Run
docker run nginx
docker run -d nginx                    # Detached
docker run -p 8080:80 nginx            # Port mapping
docker run -p 127.0.0.1:8080:80 nginx  # Specific host
docker run --name mycontainer nginx    # Named container
docker run -e MY_VAR=value nginx       # Environment variable
docker run --env-file .env nginx       # Env file
docker run -v /host/path:/container/path nginx  # Volume
docker run --rm nginx                  # Auto-remove on exit
docker run -it ubuntu bash             # Interactive terminal

# List
docker ps              # Running containers
docker ps -a           # All containers
docker ps -q           # Only IDs
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Manage
docker start mycontainer
docker stop mycontainer
docker restart mycontainer
docker pause mycontainer
docker unpause mycontainer
docker kill mycontainer

# Remove
docker rm mycontainer
docker rm -f mycontainer  # Force remove running
docker rm $(docker ps -aq)  # Remove all
docker container prune  # Remove stopped

# Exec
docker exec mycontainer ls /app
docker exec -it mycontainer sh
docker exec -it mycontainer bash
docker exec -u root mycontainer command

# Logs
docker logs mycontainer
docker logs -f mycontainer  # Follow
docker logs --tail 100 mycontainer
docker logs --since 1h mycontainer

# Inspect
docker inspect mycontainer
docker inspect --format '{{.NetworkSettings.IPAddress}}' mycontainer

# Stats
docker stats
docker stats mycontainer
docker top mycontainer

# Copy files
docker cp mycontainer:/app/file.txt ./file.txt
docker cp ./file.txt mycontainer:/app/file.txt
```

## Volumes

```bash
# Create
docker volume create myvolume

# List
docker volume ls

# Inspect
docker volume inspect myvolume

# Remove
docker volume rm myvolume
docker volume prune  # Remove unused

# Use volume
docker run -v myvolume:/app/data nginx
docker run -v $(pwd):/app nginx  # Bind mount
docker run -v /app/node_modules nginx  # Anonymous volume
```

## Networks

```bash
# Create
docker network create mynetwork
docker network create --driver bridge mynetwork

# List
docker network ls

# Inspect
docker network inspect mynetwork

# Connect/Disconnect
docker network connect mynetwork mycontainer
docker network disconnect mynetwork mycontainer

# Remove
docker network rm mynetwork
docker network prune

# Run with network
docker run --network mynetwork nginx
docker run --network host nginx  # Use host network
docker run --network none nginx  # No network
```

## Cleanup

```bash
# Remove stopped containers
docker container prune

# Remove unused images
docker image prune
docker image prune -a  # Include unused

# Remove unused volumes
docker volume prune

# Remove unused networks
docker network prune

# Remove everything unused
docker system prune
docker system prune -a --volumes

# Disk usage
docker system df
```

## Registry & Login

```bash
# Login
docker login
docker login registry.example.com
docker login -u username -p password

# Logout
docker logout

# Push to registry
docker tag myapp registry.example.com/myapp:1.0
docker push registry.example.com/myapp:1.0

# Pull from registry
docker pull registry.example.com/myapp:1.0
```

## Debugging

```bash
# Interactive shell in running container
docker exec -it mycontainer sh

# Run new container with shell
docker run -it --rm ubuntu bash

# Check container health
docker inspect --format='{{.State.Health.Status}}' mycontainer

# View resource usage
docker stats --no-stream

# Export/Import container
docker export mycontainer > container.tar
docker import container.tar myimage:tag

# Save/Load image
docker save myimage > image.tar
docker load < image.tar
```

**Official docs:** https://docs.docker.com/reference/cli/docker/
