# Istio Service Mesh

## Overview

Istio is the most widely adopted service mesh, providing traffic management, security, and observability for microservices. It uses an **Envoy proxy sidecar** injected alongside each workload and a **control plane (istiod)** that configures the proxies. Istio intercepts all network traffic between services, enabling features like mTLS, traffic splitting, fault injection, and distributed tracing without application code changes.

---

## Architecture

```
                    +-----------+
                    |  istiod   |   Control Plane
                    | (Pilot,   |   - Configuration distribution (xDS)
                    |  Citadel, |   - Certificate authority (mTLS)
                    |  Galley)  |   - Service discovery
                    +-----+-----+
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
    | | Envoy     | |  <--->   | | Envoy      | |
    | | Sidecar   | |  mTLS    | | Sidecar    | |
    | +-----------+ |          | +------------+ |
    +---------------+          +----------------+
```

**istiod** consolidates three former components:
- **Pilot** -- Service discovery, traffic management configuration
- **Citadel** -- Certificate management for mTLS
- **Galley** -- Configuration validation and distribution

---

## Installation

### Using istioctl

```bash
# Download istioctl
curl -L https://istio.io/downloadIstio | sh -
cd istio-*
export PATH=$PWD/bin:$PATH

# Install with a profile
istioctl install --set profile=demo -y    # Demo: all features, good for testing
istioctl install --set profile=default -y  # Production: balanced
istioctl install --set profile=minimal -y  # Minimal: just istiod

# Verify installation
istioctl verify-install
kubectl get pods -n istio-system

# Enable sidecar injection for a namespace
kubectl label namespace default istio-injection=enabled
```

### Using Helm

```bash
# Add Istio Helm repo
helm repo add istio https://istio-release.storage.googleapis.com/charts
helm repo update

# Install base (CRDs)
helm install istio-base istio/base -n istio-system --create-namespace

# Install istiod
helm install istiod istio/istiod -n istio-system --wait \
  --set pilot.resources.requests.cpu=500m \
  --set pilot.resources.requests.memory=2Gi

# Install ingress gateway
helm install istio-ingress istio/gateway -n istio-ingress --create-namespace

# Verify
kubectl get pods -n istio-system
```

---

## VirtualService

VirtualService defines routing rules for traffic entering a service. It is the core traffic management resource.

```yaml
# Route all traffic to v1, except 20% to v2 (canary)
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: reviews
spec:
  hosts:
    - reviews                    # Kubernetes service name
  http:
    - match:
        - headers:
            end-user:
              exact: "jason"     # Route specific user to v2
      route:
        - destination:
            host: reviews
            subset: v2
    - route:                     # Default route with traffic split
        - destination:
            host: reviews
            subset: v1
          weight: 80
        - destination:
            host: reviews
            subset: v2
          weight: 20
      timeout: 5s
      retries:
        attempts: 3
        perTryTimeout: 2s
        retryOn: 5xx,reset,connect-failure
```

### URL-Based Routing

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: api-routing
spec:
  hosts:
    - api.example.com
  gateways:
    - api-gateway
  http:
    - match:
        - uri:
            prefix: /api/v2/
      route:
        - destination:
            host: api-v2
            port:
              number: 8080
    - match:
        - uri:
            prefix: /api/v1/
      route:
        - destination:
            host: api-v1
            port:
              number: 8080
    - route:                     # Default catch-all
        - destination:
            host: api-v1
            port:
              number: 8080
```

---

## DestinationRule

DestinationRule defines policies applied after routing: load balancing, connection pool settings, and outlier detection. It also defines subsets (versions) of a service.

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: reviews
spec:
  host: reviews
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        h2UpgradePolicy: DEFAULT
        http1MaxPendingRequests: 100
        http2MaxRequests: 1000
        maxRequestsPerConnection: 10
    loadBalancer:
      simple: LEAST_REQUEST       # ROUND_ROBIN, RANDOM, LEAST_REQUEST, PASSTHROUGH
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
      trafficPolicy:
        connectionPool:
          http:
            http2MaxRequests: 500   # Override for v2 (lower limit during canary)
```

---

## Gateway

Gateway configures a load balancer for HTTP/TCP traffic entering the mesh from the outside.

```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: api-gateway
  namespace: istio-ingress
spec:
  selector:
    istio: ingress               # Matches the ingress gateway deployment
  servers:
    - port:
        number: 443
        name: https
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: api-tls-cert   # Kubernetes secret with TLS cert
      hosts:
        - "api.example.com"
        - "*.example.com"
    - port:
        number: 80
        name: http
        protocol: HTTP
      hosts:
        - "api.example.com"
      tls:
        httpsRedirect: true      # Redirect HTTP to HTTPS
```

---

## Traffic Splitting for Canary Deployments

### Progressive Canary Rollout

