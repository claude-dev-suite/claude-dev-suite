# Linkerd Service Mesh

## Overview

Linkerd is an ultralight, security-first service mesh for Kubernetes. Created by Buoyant (who coined the term "service mesh"), Linkerd focuses on simplicity, performance, and operational ease. It uses a purpose-built Rust-based micro-proxy (linkerd2-proxy) instead of Envoy, resulting in significantly lower resource consumption and latency overhead compared to Istio.

---

## Architecture

```
                    +------------------+
                    |  Control Plane   |
                    |                  |
                    | +- destination -+|  Service discovery, policy
                    | +- identity ----+|  Certificate authority (mTLS)
                    | +- proxy-injector+| Sidecar injection webhook
                    +--------+---------+
                             |
               +-------------+-------------+
               |                           |
       +-------+-------+          +--------+-------+
       |  Pod A        |          |  Pod B         |
       | +-----------+ |          | +-----------+  |
       | | App       | |          | | App       |  |
       | | Container | |          | | Container |  |
       | +-----+-----+ |          | +-----+-----+ |
       |       |       |          |       |        |
       | +-----+-----+ |          | +-----+------+ |
       | | linkerd2  | |  <--->   | | linkerd2   | |
       | | proxy     | |  mTLS    | | proxy      | |
       | | (Rust)    | |          | | (Rust)     | |
       | +-----------+ |          | +------------+ |
       +---------------+          +----------------+
```

### Key Differences from Istio

| Aspect | Linkerd | Istio |
|--------|---------|-------|
| Proxy | linkerd2-proxy (Rust, purpose-built) | Envoy (C++, general-purpose) |
| Memory per sidecar | ~10-20 MB | ~50-100 MB |
| P99 latency overhead | < 1ms | 2-5ms |
| Configuration complexity | Low (sane defaults) | High (many CRDs) |
| Feature breadth | Focused (core mesh features) | Extensive (Wasm, advanced routing) |
| Learning curve | Days | Weeks |
| mTLS | On by default | Requires configuration |
| Multi-cluster | Built-in | Requires additional setup |

---

## Installation

```bash
# Install the CLI
curl --proto '=https' --tlsv1.2 -sSfL https://run.linkerd.io/install | sh
export PATH=$HOME/.linkerd2/bin:$PATH

# Validate cluster prerequisites
linkerd check --pre

# Install CRDs
linkerd install --crds | kubectl apply -f -

# Install control plane
linkerd install | kubectl apply -f -

# Verify installation
linkerd check

# Install the viz extension (dashboard, Prometheus, Grafana)
linkerd viz install | kubectl apply -f -
linkerd viz check

# Open dashboard
linkerd viz dashboard
```

### Helm Installation

```bash
# Add Helm repo
helm repo add linkerd-edge https://helm.linkerd.io/edge
helm repo update

# Generate certificates (required for production)
step certificate create root.linkerd.cluster.local ca.crt ca.key \
  --profile root-ca --no-password --insecure

step certificate create identity.linkerd.cluster.local issuer.crt issuer.key \
  --profile intermediate-ca --no-password --insecure \
  --ca ca.crt --ca-key ca.key

# Install CRDs
helm install linkerd-crds linkerd-edge/linkerd-crds -n linkerd --create-namespace

# Install control plane with custom trust anchor
helm install linkerd-control-plane linkerd-edge/linkerd-control-plane \
  -n linkerd \
  --set identity.trustAnchorsPEM="$(cat ca.crt)" \
  --set identity.issuer.tls.crtPEM="$(cat issuer.crt)" \
  --set identity.issuer.tls.keyPEM="$(cat issuer.key)"
```

---

## Injecting the Proxy

### Namespace-Level Injection

```yaml
# Annotate namespace for automatic injection
apiVersion: v1
kind: Namespace
metadata:
  name: my-app
  annotations:
    linkerd.io/inject: enabled
```

### Manual Injection

```bash
# Inject sidecars into existing deployment
kubectl get deploy -n my-app -o yaml | linkerd inject - | kubectl apply -f -

# Inject a specific file
linkerd inject deployment.yaml | kubectl apply -f -

# Verify injection
linkerd check --proxy -n my-app
```

