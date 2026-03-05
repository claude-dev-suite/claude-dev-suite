# Mutual TLS (mTLS) in Service Mesh

## Overview

Mutual TLS (mTLS) is a security protocol where both the client and server authenticate each other using X.509 certificates. In a service mesh, mTLS is enforced transparently by the sidecar proxies -- application code does not need to handle TLS at all. This provides **encryption in transit**, **service identity verification**, and the foundation for **zero-trust networking**.

---

## How mTLS Works in a Service Mesh

```
Service A                                   Service B
+----------+    plaintext    +--------+     encrypted (mTLS)     +--------+    plaintext    +----------+
| App      | -------------> | Proxy  | ========================> | Proxy  | -------------> | App      |
| (port    |  localhost:80   | (Envoy/|   TLS 1.3 with mutual   | (Envoy/|  localhost:80   | (port    |
|  8080)   |                | linkerd)|   cert verification      | linkerd)|                |  8080)   |
+----------+                +--------+                          +--------+                +----------+

1. App A sends plaintext request to its local proxy
2. Proxy A initiates TLS handshake with Proxy B
3. Both proxies present their certificates (signed by the mesh CA)
4. Both proxies verify each other's certificates against the trust anchor
5. Encrypted channel established
6. Proxy B forwards plaintext to App B
```

### Certificate Chain

```
Trust Anchor (Root CA)
  |
  +-- Intermediate CA (mesh control plane)
        |
        +-- Workload Certificate (per-pod, short-lived)
              Subject: spiffe://cluster.local/ns/my-app/sa/web-service
              Valid for: 24 hours (auto-rotated)
```

---

## Istio mTLS Configuration

### PeerAuthentication

```yaml
# Enable STRICT mTLS for the entire mesh
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system          # Mesh-wide when in istio-system
spec:
  mtls:
    mode: STRICT                   # Only accept mTLS connections
```

```yaml
# PERMISSIVE mode: accept both mTLS and plaintext
# Use during migration from non-mesh to mesh
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: my-app
spec:
  mtls:
    mode: PERMISSIVE               # Accept both mTLS and plaintext
```

```yaml
# Per-workload policy: disable mTLS for a specific port
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: db-exception
  namespace: my-app
spec:
  selector:
    matchLabels:
      app: legacy-db
  mtls:
    mode: STRICT
  portLevelMtls:
    3306:
      mode: DISABLE                # MySQL port accepts plaintext
```

### DestinationRule for mTLS

```yaml
# Ensure client-side mTLS is enabled
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: default
  namespace: istio-system
spec:
  host: "*.local"                  # All services
  trafficPolicy:
    tls:
      mode: ISTIO_MUTUAL           # Use Istio-managed certificates
```

### Authorization Policy (mTLS-Based Access Control)

```yaml
# Only allow specific services to communicate
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: payment-access
  namespace: my-app
spec:
  selector:
    matchLabels:
      app: payment-service
  rules:
    - from:
        - source:
            principals:
              - "cluster.local/ns/my-app/sa/order-service"    # Only order-service
              - "cluster.local/ns/my-app/sa/refund-service"   # and refund-service
      to:
        - operation:
            methods: ["POST"]
            paths: ["/api/charge", "/api/refund"]

---
# Deny all by default (zero-trust)
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: deny-all
  namespace: my-app
spec:
  {}                               # Empty spec = deny all traffic
```

---

## Linkerd mTLS

Linkerd enables mTLS by default for all meshed workloads. No configuration needed.

```bash
# Verify mTLS is active
linkerd viz edges deploy -n my-app

# Output shows SECURED column:
# SRC          DST          SRC_NS   DST_NS   SECURED
# web          orders       my-app   my-app   true
# orders       payment      my-app   my-app   true
# web          external-api my-app   default  false  <- not meshed

# Check identity of a specific pod
linkerd viz tap deploy/web -n my-app --to deploy/orders | grep tls
# tls=true
```

### Linkerd Authorization Policy

