# Container Security Skill

> **USE WHEN:** Securing Docker containers, Kubernetes deployments, or reviewing container configurations.
> **DO NOT USE FOR:** General Docker usage (use docker skill), Kubernetes architecture (use kubernetes skill).

## Docker Security Best Practices

### Dockerfile Hardening

```dockerfile
# Bad: Running as root
FROM node:20
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]

# Good: Non-root user, minimal image, multi-stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Copy only necessary files
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

USER nodejs
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
```

### Minimal Base Images

| Image Type | Security Level | Use Case |
|------------|----------------|----------|
| `scratch` | Highest | Go/Rust static binaries |
| `distroless` | Very High | Java, Node.js, Python |
| `alpine` | High | General purpose |
| `slim` | Medium | Debian minimal |
| `full` | Low | Development only |

```dockerfile
# Distroless for Java
FROM gcr.io/distroless/java21-debian12
COPY --chown=nonroot:nonroot target/app.jar /app.jar
USER nonroot
CMD ["app.jar"]

# Distroless for Node.js
FROM gcr.io/distroless/nodejs20-debian12
COPY --chown=nonroot:nonroot dist/ /app/
WORKDIR /app
USER nonroot
CMD ["server.js"]
```

### Image Scanning

```bash
# Trivy (comprehensive)
trivy image myapp:latest
trivy image --severity HIGH,CRITICAL myapp:latest
trivy image --ignore-unfixed myapp:latest

# Docker Scout
docker scout cves myapp:latest
docker scout recommendations myapp:latest

# Grype
grype myapp:latest

# Snyk
snyk container test myapp:latest
```

### Docker Daemon Security

```json
// /etc/docker/daemon.json
{
  "icc": false,
  "userns-remap": "default",
  "no-new-privileges": true,
  "live-restore": true,
  "userland-proxy": false,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

## Container Runtime Security

### Docker Run Security Options

```bash
# Bad: Full privileges
docker run --privileged myapp

# Good: Minimal privileges
docker run \
  --security-opt=no-new-privileges:true \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid \
  --user 1001:1001 \
  --memory=512m \
  --cpu-shares=512 \
  --pids-limit=100 \
  myapp
```

### Capabilities Reference

| Capability | Purpose | Usually Needed |
|------------|---------|----------------|
| `NET_BIND_SERVICE` | Bind ports < 1024 | Sometimes |
| `CHOWN` | Change file ownership | Rarely |
| `SETUID/SETGID` | Change UID/GID | Rarely |
| `SYS_ADMIN` | Admin operations | Never in prod |
| `SYS_PTRACE` | Debugging | Never in prod |

### Docker Compose Security

```yaml
version: '3.8'

services:
  app:
    image: myapp:latest
    user: "1001:1001"
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
          pids: 100
        reservations:
          memory: 256M
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    networks:
      - internal
    secrets:
      - db_password

  db:
    image: postgres:16-alpine
    user: "70:70"  # postgres user
    volumes:
      - db_data:/var/lib/postgresql/data:rw
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    networks:
      - internal

networks:
  internal:
    driver: bridge
    internal: true

secrets:
  db_password:
    file: ./secrets/db_password.txt

volumes:
  db_data:
```

## Kubernetes Security

### Pod Security Standards

```yaml
# Restricted Pod (highest security)
apiVersion: v1
kind: Pod
metadata:
  name: secure-app
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1001
    runAsGroup: 1001
    fsGroup: 1001
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: app
      image: myapp:latest
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop:
            - ALL
      resources:
        limits:
          cpu: "500m"
          memory: "512Mi"
          ephemeral-storage: "1Gi"
        requests:
          cpu: "100m"
          memory: "256Mi"
      volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: cache
          mountPath: /app/.cache
  volumes:
    - name: tmp
      emptyDir:
        medium: Memory
        sizeLimit: 64Mi
    - name: cache
      emptyDir:
        sizeLimit: 128Mi
  automountServiceAccountToken: false
```

### Pod Security Admission

```yaml
# Namespace with enforced security
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### Network Policies

```yaml
# Deny all by default
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress

---
# Allow specific traffic
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-app-to-db
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: myapp
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
```

### RBAC Best Practices

```yaml
# Minimal ServiceAccount
apiVersion: v1
kind: ServiceAccount
metadata:
  name: myapp
  namespace: production
automountServiceAccountToken: false

---
# Minimal Role
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: myapp-role
  namespace: production
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames: ["myapp-config"]
    verbs: ["get"]

---
# RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: myapp-binding
  namespace: production
subjects:
  - kind: ServiceAccount
    name: myapp
    namespace: production
roleRef:
  kind: Role
  name: myapp-role
  apiGroup: rbac.authorization.k8s.io
```

### Secrets Management

```yaml
# Bad: Plain secret in manifest
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
stringData:
  password: "mysecretpassword"  # Don't commit this!

# Good: External Secrets Operator
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-credentials
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: db-credentials
  data:
    - secretKey: password
      remoteRef:
        key: secret/data/production/db
        property: password
```

## Container Scanning in CI/CD

```yaml
# GitHub Actions
name: Container Security
on:
  push:
    branches: [main]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build -t myapp:${{ github.sha }} .

      - name: Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: myapp:${{ github.sha }}
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'

      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-results.sarif'

      - name: Dockle lint
        uses: erzz/dockle-action@v1
        with:
          image: myapp:${{ github.sha }}
          failure-threshold: high
```

## Security Scanning Tools Comparison

| Tool | Focus | OSS | Enterprise |
|------|-------|-----|------------|
| **Trivy** | Vulnerabilities, misconfig, secrets | Yes | Aqua |
| **Grype** | Vulnerabilities | Yes | Anchore |
| **Snyk** | Vulnerabilities, license | Partial | Yes |
| **Docker Scout** | Vulnerabilities, SBOM | Partial | Yes |
| **Dockle** | Best practices | Yes | - |
| **Hadolint** | Dockerfile linting | Yes | - |

## Quick Reference Commands

```bash
# Scan image for vulnerabilities
trivy image --severity HIGH,CRITICAL myapp:latest

# Lint Dockerfile
hadolint Dockerfile

# Check running container security
docker inspect --format='{{.HostConfig.Privileged}}' container_id

# Audit Kubernetes cluster
kubectl get pods --all-namespaces -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}: privileged={.spec.containers[*].securityContext.privileged}{"\n"}{end}'

# Check for root containers
kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.name}: runAsNonRoot={.spec.securityContext.runAsNonRoot}{"\n"}{end}'
```
