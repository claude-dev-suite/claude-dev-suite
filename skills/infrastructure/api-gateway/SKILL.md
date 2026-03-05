---
name: api-gateway
description: |
  API gateway patterns and implementations. Kong, AWS API Gateway,
  NGINX as gateway, rate limiting, request routing, authentication
  offloading, and request/response transformation.

  USE WHEN: user mentions "API gateway", "Kong", "AWS API Gateway",
  "NGINX gateway", "gateway pattern", "request routing", "BFF"

  DO NOT USE FOR: reverse proxy basics - use infrastructure skills;
  service mesh - use `service-mesh`; rate limiting in app - use `rate-limiting`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# API Gateway

## Gateway Pattern

```
Client ──▶ API Gateway ──┬──▶ User Service
                         ├──▶ Order Service
                         ├──▶ Product Service
                         └──▶ Payment Service
```

## AWS API Gateway

```typescript
// CDK definition
const api = new apigateway.RestApi(this, 'MyApi', {
  restApiName: 'My Service',
  deployOptions: { stageName: 'prod', throttlingRateLimit: 1000, throttlingBurstLimit: 500 },
});

const orders = api.root.addResource('orders');
orders.addMethod('GET', new apigateway.LambdaIntegration(listOrdersFn));
orders.addMethod('POST', new apigateway.LambdaIntegration(createOrderFn), {
  authorizer: cognitoAuthorizer,
  authorizationType: apigateway.AuthorizationType.COGNITO,
});

// Usage plan with API key
const plan = api.addUsagePlan('BasicPlan', {
  throttle: { rateLimit: 100, burstLimit: 50 },
  quota: { limit: 10000, period: apigateway.Period.MONTH },
});
```

## Kong (Declarative Config)

```yaml
# kong.yml
_format_version: "3.0"

services:
  - name: user-service
    url: http://user-svc:3000
    routes:
      - name: users-route
        paths: ["/api/users"]
        strip_path: true
    plugins:
      - name: rate-limiting
        config: { minute: 100, policy: redis, redis_host: redis }
      - name: jwt
      - name: cors
        config:
          origins: ["https://myapp.com"]
          methods: ["GET", "POST", "PUT", "DELETE"]

  - name: order-service
    url: http://order-svc:3000
    routes:
      - name: orders-route
        paths: ["/api/orders"]
    plugins:
      - name: rate-limiting
        config: { minute: 50 }
```

## NGINX as Gateway

```nginx
upstream user_service { server user-svc:3000; }
upstream order_service { server order-svc:3000; }

server {
    listen 443 ssl;

    location /api/users/ {
        proxy_pass http://user_service/;
        proxy_set_header X-Request-ID $request_id;
        limit_req zone=api burst=20 nodelay;
    }

    location /api/orders/ {
        proxy_pass http://order_service/;
        proxy_set_header X-Request-ID $request_id;
    }
}
```

## BFF (Backend for Frontend)

```typescript
// BFF aggregates multiple services for the frontend
app.get('/api/bff/dashboard', auth, async (req, res) => {
  const [user, orders, notifications] = await Promise.all([
    userService.getProfile(req.user.id),
    orderService.getRecent(req.user.id, 5),
    notificationService.getUnread(req.user.id),
  ]);

  res.json({ user, recentOrders: orders, unreadCount: notifications.length });
});
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Business logic in gateway | Gateway only routes, auth, rate limits |
| No rate limiting | Configure per-route limits |
| Single point of failure | Deploy gateway with redundancy |
| No request ID propagation | Add X-Request-ID header for tracing |
| Gateway handles data transformation | Keep transformations in BFF or services |

## Production Checklist

- [ ] Rate limiting configured per route
- [ ] Authentication offloaded to gateway
- [ ] Request ID propagation for tracing
- [ ] Health check endpoints for upstream services
- [ ] Circuit breaker on upstream failures
- [ ] TLS termination at gateway
