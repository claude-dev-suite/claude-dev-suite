# Load Test Scenarios

## Overview

Different load test types answer different questions about system behavior. A smoke test verifies basic functionality under minimal load. A load test validates expected traffic. A stress test finds the breaking point. A spike test measures elasticity. A soak test reveals memory leaks and resource exhaustion over time. Each scenario has a distinct load shape and purpose.

## Load Test Types

### Smoke Test

**Purpose**: Verify the system works under minimal load. Catches obvious regressions and deployment issues.

**Load profile**: 1-5 VUs for 1-3 minutes.

```javascript
// k6 smoke test
export const options = {
  vus: 3,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate==0'],          // Zero errors
    http_req_duration: ['p(95)<1000'],     // Generous threshold
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, { 'status 200': (r) => r.status === 200 });

  const products = http.get(`${BASE_URL}/products`);
  check(products, {
    'products returned': (r) => r.json('products').length > 0,
  });

  sleep(1);
}
```

**When to run**: Every deployment, every PR (in CI).

### Load Test

**Purpose**: Validate the system handles expected production traffic within SLO thresholds.

**Load profile**: Ramp to expected peak VUs, hold steady, ramp down.

```javascript
export const options = {
  stages: [
    { duration: '5m', target: 100 },   // Ramp to expected peak
    { duration: '30m', target: 100 },  // Hold at expected peak
    { duration: '5m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>50'],
  },
};
```

**When to run**: Before releases, weekly on staging.

### Stress Test

**Purpose**: Find the system's breaking point. Determine maximum capacity and how the system fails.

**Load profile**: Ramp beyond expected peak until errors or extreme latency appear.

```javascript
export const options = {
  stages: [
    { duration: '2m', target: 50 },    // Normal load
    { duration: '5m', target: 100 },   // Expected peak
    { duration: '5m', target: 200 },   // 2x peak
    { duration: '5m', target: 400 },   // 4x peak
    { duration: '5m', target: 600 },   // 6x peak (likely breaking)
    { duration: '5m', target: 0 },     // Recovery
  ],
  thresholds: {
    // Thresholds are informational during stress test
    // Focus on finding where they break, not passing them
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.10'],     // 10% tolerance
  },
};
```

**When to run**: Quarterly, before major launches, after architecture changes.

### Spike Test

**Purpose**: Test system behavior under sudden traffic surges. Validates autoscaling, load balancer behavior, and error handling under abrupt load.

**Load profile**: Sudden jump from low to very high load, then back.

```javascript
export const options = {
  stages: [
    { duration: '2m', target: 10 },    // Low baseline
    { duration: '10s', target: 500 },  // Instant spike
    { duration: '3m', target: 500 },   // Hold spike
    { duration: '10s', target: 10 },   // Drop back
    { duration: '3m', target: 10 },    // Recovery period
    { duration: '10s', target: 500 },  // Second spike
    { duration: '3m', target: 500 },   // Hold
    { duration: '2m', target: 0 },     // Wind down
  ],
};
```

**When to run**: Before events (Black Friday, product launches), after autoscaling changes.

### Soak Test (Endurance Test)

**Purpose**: Reveal problems that only appear over time -- memory leaks, connection pool exhaustion, log rotation issues, database connection accumulation.

**Load profile**: Moderate load sustained for hours.

```javascript
export const options = {
  stages: [
    { duration: '5m', target: 50 },      // Ramp up
    { duration: '4h', target: 50 },      // Hold for 4 hours
    { duration: '5m', target: 0 },       // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};
```

**What to monitor during soak tests**:
- Memory usage (should be stable, not growing)
- Connection pool utilization (should not leak)
- Disk usage (log files, temp files)
- Response time trend (should not degrade over time)
- GC pauses (frequency and duration)

**When to run**: Monthly, before major releases, after memory-related changes.

### Breakpoint Test

**Purpose**: Determine the exact capacity of the system by gradually increasing load until failure. Unlike stress tests, breakpoint tests increase load linearly to find the precise breaking point.

```javascript
export const options = {
  scenarios: {
    breakpoint: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 2000,
      stages: [
        { duration: '10m', target: 50 },
        { duration: '10m', target: 100 },
        { duration: '10m', target: 200 },
        { duration: '10m', target: 400 },
        { duration: '10m', target: 800 },
      ],
    },
  },
};
```

