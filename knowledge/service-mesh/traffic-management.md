# Service Mesh Traffic Management

## Overview

Traffic management is a core capability of service meshes, enabling fine-grained control over how requests flow between services. This includes traffic splitting for deployment strategies (canary, blue-green, A/B), circuit breaking to prevent cascading failures, rate limiting, load balancing algorithms, retry budgets, outlier detection, and traffic mirroring for testing. All of these are implemented at the proxy level, transparently to application code.

---

## Traffic Splitting Strategies

### Canary Deployment

Gradually shift traffic from the stable version to the new version while monitoring for errors.

```yaml
# Istio: Progressive canary (5% -> 25% -> 50% -> 100%)
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: api-service
spec:
  hosts:
    - api-service
  http:
    - route:
        - destination:
            host: api-service
            subset: stable
          weight: 95
        - destination:
            host: api-service
            subset: canary
          weight: 5

---
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: api-service
spec:
  host: api-service
  subsets:
    - name: stable
      labels:
        version: v1
    - name: canary
      labels:
        version: v2
```

### Blue-Green Deployment

Run two complete environments and switch traffic atomically.

```yaml
# Istio: Switch all traffic from blue to green
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: api-service
spec:
  hosts:
    - api-service
  http:
    # Active deployment: green
    - route:
        - destination:
            host: api-service
            subset: green
          weight: 100
        # Blue is still running but receives no traffic
        # Rollback: change weight to blue=100, green=0

---
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: api-service
spec:
  host: api-service
  subsets:
    - name: blue
      labels:
        deployment: blue
    - name: green
      labels:
        deployment: green
```

### A/B Testing (Header-Based Routing)

Route specific users to different versions based on request headers.

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: frontend
spec:
  hosts:
    - frontend
  http:
    # Users in experiment group B
    - match:
        - headers:
            x-experiment-group:
              exact: "group-b"
      route:
        - destination:
            host: frontend
            subset: experiment-b

    # Users in group A or no header
    - route:
        - destination:
            host: frontend
            subset: experiment-a
```

### Linkerd Traffic Split

```yaml
# SMI TrafficSplit for Linkerd
apiVersion: split.smi-spec.io/v1alpha2
kind: TrafficSplit
metadata:
  name: api-canary
  namespace: my-app
spec:
  service: api-service            # Root service
  backends:
    - service: api-service-v1
      weight: 900                 # 90%
    - service: api-service-v2
      weight: 100                 # 10%
```

---

## Circuit Breaking

Circuit breaking prevents a failing service from receiving more requests, allowing it to recover and protecting upstream services from cascading failures.

### Istio Circuit Breaker

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
        maxConnections: 100       # Max concurrent TCP connections
        connectTimeout: 5s        # TCP connection timeout
      http:
        http1MaxPendingRequests: 50   # Max queued requests
        http2MaxRequests: 200         # Max concurrent HTTP/2 requests
        maxRequestsPerConnection: 10  # Requests before recycling connection
        maxRetries: 3                 # Max concurrent retries
    outlierDetection:
      consecutive5xxErrors: 5     # Eject after 5 consecutive errors
      interval: 10s               # Analysis interval
      baseEjectionTime: 30s       # Min ejection time
      maxEjectionPercent: 50      # Never eject more than 50% of hosts
      minHealthPercent: 30        # Disable outlier detection if < 30% healthy
```

### Circuit Breaker States

```
CLOSED (normal operation)
  |
  | consecutive errors exceed threshold
  v
OPEN (requests fail fast with 503)
  |
  | baseEjectionTime expires
  v
HALF-OPEN (allow probe requests)
  |
  +-- probe succeeds --> CLOSED
  |
  +-- probe fails --> OPEN (with increased ejection time)
```

### Connection Pool Sizing Guidelines

```yaml
# Sizing based on expected load
# Formula: maxConnections >= (peak_rps * avg_latency_seconds) * safety_factor

# Example: 500 RPS, 50ms average latency, 2x safety factor
# maxConnections >= (500 * 0.05) * 2 = 50

trafficPolicy:
  connectionPool:
    tcp:
      maxConnections: 50
    http:
      # Pending requests queue = burst capacity
      # Should handle ~2-3 seconds of burst
      http1MaxPendingRequests: 100  # 500 RPS * 0.2s burst
      http2MaxRequests: 200
```

---

## Rate Limiting

### Istio Local Rate Limiting (Envoy)

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata:
  name: rate-limit
  namespace: my-app