```yaml
# Linkerd uses Server and ServerAuthorization resources
apiVersion: policy.linkerd.io/v1beta3
kind: Server
metadata:
  name: payment-server
  namespace: my-app
spec:
  podSelector:
    matchLabels:
      app: payment-service
  port: 8080
  proxyProtocol: HTTP/2

---
apiVersion: policy.linkerd.io/v1beta1
kind: ServerAuthorization
metadata:
  name: payment-authz
  namespace: my-app
spec:
  server:
    name: payment-server
  client:
    meshTLS:
      serviceAccounts:
        - name: order-service          # Only order-service can call payment
        - name: refund-service
```

---

## Automatic Certificate Rotation

### Istio Certificate Lifecycle

```yaml
# Configure certificate rotation in istiod
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
spec:
  meshConfig:
    defaultConfig:
      proxyMetadata:
        # Workload cert validity (default: 24h)
        SECRET_TTL: "12h"           # Rotate every 12 hours
        SECRET_GRACE_PERIOD_RATIO: "0.5"  # Start rotation at 50% of TTL
```

### External CA Integration with cert-manager

```yaml
# cert-manager issuer for Istio
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: istio-ca
  namespace: istio-system
spec:
  ca:
    secretName: istio-ca-secret

---
# Certificate for istiod
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: istiod
  namespace: istio-system
spec:
  isCA: true
  commonName: istiod.istio-system.svc
  dnsNames:
    - istiod.istio-system.svc
  secretName: istiod-tls
  issuerRef:
    name: istio-ca
    kind: Issuer
  duration: 720h       # 30 days
  renewBefore: 168h    # Renew 7 days before expiry
```

### Linkerd Certificate Rotation

```bash
# Linkerd trust anchor certificate must be rotated manually or via cert-manager

# Check certificate expiration
linkerd check --proxy | grep -i cert

# Manual rotation steps:
# 1. Generate new trust anchor and issuer certificates
# 2. Bundle old + new trust anchors
# 3. Update linkerd identity with bundled trust anchors
# 4. Wait for all proxies to receive new config
# 5. Remove old trust anchor
```

```yaml
# Automate with cert-manager
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: linkerd-identity-issuer
  namespace: linkerd
spec:
  secretName: linkerd-identity-issuer
  isCA: true
  commonName: identity.linkerd.cluster.local
  dnsNames:
    - identity.linkerd.cluster.local
  issuerRef:
    name: linkerd-trust-anchor
    kind: ClusterIssuer
  duration: 2160h      # 90 days
  renewBefore: 720h    # Renew 30 days before expiry
  privateKey:
    algorithm: ECDSA
```

---

## SPIFFE Identity

Both Istio and Linkerd use SPIFFE (Secure Production Identity Framework For Everyone) for workload identity.

### SPIFFE ID Format

```
spiffe://<trust-domain>/ns/<namespace>/sa/<service-account>

Examples:
  spiffe://cluster.local/ns/my-app/sa/web-service
  spiffe://cluster.local/ns/payment/sa/payment-processor
  spiffe://production.example.com/ns/api/sa/api-gateway
```

### Using SPIFFE IDs in Authorization

```yaml
# Istio: authorize by SPIFFE identity
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: api-authz
spec:
  selector:
    matchLabels:
      app: api
  rules:
    - from:
        - source:
            # Match by SPIFFE ID (via service account)
            principals:
              - "cluster.local/ns/frontend/sa/web-app"
            # Or match by namespace
            namespaces:
              - "frontend"
              - "mobile-bff"
```

---

## Zero-Trust Networking

Zero-trust assumes no implicit trust based on network location. Every request must be authenticated and authorized.

### Implementation Layers

```
Layer 1: Network Segmentation (Kubernetes NetworkPolicy)
  - Restrict pod-to-pod communication at L3/L4
  - Default deny all ingress/egress

Layer 2: Identity-Based Authentication (mTLS)
  - Every service has a cryptographic identity
  - All communication encrypted and authenticated

Layer 3: Authorization Policies (Service Mesh)
  - Per-service, per-route access control
  - Based on verified identity, not IP address

Layer 4: Application-Level Auth (JWT, OAuth)
  - End-user authentication
  - Fine-grained permissions
```

