# Locust Load Testing

## Overview

Locust is a Python-based load testing framework that defines user behavior as Python code. Tests are written as Python classes, giving full access to the Python ecosystem for data generation, assertions, and integrations. Locust supports distributed execution across multiple machines and provides a real-time web UI for monitoring tests.

## Setup

```bash
# Install
pip install locust

# Verify
locust --version

# Install with extras
pip install locust[gevent]  # For better async performance
```

## HttpUser Class

```python
# locustfile.py
from locust import HttpUser, task, between

class WebsiteUser(HttpUser):
    """Simulates a user browsing and purchasing products."""

    wait_time = between(1, 5)  # Random wait between 1-5 seconds
    host = "https://api.example.com"

    def on_start(self):
        """Called when a simulated user starts. Login here."""
        response = self.client.post("/auth/login", json={
            "username": "loadtest",
            "password": "password123",
        })
        self.token = response.json()["token"]
        self.client.headers.update({
            "Authorization": f"Bearer {self.token}",
        })

    def on_stop(self):
        """Called when a simulated user stops."""
        self.client.post("/auth/logout")

    @task(3)
    def browse_products(self):
        """Browse the product catalog (weight: 3)."""
        with self.client.get("/products", catch_response=True) as response:
            if response.status_code == 200:
                products = response.json().get("products", [])
                if len(products) == 0:
                    response.failure("No products returned")
            else:
                response.failure(f"Status {response.status_code}")

    @task(2)
    def view_product(self):
        """View a specific product (weight: 2)."""
        product_id = "prod-123"
        self.client.get(f"/products/{product_id}", name="/products/[id]")

    @task(1)
    def create_order(self):
        """Place an order (weight: 1)."""
        with self.client.post("/orders", json={
            "productId": "prod-123",
            "quantity": 1,
        }, catch_response=True) as response:
            if response.status_code == 201:
                order_id = response.json().get("orderId")
                if not order_id:
                    response.failure("No orderId in response")
            elif response.status_code == 429:
                response.failure("Rate limited")
            else:
                response.failure(f"Unexpected status: {response.status_code}")
```

## Task Decorators and Weighting

The `@task` decorator marks methods as user actions. The weight parameter controls relative frequency.

```python
from locust import HttpUser, task, between, tag

class EcommerceUser(HttpUser):
    wait_time = between(2, 5)

    @task(10)
    def browse(self):
        """Most common action (weight 10)."""
        self.client.get("/products")

    @task(5)
    def search(self):
        """Moderately common (weight 5)."""
        self.client.get("/search?q=widget")

    @task(2)
    def add_to_cart(self):
        """Less common (weight 2)."""
        self.client.post("/cart", json={"productId": "123", "quantity": 1})

    @task(1)
    def checkout(self):
        """Least common (weight 1)."""
        self.client.post("/checkout", json={"paymentMethod": "card"})

    @tag("critical")
    @task(1)
    def health_check(self):
        """Tagged for selective execution."""
        self.client.get("/health")
```

### Running Tagged Tasks Only

```bash
# Run only tasks tagged "critical"
locust --tags critical

# Exclude tasks tagged "slow"
locust --exclude-tags slow
```

## Wait Time Strategies

```python
from locust import HttpUser, task, between, constant, constant_throughput, constant_pacing

class ConstantWaitUser(HttpUser):
    wait_time = constant(2)              # Always wait 2 seconds

class RandomWaitUser(HttpUser):
    wait_time = between(1, 5)            # Random 1-5 seconds

class ThroughputUser(HttpUser):
    wait_time = constant_throughput(0.5)  # 0.5 tasks per second per user

class PacingUser(HttpUser):
    wait_time = constant_pacing(2)       # Exactly 1 task every 2 seconds
                                          # (accounts for task execution time)
```

## Events

