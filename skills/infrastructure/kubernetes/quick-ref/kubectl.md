# kubectl Commands Quick Reference

> **Knowledge Base:** Read `knowledge/kubernetes/kubectl.md` for complete documentation.

## Basic Commands

```bash
# Get resources
kubectl get pods
kubectl get pods -o wide              # More info
kubectl get pods -A                   # All namespaces
kubectl get pods -n kube-system       # Specific namespace
kubectl get pods -l app=myapp         # By label
kubectl get pods --field-selector=status.phase=Running

# Get multiple resources
kubectl get pods,services,deployments
kubectl get all

# Describe (detailed info)
kubectl describe pod myapp
kubectl describe deployment myapp

# Delete resources
kubectl delete pod myapp
kubectl delete -f manifest.yaml
kubectl delete pods -l app=myapp

# Apply/Create
kubectl apply -f manifest.yaml
kubectl apply -f ./manifests/
kubectl create -f manifest.yaml
```

## Namespaces

```bash
# List namespaces
kubectl get namespaces

# Create namespace
kubectl create namespace myns

# Set default namespace
kubectl config set-context --current --namespace=myns

# Delete namespace
kubectl delete namespace myns
```

## Pods

```bash
# Get pods
kubectl get pods
kubectl get pods -o yaml              # YAML output
kubectl get pods -o json              # JSON output
kubectl get pods --watch              # Watch changes

# Logs
kubectl logs myapp
kubectl logs -f myapp                 # Follow
kubectl logs myapp -c container-name  # Specific container
kubectl logs --previous myapp         # Previous instance
kubectl logs -l app=myapp             # By label
kubectl logs --tail=100 myapp         # Last 100 lines

# Exec into pod
kubectl exec -it myapp -- sh
kubectl exec -it myapp -- bash
kubectl exec myapp -- ls /app
kubectl exec -it myapp -c container-name -- sh

# Port forwarding
kubectl port-forward myapp 3000:3000
kubectl port-forward svc/myapp 3000:80
kubectl port-forward deployment/myapp 3000:3000

# Copy files
kubectl cp myapp:/app/file.txt ./file.txt
kubectl cp ./file.txt myapp:/app/file.txt
```

## Deployments

```bash
# Create/update deployment
kubectl apply -f deployment.yaml

# Scale
kubectl scale deployment myapp --replicas=5

# Rollout status
kubectl rollout status deployment/myapp

# Rollout history
kubectl rollout history deployment/myapp

# Rollback
kubectl rollout undo deployment/myapp
kubectl rollout undo deployment/myapp --to-revision=2

# Restart deployment
kubectl rollout restart deployment/myapp

# Update image
kubectl set image deployment/myapp app=myapp:2.0

# Pause/Resume rollout
kubectl rollout pause deployment/myapp
kubectl rollout resume deployment/myapp
```

## Services

```bash
# List services
kubectl get services

# Expose deployment
kubectl expose deployment myapp --port=80 --target-port=3000

# Create LoadBalancer
kubectl expose deployment myapp --type=LoadBalancer --port=80

# Get service endpoints
kubectl get endpoints myapp
```

## ConfigMaps & Secrets

```bash
# Create ConfigMap
kubectl create configmap myconfig --from-literal=KEY=value
kubectl create configmap myconfig --from-file=config.txt
kubectl create configmap myconfig --from-env-file=.env

# Create Secret
kubectl create secret generic mysecret --from-literal=PASSWORD=secret
kubectl create secret generic mysecret --from-file=key.pem
kubectl create secret tls tls-secret --cert=cert.pem --key=key.pem

# View ConfigMap/Secret
kubectl get configmap myconfig -o yaml
kubectl get secret mysecret -o yaml
kubectl get secret mysecret -o jsonpath='{.data.PASSWORD}' | base64 -d
```

## Debugging

```bash
# Describe (events, status)
kubectl describe pod myapp

# Check events
kubectl get events
kubectl get events --sort-by='.lastTimestamp'
kubectl get events -w                  # Watch

# Resource usage
kubectl top pods
kubectl top nodes

# Run debug pod
kubectl run debug --rm -it --image=busybox -- sh
kubectl run debug --rm -it --image=nicolaka/netshoot -- sh

# Debug existing pod
kubectl debug myapp -it --image=busybox

# Check pod conditions
kubectl get pod myapp -o jsonpath='{.status.conditions}'
```

## Context & Config

```bash
# View config
kubectl config view
kubectl config current-context

# List contexts
kubectl config get-contexts

# Switch context
kubectl config use-context my-cluster

# Set namespace
kubectl config set-context --current --namespace=myns
```

## Labels & Annotations

```bash
# Add label
kubectl label pod myapp env=prod

# Remove label
kubectl label pod myapp env-

# Add annotation
kubectl annotate pod myapp description="My app"

# Select by label
kubectl get pods -l app=myapp
kubectl get pods -l 'env in (prod, staging)'
kubectl delete pods -l app=myapp
```

## Output Formats

```bash
# YAML output
kubectl get pod myapp -o yaml

# JSON output
kubectl get pod myapp -o json

# JSONPath
kubectl get pod myapp -o jsonpath='{.status.phase}'
kubectl get pods -o jsonpath='{.items[*].metadata.name}'

# Custom columns
kubectl get pods -o custom-columns=NAME:.metadata.name,STATUS:.status.phase

# Wide output
kubectl get pods -o wide
```

**Official docs:** https://kubernetes.io/docs/reference/kubectl/
