---
name: deployment-strategies
description: |
  Production deployment strategies. Blue-green, canary, rolling update,
  recreate. Zero-downtime deployments, rollback procedures, database
  migration coordination, and deployment automation.

  USE WHEN: user mentions "blue-green", "canary deployment", "rolling update",
  "zero-downtime", "deployment strategy", "rollback", "deploy pipeline"

  DO NOT USE FOR: CI/CD pipeline syntax - use `github-actions`;
  container orchestration - use `kubernetes`; IaC - use `terraform`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Deployment Strategies

## Strategy Comparison

| Strategy | Downtime | Risk | Rollback Speed | Resource Cost |
|----------|----------|------|----------------|---------------|
| Recreate | Yes | High | Slow (redeploy) | Low |
| Rolling Update | No | Medium | Medium | Low |
| Blue-Green | No | Low | Instant (switch) | 2x resources |
| Canary | No | Very Low | Fast (route shift) | +10-20% |

## Blue-Green Deployment

```
                    ┌─── Blue (v1) ← current traffic
Load Balancer ──────┤
                    └─── Green (v2) ← deploy here, test, then switch
```

### AWS (ALB Target Groups)

```typescript
// Switch traffic from blue to green
await elbv2.modifyListener({
  ListenerArn: listenerArn,
  DefaultActions: [{
    Type: 'forward',
    TargetGroupArn: greenTargetGroupArn, // Point to green
  }],
});

// Rollback: point back to blue
await elbv2.modifyListener({
  ListenerArn: listenerArn,
  DefaultActions: [{
    Type: 'forward',
    TargetGroupArn: blueTargetGroupArn,
  }],
});
```

## Canary Deployment

```yaml
# Kubernetes: Argo Rollouts
apiVersion: argoproj.io/v1alpha1
kind: Rollout
spec:
  strategy:
    canary:
      steps:
        - setWeight: 5        # 5% traffic to canary
        - pause: { duration: 5m }
        - setWeight: 20
        - pause: { duration: 10m }
        - setWeight: 50
        - pause: { duration: 10m }
        - setWeight: 100       # Full rollout
      analysis:
        templates:
          - templateName: error-rate
        startingStep: 1        # Start checking from step 1
```

## Rolling Update (Kubernetes)

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1    # At most 1 pod down
      maxSurge: 1          # At most 1 extra pod
```

## Database Migration Coordination

```
1. Deploy v2 code (backward-compatible with v1 schema)
2. Run forward migration (additive only: new columns, tables)
3. Verify v2 works correctly
4. Run cleanup migration (remove old columns) in next release
```

### Expand-Contract Pattern

```sql
-- Release 1: EXPAND (add new column)
ALTER TABLE users ADD COLUMN full_name TEXT;
UPDATE users SET full_name = first_name || ' ' || last_name;

-- Release 2: code uses full_name, stops writing first_name/last_name

-- Release 3: CONTRACT (remove old columns)
ALTER TABLE users DROP COLUMN first_name, DROP COLUMN last_name;
```

## Rollback Checklist

```bash
# 1. Detect issue (automated or manual)
# 2. Route traffic back to previous version
kubectl rollout undo deployment/my-app

# 3. Verify rollback successful
kubectl rollout status deployment/my-app

# 4. If DB migration was run, execute backward migration
# (only if migration was backward-compatible)
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Deploy + migrate in one step | Separate deployment from migration |
| Destructive DB migrations | Use expand-contract pattern |
| No health checks for readiness | Configure readiness probes |
| No automated rollback trigger | Set error rate thresholds |
| Manual deployments | Automate via CI/CD pipeline |

## Production Checklist

- [ ] Zero-downtime strategy chosen (rolling/blue-green/canary)
- [ ] Health checks configured (liveness + readiness)
- [ ] Rollback procedure documented and tested
- [ ] Database migrations backward-compatible
- [ ] Automated rollback on error rate spike
- [ ] Deployment notifications to team