```python
from locust import HttpUser, task, between, events
import time
import logging

logger = logging.getLogger(__name__)

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    logger.info("Load test starting. Target: %s", environment.host)

@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    logger.info("Load test complete.")
    stats = environment.runner.stats
    logger.info("Total requests: %d", stats.total.num_requests)
    logger.info("Failure rate: %.2f%%", stats.total.fail_ratio * 100)

@events.request.add_listener
def on_request(request_type, name, response_time, response_length, response, exception, **kwargs):
    if response_time > 2000:
        logger.warning("Slow request: %s %s took %dms", request_type, name, response_time)

@events.init.add_listener
def on_init(environment, **kwargs):
    """Custom initialization (e.g., load test data)."""
    logger.info("Locust environment initialized")

class MonitoredUser(HttpUser):
    wait_time = between(1, 3)

    @task
    def browse(self):
        self.client.get("/products")
```

## Distributed Mode

Locust supports distributed execution with a master coordinating multiple worker processes.

### Single Machine (Multiple Cores)

```bash
# Start master
locust --master

# Start workers (one per CPU core)
locust --worker --master-host=127.0.0.1
locust --worker --master-host=127.0.0.1
locust --worker --master-host=127.0.0.1
locust --worker --master-host=127.0.0.1
```

### Multiple Machines

```bash
# On master machine
locust --master --expect-workers=4

# On each worker machine
locust --worker --master-host=192.168.1.100
```

### Docker Compose

```yaml
version: "3"
services:
  master:
    image: locustio/locust
    ports:
      - "8089:8089"
    volumes:
      - ./:/mnt/locust
    command: -f /mnt/locust/locustfile.py --master --expect-workers=4
    environment:
      - TARGET_HOST=https://api.example.com

  worker:
    image: locustio/locust
    volumes:
      - ./:/mnt/locust
    command: -f /mnt/locust/locustfile.py --worker --master-host=master
    deploy:
      replicas: 4
```

## Web UI

Locust provides a built-in web interface at `http://localhost:8089`.

```bash
# Start with web UI (default)
locust -f locustfile.py

# Specify port
locust -f locustfile.py --web-port 8090

# With authentication
locust -f locustfile.py --web-auth admin:password
```

The web UI provides:
- Real-time charts for RPS, response time, and user count
- Request statistics table (median, p95, p99, failures)
- Failure details with error messages
- Download results as CSV
- Start/stop/reset controls

## Custom Load Shapes

```python
from locust import HttpUser, task, between, LoadTestShape

class StepLoadShape(LoadTestShape):
    """Step load: increase users in steps."""

    step_time = 30        # Seconds per step
    step_load = 10        # Users added per step
    spawn_rate = 10       # Users spawned per second
    time_limit = 300      # Total test time

    def tick(self):
        run_time = self.get_run_time()

        if run_time > self.time_limit:
            return None   # Stop the test

        current_step = run_time // self.step_time
        target_users = self.step_load * (current_step + 1)

        return (target_users, self.spawn_rate)


class SpikeLoadShape(LoadTestShape):
    """Simulate traffic spikes."""

    stages = [
        {"duration": 60, "users": 20, "spawn_rate": 5},     # Normal load
        {"duration": 10, "users": 200, "spawn_rate": 50},   # Spike
        {"duration": 60, "users": 20, "spawn_rate": 5},     # Recovery
        {"duration": 10, "users": 200, "spawn_rate": 50},   # Second spike
        {"duration": 120, "users": 20, "spawn_rate": 5},    # Cool down
    ]

    def tick(self):
        run_time = self.get_run_time()
        elapsed = 0

        for stage in self.stages:
            elapsed += stage["duration"]
            if run_time < elapsed:
                return (stage["users"], stage["spawn_rate"])

        return None  # End test


class DoubleWaveShape(LoadTestShape):
    """Sinusoidal load pattern."""

    import math

    min_users = 10
    max_users = 100
    period = 120          # Seconds for one full wave
    time_limit = 600

    def tick(self):
        run_time = self.get_run_time()
        if run_time > self.time_limit:
            return None

        amplitude = (self.max_users - self.min_users) / 2
        offset = self.min_users + amplitude
        users = int(offset + amplitude * self.math.sin(2 * self.math.pi * run_time / self.period))
        spawn_rate = max(1, abs(users - (self.get_current_user_count() or 0)))

        return (users, min(spawn_rate, 50))
```

