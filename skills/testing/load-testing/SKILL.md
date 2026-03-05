---
name: load-testing
description: |
  Load and performance testing. k6 (Grafana), Artillery, Apache JMeter,
  Locust (Python). Scenario design, thresholds, ramp-up patterns,
  and CI/CD integration.

  USE WHEN: user mentions "load test", "performance test", "stress test",
  "k6", "Artillery", "JMeter", "Locust", "throughput", "benchmarking"

  DO NOT USE FOR: unit/integration testing - use testing skills;
  monitoring in production - use `opentelemetry`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Load Testing

## k6 (recommended)

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '3m', target: 50 },   // Stay at 50
    { duration: '1m', target: 100 },  // Ramp to 100
    { duration: '3m', target: 100 },  // Stay at 100
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95th < 500ms
    http_req_failed: ['rate<0.01'],                  // <1% error rate
  },
};

export default function () {
  const res = http.get('https://api.example.com/products');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
```

### Authenticated Requests

```javascript
import http from 'k6/http';

export function setup() {
  const res = http.post('https://api.example.com/auth/login', JSON.stringify({
    email: 'loadtest@example.com', password: 'test-password',
  }), { headers: { 'Content-Type': 'application/json' } });
  return { token: res.json('token') };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' };

  // Simulate user journey
  http.get('https://api.example.com/products', { headers });
  sleep(2);
  http.get('https://api.example.com/products/1', { headers });
  sleep(1);
  http.post('https://api.example.com/orders', JSON.stringify({ productId: '1', qty: 2 }), { headers });
}
```

## Artillery

```yaml
# artillery.yml
config:
  target: "https://api.example.com"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Sustained load"
  defaults:
    headers:
      Content-Type: "application/json"

scenarios:
  - name: "Browse and purchase"
    flow:
      - get:
          url: "/products"
          capture:
            - json: "$.data[0].id"
              as: "productId"
      - think: 2
      - get:
          url: "/products/{{ productId }}"
      - think: 1
      - post:
          url: "/orders"
          json:
            productId: "{{ productId }}"
            quantity: 1
```

## Locust (Python)

```python
from locust import HttpUser, task, between

class WebUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        res = self.client.post("/auth/login", json={
            "email": "test@example.com", "password": "password"
        })
        self.token = res.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    @task(3)
    def browse_products(self):
        self.client.get("/products", headers=self.headers)

    @task(1)
    def create_order(self):
        self.client.post("/orders", json={"productId": "1", "qty": 1}, headers=self.headers)
```

## Test Types

| Type | Purpose | Duration |
|------|---------|----------|
| Smoke | Verify system works under minimal load | 1-2 min |
| Load | Expected normal/peak traffic | 10-30 min |
| Stress | Beyond normal capacity, find breaking point | 10-20 min |
| Soak | Sustained load to find memory leaks | 1-4 hours |
| Spike | Sudden traffic burst | 5-10 min |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Testing from same network as server | Test from external network or cloud |
| No think time between requests | Add realistic `sleep`/`think` delays |
| Single endpoint only | Test realistic user journeys |
| No thresholds defined | Set p95/p99 latency and error rate thresholds |
| Running load tests against production | Use staging environment |

## Production Checklist

- [ ] Realistic user scenarios (not just single endpoints)
- [ ] Thresholds for latency (p95, p99) and error rate
- [ ] Ramp-up pattern matching expected traffic shape
- [ ] Test data seeded (not reusing same record)
- [ ] CI/CD integration for regression detection
- [ ] Results archived for comparison over time