```yaml
# Step 1: 5% canary
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: my-service
spec:
  hosts:
    - my-service
  http:
    - route:
        - destination:
            host: my-service
            subset: stable
          weight: 95
        - destination:
            host: my-service
            subset: canary
          weight: 5

---
# Step 2: 25% (after monitoring)
# Update weight to 75/25

---
# Step 3: 50%
# Update weight to 50/50

---
# Step 4: 100% (promote)
# Route all to new version, then update stable labels
```

### Automated Canary with Flagger

```yaml
apiVersion: flagger.app/v1beta1
kind: Canary
metadata:
  name: my-service
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-service
  service:
    port: 8080
  analysis:
    interval: 1m
    threshold: 5                  # Max failed checks before rollback
    maxWeight: 50                 # Max traffic percentage to canary
    stepWeight: 10                # Increment per interval
    metrics:
      - name: request-success-rate
        thresholdRange:
          min: 99                 # Must maintain 99%+ success rate
        interval: 1m
      - name: request-duration
        thresholdRange:
          max: 500                # P99 latency must stay under 500ms
        interval: 1m
```

---

## Fault Injection

Test resilience by injecting failures.

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: ratings
spec:
  hosts:
    - ratings
  http:
    - fault:
        delay:
          percentage:
            value: 10             # 10% of requests
          fixedDelay: 5s          # 5-second delay
        abort:
          percentage:
            value: 5              # 5% of requests
          httpStatus: 503         # Return 503
      route:
        - destination:
            host: ratings
            subset: v1
```

### Targeted Fault Injection

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: ratings
spec:
  hosts:
    - ratings
  http:
    # Inject faults only for test traffic
    - match:
        - headers:
            x-test-chaos:
              exact: "true"
      fault:
        abort:
          percentage:
            value: 100
          httpStatus: 500
      route:
        - destination:
            host: ratings
    # Normal traffic unaffected
    - route:
        - destination:
            host: ratings
```

---

## Timeout and Retry Policies

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: payment-service
spec:
  hosts:
    - payment-service
  http:
    - route:
        - destination:
            host: payment-service
      timeout: 10s                # Overall request timeout
      retries:
        attempts: 3
        perTryTimeout: 3s         # Timeout per retry attempt
        retryOn: 5xx,reset,connect-failure,retriable-4xx
        retryRemoteLocalities: true  # Retry on remote clusters too
```

### Circuit Breaking via DestinationRule

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: payment-service
spec:
  host: payment-service
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 50
      http:
        http1MaxPendingRequests: 50
        http2MaxRequests: 100
        maxRetries: 3
    outlierDetection:
      consecutive5xxErrors: 3     # Eject after 3 consecutive 5xx
      interval: 15s               # Check every 15 seconds
      baseEjectionTime: 30s       # Eject for 30 seconds minimum
      maxEjectionPercent: 30      # Never eject more than 30% of hosts
```

---

## Observability

### Distributed Tracing (Jaeger)

```yaml
# Istio automatically generates trace spans
# Application must propagate trace headers:
# x-request-id, x-b3-traceid, x-b3-spanid, x-b3-parentspanid, x-b3-sampled

apiVersion: telemetry.istio.io/v1
kind: Telemetry
metadata:
  name: tracing-config
  namespace: istio-system
spec:
  tracing:
    - providers:
        - name: jaeger
      randomSamplingPercentage: 10   # Sample 10% of traces
```

### Access Logging

```yaml
apiVersion: telemetry.istio.io/v1
kind: Telemetry
metadata:
  name: access-log
  namespace: istio-system
spec:
  accessLogging:
    - providers:
        - name: envoy
      filter:
        expression: "response.code >= 400"  # Only log errors
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| Injecting sidecars in all namespaces | Performance overhead, kube-system breakage | Label specific namespaces only |
| No resource limits on Envoy sidecar | Memory/CPU contention | Set proxy resource limits in mesh config |
| 100% trace sampling in production | Massive storage costs | Sample 1-10% in production |
| Retry without timeout | Cascading failures | Always pair retries with per-try timeout |
| Circuit breaker thresholds too aggressive | False positives under normal load | Tune based on baseline error rates |
| Mixing Istio and Kubernetes Ingress | Conflicting routing rules | Use Istio Gateway exclusively |
| Not propagating trace headers | Broken distributed traces | Forward all x-b3-* and x-request-id headers |

---

## Production Checklist

- [ ] Istio installed with production profile (not demo)
- [ ] Sidecar injection enabled only on application namespaces
- [ ] Envoy proxy resource limits configured
- [ ] mTLS enabled in STRICT mode (see mtls.md)
- [ ] Gateway configured with TLS termination
- [ ] VirtualService timeouts set for all services
- [ ] DestinationRule outlier detection configured
- [ ] Connection pool limits tuned for expected load
- [ ] Distributed tracing configured with appropriate sampling rate
- [ ] Access logging enabled for error responses
- [ ] Canary deployment strategy configured with Flagger or manual weights
- [ ] Istio version upgrade plan documented (canary control plane upgrade)
- [ ] Prometheus scraping Istio metrics
- [ ] Grafana dashboards for mesh overview, service-level metrics