## Realistic User Simulation

### Multi-Step User Journeys

```javascript
import http from 'k6/http';
import { check, sleep, group } from 'k6';

export default function () {
  group('Homepage', () => {
    const homepage = http.get(`${BASE_URL}/`);
    check(homepage, { 'homepage loads': (r) => r.status === 200 });
    sleep(2 + Math.random() * 3); // Variable think time
  });

  group('Browse Category', () => {
    const categories = ['electronics', 'clothing', 'books', 'home'];
    const category = categories[Math.floor(Math.random() * categories.length)];

    const listing = http.get(`${BASE_URL}/products?category=${category}`);
    check(listing, { 'listing loads': (r) => r.status === 200 });

    const products = listing.json('products') || [];
    sleep(1 + Math.random() * 2);

    if (products.length > 0) {
      const product = products[Math.floor(Math.random() * products.length)];
      const detail = http.get(`${BASE_URL}/products/${product.id}`, {
        tags: { name: 'ProductDetail' },
      });
      check(detail, { 'product detail loads': (r) => r.status === 200 });
    }
  });

  // 30% of users add to cart
  if (Math.random() < 0.3) {
    group('Add to Cart', () => {
      sleep(1);
      const cart = http.post(`${BASE_URL}/cart`, JSON.stringify({
        productId: 'prod-123',
        quantity: 1,
      }), { headers: { 'Content-Type': 'application/json' } });
      check(cart, { 'added to cart': (r) => r.status === 200 || r.status === 201 });
    });

    // 50% of cart users check out (15% of total)
    if (Math.random() < 0.5) {
      group('Checkout', () => {
        sleep(2);
        const checkout = http.post(`${BASE_URL}/checkout`, JSON.stringify({
          paymentMethod: 'card',
        }), { headers: { 'Content-Type': 'application/json' } });
        check(checkout, { 'checkout success': (r) => r.status === 201 });
      });
    }
  }
}
```

## Data-Driven Testing

### k6 with SharedArray

```javascript
import { SharedArray } from 'k6/data';
import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';
import { open } from 'k6';

// Parse CSV once, share across VUs (memory efficient)
const testUsers = new SharedArray('users', function () {
  return papaparse.parse(open('./test-users.csv'), { header: true }).data;
});

const searchTerms = new SharedArray('searches', function () {
  return JSON.parse(open('./search-terms.json'));
});

export default function () {
  // Each VU gets a different user based on VU ID
  const user = testUsers[__VU % testUsers.length];

  // Random search term
  const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

  http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    username: user.username,
    password: user.password,
  }), { headers: { 'Content-Type': 'application/json' } });

  http.get(`${BASE_URL}/search?q=${encodeURIComponent(term)}`);
}
```

### Artillery with CSV

```yaml
config:
  payload:
    - path: "./products.csv"
      fields: ["productId", "productName"]
      order: random
    - path: "./users.csv"
      fields: ["username", "password"]
      order: sequence

scenarios:
  - flow:
      - post:
          url: "/auth/login"
          json:
            username: "{{ username }}"
            password: "{{ password }}"
      - get:
          url: "/products/{{ productId }}"
```

## Correlation (Extracting Values)

Extract dynamic values from responses for use in subsequent requests.

```javascript
export default function () {
  // Step 1: Get CSRF token
  const loginPage = http.get(`${BASE_URL}/login`);
  const csrfToken = loginPage.html().find('input[name="csrf"]').attr('value');

  // Step 2: Login with CSRF token
  const loginRes = http.post(`${BASE_URL}/auth/login`, {
    username: 'testuser',
    password: 'password',
    _csrf: csrfToken,
  });

  // Step 3: Extract auth token from response
  const authToken = loginRes.json('token');

  // Step 4: Use token in subsequent requests
  const headers = { Authorization: `Bearer ${authToken}` };

  const orders = http.get(`${BASE_URL}/orders`, { headers });
  const orderIds = orders.json('orders').map((o) => o.id);

  // Step 5: Use extracted order ID
  if (orderIds.length > 0) {
    const orderId = orderIds[Math.floor(Math.random() * orderIds.length)];
    http.get(`${BASE_URL}/orders/${orderId}`, {
      headers,
      tags: { name: 'OrderDetail' },
    });
  }
}
```

