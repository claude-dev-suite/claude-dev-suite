---
name: kubernetes
description: |
  Kubernetes container orchestration. Covers deployments, services,
  and configuration. Use for container orchestration.

  USE WHEN: user mentions "kubernetes", "k8s", "kubectl", "deployment", "pod",
  "service", "ingress", "configmap", "secret", asks about "container orchestration",
  "scaling", "rolling updates", "helm", "production cluster", "namespace"

  DO NOT USE FOR: local development environments - use `docker-compose` skill instead,
  Dockerfile creation - use `docker` skill instead,
  CI/CD workflows - use `github-actions` skill instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Kubernetes Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `kubernetes` for comprehensive documentation.

## Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  labels:
    app: myapp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
        - name: myapp
          image: myapp:1.0.0
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: myapp-secrets
                  key: database-url
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
```

## Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
---
# Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
spec:
  rules:
    - host: myapp.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp
                port:
                  number: 80
```

## ConfigMap & Secret

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-config
data:
  LOG_LEVEL: "info"
  API_URL: "https://api.example.com"
---
apiVersion: v1
kind: Secret
metadata:
  name: myapp-secrets
type: Opaque
data:
  database-url: cG9zdGdyZXM6Ly8uLi4=  # base64
```

## Common Commands

```bash
kubectl apply -f deployment.yaml
kubectl get pods
kubectl logs pod-name
kubectl exec -it pod-name -- sh
kubectl scale deployment myapp --replicas=5
kubectl rollout status deployment/myapp
kubectl rollout undo deployment/myapp
```

## When NOT to Use This Skill

Skip this skill when:
- Setting up local development with multiple containers - use `docker-compose` skill
- Creating container images - use `docker` skill
- Managing CI/CD pipelines - use `github-actions` skill
- Running single-server deployments (VPS) - Docker Compose may be simpler
- Working with managed container services that abstract K8s (AWS Fargate, Google Cloud Run)

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| No resource limits | Resource exhaustion, noisy neighbors | Always set `resources.requests` and `limits` |
| Running as root | Security vulnerability | Set `securityContext.runAsNonRoot: true` |
| No readiness probes | Traffic sent to starting pods | Add `readinessProbe` for zero-downtime |
| Using `latest` image tag | Unpredictable deployments | Pin specific versions `myapp:v1.2.3` |
| Secrets in ConfigMaps | Exposed sensitive data | Use Secrets, External Secrets, or Sealed Secrets |
| No Pod Disruption Budget | Downtime during node maintenance | Add PDB with `minAvailable` |
| Single replica for critical services | Single point of failure | Use at least 2 replicas with anti-affinity |
| No network policies | All pods can talk to all pods | Restrict traffic with NetworkPolicy |
| Missing health checks | Unhealthy pods stay in rotation | Add `livenessProbe` and `readinessProbe` |
| maxUnavailable = maxSurge = 0 | Rollout stuck | Set at least one > 0 for rolling updates |

## Quick Troubleshooting

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| Pod stuck in `Pending` | Insufficient resources | Check `kubectl describe pod`, add nodes or reduce requests |
| Pod in `CrashLoopBackOff` | Container exits immediately | Check logs: `kubectl logs pod-name --previous` |
| `ImagePullBackOff` | Can't pull image | Verify image exists, check imagePullSecrets |
| Service not accessible | Wrong selector, no endpoints | Check `kubectl get endpoints service-name` |
| Readiness probe failing | App not ready on time | Increase `initialDelaySeconds` or fix app startup |
| `OOMKilled` status | Memory limit exceeded | Increase `resources.limits.memory` |
| Ingress returns 404 | Wrong path, service not found | Verify ingress rules and backend service exists |
| ConfigMap changes not reflected | Pod not restarted | Trigger rolling update: change annotation or image |
| `0/3 nodes available` | Resource constraints, taints | Check node status: `kubectl describe nodes` |
| Persistent volume not mounting | PVC not bound, wrong storage class | Check PVC status: `kubectl get pvc` |

## Production Readiness

### Security Configuration

```yaml
# Pod Security Context
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
      containers:
        - name: myapp
          image: myapp:1.0.0
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir: {}
```

```yaml
# Network Policy - Restrict traffic
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: myapp-network-policy
spec:
  podSelector:
    matchLabels:
      app: myapp
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - protocol: TCP
          port: 3000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: database
      ports:
        - protocol: TCP
          port: 5432
```

### Secrets Management

```yaml
# External Secrets Operator (recommended)
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: myapp-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: myapp-secrets
  data:
    - secretKey: database-url
      remoteRef:
        key: myapp/database
        property: url
```

```yaml
# Sealed Secrets (alternative)
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: myapp-secrets
spec:
  encryptedData:
    database-url: AgBy3i4OJSWK+PiTySYZZA9rO43cGDEq...
```

### Resource Management

```yaml
# Proper resource limits
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: myapp
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "1000m"
          # Vertical Pod Autoscaler can optimize these
```

```yaml
# Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

```yaml
# Pod Disruption Budget
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp-pdb
spec:
  minAvailable: 1  # Or maxUnavailable: 1
  selector:
    matchLabels:
      app: myapp
```

### Health Probes

```yaml
# Comprehensive health probes
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: myapp
          # Startup probe (for slow-starting apps)
          startupProbe:
            httpGet:
              path: /health
              port: 3000
            failureThreshold: 30
            periodSeconds: 10
          # Liveness probe (restart if unhealthy)
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 0
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
          # Readiness probe (traffic routing)
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 0
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
```

### Rolling Updates

```yaml
# Safe rolling update strategy
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # Max extra pods during update
      maxUnavailable: 0  # Zero downtime
  template:
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: myapp
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 10"]
```

### Monitoring & Observability

```yaml
# ServiceMonitor for Prometheus
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: myapp
spec:
  selector:
    matchLabels:
      app: myapp
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Pod restarts | > 3 in 15 minutes |
| CPU utilization | > 80% sustained |
| Memory utilization | > 85% |
| Pod pending time | > 5 minutes |
| Failed deployments | > 0 |
| Certificate expiry | < 30 days |

### Ingress with TLS

```yaml
# Ingress with cert-manager TLS
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - myapp.example.com
      secretName: myapp-tls
  rules:
    - host: myapp.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp
                port:
                  number: 80
```

### Checklist

- [ ] Pod security context (non-root, read-only fs)
- [ ] Network policies defined
- [ ] Secrets via External Secrets/Sealed Secrets
- [ ] Resource requests and limits set
- [ ] HPA configured for auto-scaling
- [ ] PDB for high availability
- [ ] Liveness/readiness/startup probes
- [ ] Rolling update strategy (zero downtime)
- [ ] Graceful shutdown (preStop hook)
- [ ] TLS certificates via cert-manager
- [ ] Prometheus metrics exported
- [ ] Pod anti-affinity for distribution
- [ ] RBAC properly scoped
- [ ] Image pull policy: Always (for :latest) or IfNotPresent

## Reference Documentation
- [Deployments](quick-ref/deployments.md)
- [Secrets](quick-ref/secrets.md)