spec:
  workloadSelector:
    labels:
      app: api-gateway
  configPatches:
    - applyTo: HTTP_FILTER
      match:
        context: SIDECAR_INBOUND
        listener:
          filterChain:
            filter:
              name: envoy.filters.network.http_connection_manager
      patch:
        operation: INSERT_BEFORE
        value:
          name: envoy.filters.http.local_ratelimit
          typed_config:
            "@type": type.googleapis.com/udpa.type.v1.TypedStruct
            type_url: type.googleapis.com/envoy.extensions.filters.http.local_ratelimit.v3.LocalRateLimit
            value:
              stat_prefix: http_local_rate_limiter
              token_bucket:
                max_tokens: 100
                tokens_per_fill: 100
                fill_interval: 60s        # 100 requests per minute
              filter_enabled:
                runtime_key: local_rate_limit_enabled
                default_value:
                  numerator: 100
                  denominator: HUNDRED
              filter_enforced:
                runtime_key: local_rate_limit_enforced
                default_value:
                  numerator: 100
                  denominator: HUNDRED
              response_headers_to_add:
                - append_action: OVERWRITE_IF_EXISTS_OR_ADD
                  header:
                    key: x-rate-limit
                    value: "100"
```

### Global Rate Limiting with External Service

```yaml
# Rate limit service deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ratelimit
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: ratelimit
          image: envoyproxy/ratelimit:latest
          env:
            - name: REDIS_SOCKET_TYPE
              value: tcp
            - name: REDIS_URL
              value: redis:6379
          volumeMounts:
            - name: config
              mountPath: /data/ratelimit/config
      volumes:
        - name: config
          configMap:
            name: ratelimit-config

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ratelimit-config
data:
  config.yaml: |
    domain: my-app
    descriptors:
      - key: header_match
        value: api-key
        rate_limit:
          unit: minute
          requests_per_unit: 60
      - key: remote_address
        rate_limit:
          unit: second
          requests_per_unit: 10
```

---

## Load Balancing Algorithms

### Istio Load Balancing Options

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: my-service
spec:
  host: my-service
  trafficPolicy:
    loadBalancer:
      # Option 1: Simple algorithms
      simple: ROUND_ROBIN          # Default, even distribution
      # simple: LEAST_REQUEST      # Route to endpoint with fewest active requests
      # simple: RANDOM             # Random selection
      # simple: PASSTHROUGH        # Use upstream cluster's LB setting

      # Option 2: Consistent hash (session affinity)
      # consistentHashLB:
      #   httpHeaderName: x-user-id       # Hash on header
      #   httpCookie:
      #     name: JSESSIONID              # Hash on cookie
      #     ttl: 0s
      #   useSourceIp: true               # Hash on source IP
      #   minimumRingSize: 1024
```

### Consistent Hash for Stateful Services

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: cache-service
spec:
  host: cache-service
  trafficPolicy:
    loadBalancer:
      consistentHashLB:
        httpHeaderName: x-cache-key    # Route same key to same instance
        minimumRingSize: 1024          # Ring size for distribution
```

---

## Retry Budgets

Retry budgets prevent retry storms where retries amplify failures by adding more load to already-struggling services.

### Istio Retry Configuration

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: order-service
spec:
  hosts:
    - order-service
  http:
    - route:
        - destination:
            host: order-service
      retries:
        attempts: 3                    # Max retry attempts
        perTryTimeout: 2s              # Timeout per attempt
        retryOn: 5xx,reset,connect-failure,retriable-4xx
        # retryOn values:
        #   5xx              - Server errors
        #   reset            - Connection reset
        #   connect-failure  - Connection failed
        #   retriable-4xx    - 409 Conflict
        #   gateway-error    - 502, 503, 504
        #   retriable-status-codes - Custom status codes
```

### Linkerd Retry Budget

```yaml
# Linkerd uses a budget-based approach
apiVersion: linkerd.io/v1alpha2
kind: ServiceProfile
metadata:
  name: order-service.my-app.svc.cluster.local
spec:
  retryBudget:
    retryRatio: 0.2                    # Max 20% extra requests from retries
    minRetriesPerSecond: 10            # Minimum floor
    ttl: 10s                           # Budget tracking window

  routes:
    - name: GET /api/orders
      condition:
        method: GET
        pathRegex: /api/orders
      isRetryable: true
      timeout: 5s

    - name: POST /api/orders
      condition:
        method: POST
        pathRegex: /api/orders
      isRetryable: false               # Never retry mutations
```

### Retry Budget Calculation

```
Given:
  - Normal traffic: 1000 RPS
  - retryRatio: 0.2
  - Error rate: 5%

Budget = 1000 * 0.2 = 200 retries/second max
Errors = 1000 * 0.05 = 50 errors/second

50 < 200, so all errors get retried.

If error rate rises to 25%:
  Errors = 250, but budget is 200
  Only 200 of 250 errors get retried (80%)
  Total load: 1000 + 200 = 1200 (managed, not 1250)

Without budget at 25% error rate:
  Total load: 1000 + 250 * 3 attempts = 1750 (amplification)
```

---

## Outlier Detection