## Think Time

Think time simulates the pauses between user actions. Without it, the test generates unrealistically aggressive traffic.

### Strategies

```javascript
// Fixed think time
sleep(2);

// Random uniform
sleep(Math.random() * 4 + 1); // 1-5 seconds

// Normal distribution (approximate)
function normalSleep(mean, stddev) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const value = Math.max(0.5, mean + z * stddev);
  sleep(value);
}
normalSleep(3, 1); // Mean 3s, stddev 1s

// Page-specific think time
const THINK_TIMES = {
  homepage: { min: 2, max: 5 },
  productList: { min: 3, max: 8 },
  productDetail: { min: 5, max: 15 },
  checkout: { min: 10, max: 30 },
};

function thinkTime(page) {
  const { min, max } = THINK_TIMES[page];
  sleep(min + Math.random() * (max - min));
}
```

## Virtual User Lifecycle

```javascript
export function setup() {
  // Global setup: create test data, warm caches
  const res = http.post(`${BASE_URL}/test/seed`, JSON.stringify({
    products: 100,
    users: 50,
  }));
  return { testRunId: res.json('testRunId') };
}

export default function (data) {
  // Per-VU iteration: the main test loop
  // Each VU executes this repeatedly for the test duration
}

export function teardown(data) {
  // Global cleanup: remove test data
  http.post(`${BASE_URL}/test/cleanup`, JSON.stringify({
    testRunId: data.testRunId,
  }));
}
```

### Per-VU Initialization

```javascript
// Use VU-level init code for per-VU setup
let token = null;

export default function () {
  // Initialize once per VU
  if (!token) {
    const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
      username: `user-${__VU}`,
      password: 'password',
    }), { headers: { 'Content-Type': 'application/json' } });
    token = loginRes.json('token');
  }

  // Use the token for all iterations
  http.get(`${BASE_URL}/products`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  sleep(1);
}
```

## Scenario Comparison Table

| Scenario | VUs/Rate | Duration | Purpose | Frequency |
|----------|----------|----------|---------|-----------|
| Smoke | 1-5 VUs | 1-3 min | Basic verification | Every deploy |
| Load | Expected peak | 30-60 min | SLO validation | Pre-release |
| Stress | 2-6x peak | 30-60 min | Find breaking point | Quarterly |
| Spike | 0 to 10x instantly | 10-15 min | Test elasticity | Before events |
| Soak | Moderate steady | 4-12 hours | Find leaks | Monthly |
| Breakpoint | Gradual ramp | Until failure | Find exact capacity | After changes |

## Anti-Patterns

1. **Only running smoke tests** - Smoke tests verify functionality, not performance. Run load and stress tests regularly.
2. **No think time between requests** - Creates unrealistic thundering-herd traffic that does not match real user behavior.
3. **Testing a single endpoint** - Real traffic hits many endpoints with different patterns. Simulate complete user journeys.
4. **Using production data in tests** - Test data should be synthetic to avoid PII concerns and data corruption risks.
5. **Not monitoring infrastructure during tests** - Load tests without correlated infrastructure metrics (CPU, memory, connections) provide incomplete insights.
6. **Running stress tests in production** - Stress tests push systems to failure. Run on staging with production-like infrastructure.
7. **One-time testing only** - Performance characteristics change with every release. Integrate load tests into CI/CD.

## Production Checklist

- [ ] Smoke test runs on every deployment
- [ ] Load test validates SLOs before every release
- [ ] Stress test run quarterly to verify capacity headroom
- [ ] Spike test run before anticipated traffic events
- [ ] Soak test run monthly to detect memory/resource leaks
- [ ] User journeys model real traffic patterns with realistic ratios
- [ ] Think time included based on observed user behavior
- [ ] Test data parameterized from external files
- [ ] Correlation extracts dynamic values (tokens, IDs) from responses
- [ ] Infrastructure monitoring active during all test runs
- [ ] Results compared against baselines and SLO thresholds
- [ ] Failed tests block deployment in CI pipeline