---

## Service Profiles

Service profiles define per-route metrics, retries, and timeouts. They are the primary way to configure service-level behavior in Linkerd.

```yaml
apiVersion: linkerd.io/v1alpha2
kind: ServiceProfile
metadata:
  name: orders.my-app.svc.cluster.local
  namespace: my-app
spec:
  routes:
    - name: GET /api/orders
      condition:
        method: GET
        pathRegex: /api/orders
      responseClasses:
        - condition:
            status:
              min: 500
              max: 599
          isFailure: true
      isRetryable: true          # Enable retries for this route
      timeout: 5s                # Per-route timeout

    - name: POST /api/orders
      condition:
        method: POST
        pathRegex: /api/orders
      isRetryable: false         # Do NOT retry POST (not idempotent)
      timeout: 10s

    - name: GET /api/orders/{id}
      condition:
        method: GET
        pathRegex: /api/orders/[^/]+
      isRetryable: true
      timeout: 3s

  retryBudget:
    retryRatio: 0.2              # Max 20% extra load from retries
    minRetriesPerSecond: 10
    ttl: 10s
```

### Generate Service Profile from OpenAPI

```bash
# Auto-generate from Swagger/OpenAPI spec
linkerd profile --open-api swagger.yaml orders.my-app.svc.cluster.local | kubectl apply -f -

# Generate from live traffic observation
linkerd profile --tap deploy/orders --tap-duration 30s --tap-route-limit 10 \
  orders.my-app.svc.cluster.local | kubectl apply -f -
```

---

## Traffic Split

Linkerd uses the SMI (Service Mesh Interface) TrafficSplit resource for canary deployments and traffic shifting.

```yaml
# Deploy both versions
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-v1
  namespace: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
      version: v1
  template:
    metadata:
      labels:
        app: web
        version: v1
    spec:
      containers:
        - name: web
          image: my-app/web:1.0.0
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-v2
  namespace: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
      version: v2
  template:
    metadata:
      labels:
        app: web
        version: v2
    spec:
      containers:
        - name: web
          image: my-app/web:2.0.0
---
# Leaf services (backends for traffic split)
apiVersion: v1
kind: Service
metadata:
  name: web-v1
  namespace: my-app
spec:
  selector:
    app: web
    version: v1
  ports:
    - port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: web-v2
  namespace: my-app
spec:
  selector:
    app: web
    version: v2
  ports:
    - port: 8080
---
# Traffic split: 90% to v1, 10% to v2
apiVersion: split.smi-spec.io/v1alpha2
kind: TrafficSplit
metadata:
  name: web-split
  namespace: my-app
spec:
  service: web                   # Root service (what clients call)
  backends:
    - service: web-v1
      weight: 900                # 90%
    - service: web-v2
      weight: 100                # 10%
```

### Progressive Rollout with Flagger

```yaml
apiVersion: flagger.app/v1beta1
kind: Canary
metadata:
  name: web
  namespace: my-app
spec:
  provider: linkerd
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  service:
    port: 8080
  analysis:
    interval: 30s
    threshold: 5
    maxWeight: 50
    stepWeight: 5
    metrics:
      - name: request-success-rate
        thresholdRange:
          min: 99
        interval: 1m
      - name: request-duration
        thresholdRange:
          max: 500
        interval: 1m
```

---

## Retries and Timeouts

### Global Retry Budget

```yaml
# In ServiceProfile
spec:
  retryBudget:
    retryRatio: 0.2              # No more than 20% additional requests from retries
    minRetriesPerSecond: 10      # Always allow at least 10 retries/sec
    ttl: 10s                     # How long to remember retry budget usage
```

### Per-Route Configuration

```yaml
spec:
  routes:
    - name: GET /health
      condition:
        method: GET
        pathRegex: /health
      isRetryable: false         # Never retry health checks
      timeout: 1s

    - name: GET /api/data
      condition:
        method: GET
        pathRegex: /api/data
      isRetryable: true          # Safe to retry (idempotent)
      timeout: 5s
```

---

## Multi-Cluster

Linkerd supports multi-cluster service discovery through a gateway model.