## Running Headless

```bash
# Headless with parameters
locust -f locustfile.py \
  --headless \
  --users 100 \
  --spawn-rate 10 \
  --run-time 5m \
  --host https://api.example.com \
  --csv results \
  --html report.html

# With stop timeout
locust -f locustfile.py \
  --headless \
  --users 50 \
  --spawn-rate 5 \
  --run-time 10m \
  --stop-timeout 30
```

### CI Integration (GitHub Actions)

```yaml
name: Load Test
on:
  workflow_dispatch:
    inputs:
      users:
        description: 'Number of users'
        default: '50'
      duration:
        description: 'Test duration'
        default: '5m'

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: pip install locust

      - name: Run load test
        env:
          TARGET_HOST: ${{ secrets.STAGING_URL }}
        run: |
          locust -f tests/load/locustfile.py \
            --headless \
            --users ${{ inputs.users }} \
            --spawn-rate 10 \
            --run-time ${{ inputs.duration }} \
            --host $TARGET_HOST \
            --csv results \
            --html report.html

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: locust-results
          path: |
            results_*.csv
            report.html
```

## Python Integration Patterns

### Data-Driven Testing

```python
import csv
import random
from locust import HttpUser, task, between

class DataDrivenUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        with open("test_data.csv") as f:
            reader = csv.DictReader(f)
            self.test_data = list(reader)

    @task
    def search_product(self):
        item = random.choice(self.test_data)
        self.client.get(f"/search?q={item['query']}", name="/search?q=[query]")

    @task
    def view_product(self):
        item = random.choice(self.test_data)
        self.client.get(f"/products/{item['product_id']}", name="/products/[id]")
```

### Custom Metrics with Events

```python
from locust import events
import time

@events.request.add_listener
def track_custom_metrics(request_type, name, response_time, response_length, response, exception, **kwargs):
    if name == "/orders" and response and response.status_code == 201:
        order_data = response.json()
        processing_time = order_data.get("processingTimeMs", 0)
        events.request.fire(
            request_type="custom",
            name="order_processing",
            response_time=processing_time,
            response_length=0,
            response=response,
            exception=None,
        )
```

## Anti-Patterns

1. **All tasks with equal weight** - Real users do not perform every action equally. Weight tasks to match production traffic ratios.
2. **No `name` parameter for parameterized URLs** - Without `name="/products/[id]"`, each unique URL gets its own statistics entry, making results unreadable.
3. **Blocking operations without gevent** - Locust uses gevent for concurrency. Blocking I/O (non-gevent-patched libraries) limits concurrency.
4. **Loading test data in tasks** - Reading CSV files on every iteration wastes time. Load data in `on_start` or module level.
5. **No `catch_response`** - Without it, Locust only checks HTTP status. Use `catch_response=True` to validate response content.
6. **Single worker for high user counts** - A single Locust process handles ~1000-5000 users. Use distributed mode for more.

## Production Checklist

- [ ] User classes model realistic behavior with weighted tasks
- [ ] Wait time reflects actual user think time
- [ ] Parameterized URLs use `name` parameter for aggregated statistics
- [ ] `catch_response=True` used for content validation
- [ ] `on_start` handles authentication and session setup
- [ ] Test data loaded once and reused across iterations
- [ ] Custom load shapes defined for spike, step, and wave patterns
- [ ] Distributed mode configured for tests exceeding single-machine capacity
- [ ] Headless mode and CSV output configured for CI integration
- [ ] HTML report generated and archived after each test run
- [ ] Event listeners track custom business metrics
- [ ] Tags applied to tasks for selective test execution
