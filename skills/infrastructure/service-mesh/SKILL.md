---
name: service-mesh
description: |
  Service mesh patterns and implementations. Istio, Linkerd, traffic management,
  mutual TLS, observability, circuit breaking, and canary routing at the
  infrastructure level.

  USE WHEN: user mentions "service mesh", "Istio", "Linkerd", "sidecar proxy",
  "mutual TLS", "mTLS", "traffic splitting", "Envoy", "mesh"

  DO NOT USE FOR: API gateway patterns - use `api-gateway`;
  in-app resilience - use `resilience-patterns`;
  Kubernetes basics - use `kubernetes`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Service Mesh

## Architecture

```
┌─────────────────────────────┐
│         Control Plane        │  (Istio: istiod / Linkerd: control plane)
└──────────────┬──────────────┘
               │ config push
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│ Sidecar│ │ Sidecar│ │ Sidecar│  (Envoy / linkerd-proxy)
│  Proxy │ │  Proxy │ │  Proxy │
├────────┤ ├────────┤ ├────────┤
│ App A  │ │ App B  │ │ App C  │
└────────┘ └────────┘ └────────┘
```

## Istio Traffic Management

```yaml
# VirtualService: route rules
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: order-service
spec:
  hosts: [order-service]
  http:
    - match:
        - headers:
            x-canary: { exact: "true" }
      route:
        - destination: { host: order-service, subset: canary }
    - route:
        - destination: { host: order-service, subset: stable }
          weight: 90
        - destination: { host: order-service, subset: canary }
          weight: 10
```

```yaml
# DestinationRule: subsets + circuit breaker
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: order-service
spec:
  host: order-service
  trafficPolicy:
    connectionPool:
      tcp: { maxConnections: 100 }
      http: { h2UpgradePolicy: DEFAULT, http1MaxPendingRequests: 100 }
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 30s
  subsets:
    - name: stable
      labels: { version: v1 }
    - name: canary
      labels: { version: v2 }
```

## Mutual TLS

```yaml
# PeerAuthentication: enforce mTLS
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: production
spec:
  mtls:
    mode: STRICT  # All traffic must be mTLS
```

## Linkerd (simpler alternative)

```bash
# Install
linkerd install | kubectl apply -f -

# Inject sidecar into deployment
kubectl get deploy order-service -o yaml | linkerd inject - | kubectl apply -f -

# Traffic split
apiVersion: split.smi-spec.io/v1alpha2
kind: TrafficSplit
metadata:
  name: order-canary
spec:
  service: order-service
  backends:
    - service: order-service-stable
      weight: 900
    - service: order-service-canary
      weight: 100
```

## When to Use a Service Mesh

| Use When | Don't Use When |
|----------|---------------|
| 10+ microservices | Monolith or few services |
| Need mTLS everywhere | TLS at ingress is sufficient |
| Complex traffic routing | Simple load balancing works |
| Multi-team ownership | Single team manages all services |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Service mesh for 2-3 services | Overkill; use in-app libraries |
| No resource limits on sidecars | Configure proxy CPU/memory limits |
| mTLS in PERMISSIVE mode in prod | Use STRICT mode in production |
| No observability dashboards | Deploy Kiali, Grafana, Jaeger with mesh |
| Ignoring sidecar latency | Benchmark; typically adds <1ms per hop |

## Production Checklist

- [ ] mTLS in STRICT mode
- [ ] Circuit breaker policies on critical services
- [ ] Traffic splitting for canary deployments
- [ ] Observability: Kiali dashboard, distributed tracing
- [ ] Resource limits on sidecar proxies
- [ ] Gradual rollout (inject namespace by namespace)