```yaml
# Layer 1: Kubernetes NetworkPolicy - default deny
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: my-app
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress

---
# Allow only mesh traffic (from sidecar proxies)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-mesh-traffic
  namespace: my-app
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: my-app
```

---

## Debugging mTLS Issues

### Common Problems and Solutions

```bash
# 1. Check if mTLS is active between two services (Istio)
istioctl authn tls-check <pod-name>.my-app payment-service.my-app.svc.cluster.local
# HOST                                    STATUS    SERVER    CLIENT    AUTHN POLICY
# payment-service.my-app.svc.cluster.local OK       STRICT    ISTIO_MUTUAL  default/my-app

# 2. Verify proxy certificates
istioctl proxy-config secret <pod-name>.my-app
# Shows: CERT CHAIN, ROOT CA, certificate serial, expiry

# 3. Check for TLS errors in proxy logs
kubectl logs <pod-name> -c istio-proxy | grep -i tls
kubectl logs <pod-name> -c istio-proxy | grep -i "connection failure"

# 4. Linkerd: check proxy identity
linkerd viz tap deploy/web -n my-app --to deploy/payment | head -20
# Look for tls=true in output

# 5. Verify certificate chain
istioctl proxy-config secret <pod-name>.my-app -o json | \
  jq -r '.dynamicActiveSecrets[0].secret.tlsCertificate.certificateChain.inlineBytes' | \
  base64 -d | openssl x509 -text -noout
```

### Debugging Checklist

```bash
# Is the sidecar injected?
kubectl get pod <pod-name> -n my-app -o jsonpath='{.spec.containers[*].name}'
# Should include istio-proxy or linkerd-proxy

# Is PeerAuthentication set correctly?
kubectl get peerauthentication -A

# Are DestinationRules conflicting with mTLS?
kubectl get destinationrule -A -o yaml | grep -A5 "tls:"

# Is the trust anchor the same across namespaces?
# (Different trust anchors = cannot verify each other's certs)
istioctl proxy-config secret <pod-a> -o json | jq '.dynamicActiveSecrets[1].secret.validationContext'
istioctl proxy-config secret <pod-b> -o json | jq '.dynamicActiveSecrets[1].secret.validationContext'
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| PERMISSIVE mode in production | Allows unencrypted traffic | Use STRICT mode after migration |
| No authorization policies | mTLS authenticates but does not authorize | Define AuthorizationPolicy for each service |
| Long-lived certificates (years) | Compromise window too large | Short-lived certs (hours/days) with auto-rotation |
| Self-signed root CA without rotation plan | CA expiry brings down entire mesh | Plan CA rotation before deployment |
| Disabling mTLS for convenience | Breaks zero-trust model | Fix root cause (sidecar injection, config) |
| Mixing mesh and non-mesh services without PERMISSIVE | Non-mesh services cannot connect | Use PERMISSIVE during migration, then STRICT |
| No NetworkPolicy alongside mTLS | Defense in depth missing | Layer network policies with mTLS |

---

## Production Checklist

- [ ] mTLS mode set to STRICT for all production namespaces
- [ ] Trust anchor certificates managed externally (cert-manager, Vault)
- [ ] Certificate rotation automated and tested
- [ ] Workload certificate TTL set to 24 hours or less
- [ ] Authorization policies defined for all services (default deny)
- [ ] SPIFFE identities verified in authorization rules
- [ ] NetworkPolicies deployed as additional defense layer
- [ ] Certificate expiration monitoring and alerting configured
- [ ] Migration from PERMISSIVE to STRICT documented and tested
- [ ] mTLS verification included in health check automation
- [ ] Debugging runbook documented for common mTLS failures
- [ ] Cross-namespace communication explicitly authorized
- [ ] External service access configured with appropriate TLS mode
- [ ] CA rotation procedure tested in staging