Outlier detection automatically ejects unhealthy endpoints from the load balancing pool.

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: backend-service
spec:
  host: backend-service
  trafficPolicy:
    outlierDetection:
      # Ejection criteria
      consecutive5xxErrors: 5          # Eject after 5 consecutive 5xx
      consecutiveGatewayErrors: 3      # Eject after 3 gateway errors (502/503/504)
      interval: 10s                    # How often to check

      # Ejection behavior
      baseEjectionTime: 30s            # Initial ejection duration
      maxEjectionPercent: 50           # Never eject more than half
      minHealthPercent: 30             # Disable if cluster is < 30% healthy

      # Ejection duration increases: baseEjectionTime * consecutive_ejections
      # 1st: 30s, 2nd: 60s, 3rd: 90s, etc.
      # maxEjectionTime: 300s          # Cap at 5 minutes (Istio 1.20+)
```

---

## Traffic Mirroring (Shadowing)

Mirror production traffic to a test service for validation without affecting real users.

```yaml
# Istio: Mirror 100% of traffic to v2 for testing
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: api-service
spec:
  hosts:
    - api-service
  http:
    - route:
        - destination:
            host: api-service
            subset: v1
          weight: 100
      mirror:
        host: api-service
        subset: v2
      mirrorPercentage:
        value: 100.0               # Mirror 100% of traffic

# Mirrored traffic:
# - Requests are fire-and-forget (responses discarded)
# - Host header is appended with -shadow suffix
# - Does not affect response to the original client
# - Useful for testing new versions with real traffic patterns
```

### Partial Mirroring

```yaml
# Mirror only 10% of traffic (reduce load on shadow service)
http:
  - route:
      - destination:
          host: api-service
          subset: v1
    mirror:
      host: api-service
      subset: v2
    mirrorPercentage:
      value: 10.0
```

---

## Combined Traffic Management Example

A production-ready configuration combining multiple traffic management features.

```yaml
# DestinationRule with circuit breaking, load balancing, and outlier detection
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: payment-service
  namespace: production
spec:
  host: payment-service
  trafficPolicy:
    loadBalancer:
      simple: LEAST_REQUEST

    connectionPool:
      tcp:
        maxConnections: 100
        connectTimeout: 3s
      http:
        http1MaxPendingRequests: 50
        http2MaxRequests: 200
        maxRequestsPerConnection: 20
        maxRetries: 5

    outlierDetection:
      consecutive5xxErrors: 3
      interval: 15s
      baseEjectionTime: 30s
      maxEjectionPercent: 40

  subsets:
    - name: stable
      labels:
        version: v3
    - name: canary
      labels:
        version: v4
      trafficPolicy:
        connectionPool:
          http:
            http2MaxRequests: 50   # Conservative for canary

---
# VirtualService with canary, retries, timeout, and mirroring
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: payment-service
  namespace: production
spec:
  hosts:
    - payment-service
  http:
    - route:
        - destination:
            host: payment-service
            subset: stable
          weight: 95
        - destination:
            host: payment-service
            subset: canary
          weight: 5
      timeout: 10s
      retries:
        attempts: 2
        perTryTimeout: 4s
        retryOn: 5xx,reset,connect-failure
      mirror:
        host: payment-service-shadow    # Shadow environment
      mirrorPercentage:
        value: 5.0
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| Retries without timeout | Requests hang indefinitely | Always set perTryTimeout |
| Retrying non-idempotent operations | Duplicate charges, double writes | Only retry idempotent operations (GET, PUT, DELETE) |
| 100% ejection allowed | All endpoints ejected, total outage | Set maxEjectionPercent to 30-50% |
| No circuit breaker on external services | External failure cascades inward | Apply DestinationRule to ServiceEntry for externals |
| Canary with no automated rollback | Bad canary stays in rotation | Use Flagger or Argo Rollouts with metric gates |
| Mirror to undersized service | Shadow service overwhelmed | Size shadow service for expected traffic or reduce mirror % |
| Rate limits without error responses | Clients don't know they're limited | Return 429 with Retry-After header |
| Aggressive retry + no budget | Retry storm amplifies failures | Always configure retry budget (Linkerd) or limit attempts (Istio) |

---

## Production Checklist

- [ ] Traffic splitting strategy chosen (canary, blue-green, or A/B)
- [ ] Canary automation configured (Flagger or Argo Rollouts)
- [ ] Circuit breaker configured for all service-to-service calls
- [ ] Connection pool limits tuned based on load testing
- [ ] Outlier detection enabled with appropriate thresholds
- [ ] Rate limiting configured for public-facing endpoints
- [ ] Load balancing algorithm selected (LEAST_REQUEST recommended)
- [ ] Retry policy defined per route (idempotent operations only)
- [ ] Retry budget configured to prevent amplification
- [ ] Timeouts set on all routes (overall + per-try)
- [ ] Traffic mirroring used for pre-production validation
- [ ] Rollback procedure documented and tested
- [ ] Metrics dashboards tracking success rate, latency, circuit breaker state
- [ ] Alerting on circuit breaker open events and outlier ejections
