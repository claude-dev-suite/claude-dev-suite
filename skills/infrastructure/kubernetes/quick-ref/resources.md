# Kubernetes Resources Quick Reference

> **Knowledge Base:** Read `knowledge/kubernetes/resources.md` for complete documentation.

## Pod

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: myapp
  labels:
    app: myapp
spec:
  containers:
    - name: app
      image: myapp:1.0
      ports:
        - containerPort: 3000
      env:
        - name: NODE_ENV
          value: production
      resources:
        requests:
          memory: "128Mi"
          cpu: "250m"
        limits:
          memory: "256Mi"
          cpu: "500m"
```

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
        - name: app
          image: myapp:1.0
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: url
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

## Service

```yaml
# ClusterIP (internal)
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
# LoadBalancer (external)
apiVersion: v1
kind: Service
metadata:
  name: myapp-lb
spec:
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 3000
  type: LoadBalancer
---
# NodePort
apiVersion: v1
kind: Service
metadata:
  name: myapp-nodeport
spec:
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 3000
      nodePort: 30080
  type: NodePort
```

## Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - myapp.example.com
      secretName: tls-secret
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
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: myapp-api
                port:
                  number: 80
```

## ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-config
data:
  APP_NAME: "My Application"
  LOG_LEVEL: "info"
  config.json: |
    {
      "feature_flags": {
        "new_ui": true
      }
    }
---
# Using ConfigMap
spec:
  containers:
    - name: app
      env:
        - name: APP_NAME
          valueFrom:
            configMapKeyRef:
              name: myapp-config
              key: APP_NAME
      envFrom:
        - configMapRef:
            name: myapp-config
      volumeMounts:
        - name: config
          mountPath: /app/config
  volumes:
    - name: config
      configMap:
        name: myapp-config
```

## Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: myapp-secret
type: Opaque
stringData:
  DATABASE_URL: "postgres://user:pass@db:5432/app"
  JWT_SECRET: "super-secret-key"
---
# Using Secret
spec:
  containers:
    - name: app
      env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: myapp-secret
              key: DATABASE_URL
      envFrom:
        - secretRef:
            name: myapp-secret
```

## PersistentVolumeClaim

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: myapp-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: standard
---
# Using PVC
spec:
  containers:
    - name: app
      volumeMounts:
        - name: data
          mountPath: /app/data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: myapp-pvc
```

## HorizontalPodAutoscaler

```yaml
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

**Official docs:** https://kubernetes.io/docs/concepts/