```bash
# Link two clusters
# On the target cluster: install multi-cluster extension
linkerd multicluster install | kubectl apply -f -

# On the source cluster: link to target
linkerd multicluster link --cluster-name target \
  --api-server-address https://target-api:6443 | kubectl apply -f -

# Verify link
linkerd multicluster check
linkerd multicluster gateways

# Mirror services from target cluster
# Services with the label mirror.linkerd.io/exported=true
# become available as service-name.namespace.svc.target.cluster.local
```

```yaml
# Export a service for multi-cluster access
apiVersion: v1
kind: Service
metadata:
  name: orders
  namespace: my-app
  labels:
    mirror.linkerd.io/exported: "true"  # Makes this service available cross-cluster
spec:
  selector:
    app: orders
  ports:
    - port: 8080
```

---

## Observability

### Live Traffic Monitoring

```bash
# Watch live requests to a deployment
linkerd viz tap deploy/web -n my-app

# Filter by specific route
linkerd viz tap deploy/web -n my-app --path /api/orders --method GET

# Top routes by request volume
linkerd viz routes deploy/web -n my-app

# Service-to-service metrics
linkerd viz edges deploy -n my-app

# Per-route success rate and latency
linkerd viz routes deploy/web -n my-app --to deploy/orders
```

### Golden Metrics

```bash
# Success rate, request rate, and latency per deployment
linkerd viz stat deploy -n my-app

# Output:
# NAME    MESHED   SUCCESS   RPS   LATENCY_P50   LATENCY_P95   LATENCY_P99
# web     3/3      99.85%    45.2  3ms           12ms          45ms
# orders  2/2      99.92%    22.1  5ms           18ms          72ms
# payment 2/2      98.70%    8.4   15ms          85ms          250ms
```

---

## Resource Comparison with Istio

### Sidecar Resource Usage (Measured)

| Metric | Linkerd (linkerd2-proxy) | Istio (Envoy) |
|--------|------------------------|---------------|
| Memory (idle) | ~10 MB | ~50 MB |
| Memory (under load) | ~20 MB | ~100 MB |
| CPU (idle) | ~1m | ~10m |
| CPU (1000 RPS) | ~50m | ~150m |
| P50 latency added | < 0.5ms | ~1ms |
| P99 latency added | < 1ms | ~3ms |
| Startup time | ~2s | ~5s |

### Control Plane Resources

| Component | Linkerd | Istio |
|-----------|---------|-------|
| Control plane pods | 3 (destination, identity, proxy-injector) | 1-3 (istiod, optional gateways) |
| Control plane memory | ~200 MB total | ~1 GB total |
| CRDs | ~10 | ~30 |

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| Retrying non-idempotent requests (POST, DELETE) | Duplicate side effects | Only set `isRetryable: true` for GET/HEAD |
| No retry budget | Retry storms amplify failures | Always configure `retryBudget` in ServiceProfile |
| Skipping `linkerd check` | Misconfigurations go undetected | Run `linkerd check` after every change |
| Ignoring certificate rotation | Certificates expire, mTLS breaks | Automate cert rotation (cert-manager integration) |
| Not using ServiceProfiles | No per-route metrics or control | Define profiles for all critical services |
| Injecting into system namespaces | Can break cluster components | Only inject into application namespaces |
| Manual traffic split percentage management | Error-prone, slow rollouts | Use Flagger for automated canary analysis |

---

## Production Checklist

- [ ] Control plane installed with externally managed trust anchor certificates
- [ ] Certificate rotation automated (cert-manager or external CA)
- [ ] Proxy injection enabled on application namespaces only
- [ ] ServiceProfiles defined for critical services with routes
- [ ] Retry budget configured to prevent retry storms
- [ ] Timeouts set on all routes
- [ ] Viz extension installed for observability
- [ ] Prometheus scraping Linkerd metrics
- [ ] Grafana dashboards configured for golden metrics
- [ ] Multi-cluster links established if running across clusters
- [ ] `linkerd check` passing cleanly
- [ ] Upgrade plan documented (control plane, then data plane)
- [ ] Resource limits reviewed for proxy containers
- [ ] High-availability mode enabled for control plane (2+ replicas)
