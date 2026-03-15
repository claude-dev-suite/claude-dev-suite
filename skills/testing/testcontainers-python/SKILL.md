---
name: testcontainers-python
description: |
  testcontainers-python specialist. Covers all container modules (PostgreSQL, MySQL,
  MongoDB, Redis, Kafka, RabbitMQ, MinIO, Elasticsearch, LocalStack), GenericContainer,
  wait strategies, Docker Compose, networks, pytest fixtures, and CI/CD integration.

  USE WHEN: user mentions "testcontainers", "docker in tests", "real database in tests",
  "test with real postgres/redis/kafka", asks about container fixtures or Docker-based testing.

  DO NOT USE FOR: Spring Boot testcontainers (Java) - use `spring-boot-integration`;
  Mocking HTTP - use `fastapi-testing`; Pure pytest patterns - use `pytest`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# testcontainers-python

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `testcontainers-python`
> for comprehensive documentation on all containers, wait strategies, and advanced patterns.

## Installation

```bash
pip install "testcontainers[postgres]"
pip install "testcontainers[postgres,redis,kafka]"  # multiple
pip install testcontainers  # base only (GenericContainer, DockerCompose)
```

## Core Pattern — Session-Scoped Container

```python
import pytest
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg

def test_with_postgres(postgres_container):
    url = postgres_container.get_connection_url()  # sqlalchemy URL
    # Use url to connect
```

## Database Containers

```python
from testcontainers.postgres import PostgresContainer
from testcontainers.mysql import MySqlContainer
from testcontainers.mongodb import MongoDbContainer

# PostgreSQL
with PostgresContainer("postgres:16-alpine") as pg:
    url = pg.get_connection_url()
    # postgresql+psycopg2://test:test@localhost:{port}/test

# MySQL
with MySqlContainer("mysql:8.0") as mysql:
    url = mysql.get_connection_url()

# MongoDB
with MongoDbContainer("mongo:7") as mongo:
    client = MongoClient(mongo.get_connection_url())
```

## Cache / Messaging Containers

```python
from testcontainers.redis import RedisContainer
from testcontainers.kafka import KafkaContainer
from testcontainers.rabbitmq import RabbitMqContainer

# Redis
with RedisContainer("redis:7-alpine") as redis:
    host = redis.get_container_host_ip()
    port = redis.get_exposed_port(6379)

# Kafka (uses KRaft by default in v4+)
with KafkaContainer("confluentinc/cp-kafka:7.6.1") as kafka:
    bootstrap = kafka.get_bootstrap_server()

# RabbitMQ
with RabbitMqContainer("rabbitmq:3-management") as rmq:
    url = rmq.get_connection_params()  # pika connection params
```

## GenericContainer + Wait Strategies

```python
from testcontainers.core.container import DockerContainer
from testcontainers.core.waiting_utils import wait_for_logs

@pytest.fixture(scope="session")
def meilisearch():
    with (
        DockerContainer("getmeili/meilisearch:latest")
        .with_exposed_ports(7700)
        .with_env("MEILI_MASTER_KEY", "test_key")
        .with_kwargs(mem_limit="256m")
    ) as container:
        wait_for_logs(container, "Server listening on")
        yield container
```

### All Wait Strategies

```python
from testcontainers.core.waiting_utils import (
    wait_for_logs,           # wait_for_logs(container, "started", timeout=60)
    wait_container_is_ready, # wait_container_is_ready(container)
)
from testcontainers.core.wait.http_wait import HttpWaitStrategy
from testcontainers.core.wait.log_wait import LogMessageWaitStrategy
from testcontainers.core.wait.exec_wait import ExecWaitStrategy

# HTTP health check
container.with_wait_for(
    HttpWaitStrategy("/health").with_status_code(200).with_startup_timeout(60)
)

# Log message
container.with_wait_for(
    LogMessageWaitStrategy(r".*Application started.*")
)

# Exec command
container.with_wait_for(
    ExecWaitStrategy(["pg_isready", "-U", "test"])
)
```

## Docker Compose

```python
from testcontainers.compose import DockerCompose

@pytest.fixture(scope="session")
def compose():
    with DockerCompose(
        filepath="tests/",
        compose_file_name="docker-compose.test.yml",
        pull=True,
    ) as c:
        c.wait_for("http://localhost:8080/health")
        yield c
```

## Multi-Container Network

```python
from testcontainers.core.network import Network
from testcontainers.core.container import DockerContainer
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def test_network():
    with Network() as net:
        yield net

@pytest.fixture(scope="session")
def pg(test_network):
    with (
        PostgresContainer("postgres:16-alpine")
        .with_network(test_network)
        .with_network_aliases("postgres")
    ) as pg:
        yield pg
```

## Async Support

```python
import asyncpg

@pytest.fixture(scope="session")
async def async_pg(postgres_container):
    url = postgres_container.get_connection_url().replace(
        "postgresql+psycopg2://", "postgresql://"
    )
    pool = await asyncpg.create_pool(url)
    yield pool
    await pool.close()
```

## Container Reuse (Dev Mode)

```bash
# ~/.testcontainers.properties
testcontainers.reuse.enable=true
```

```python
container = PostgresContainer("postgres:16").with_kwargs(labels={"testcontainers.reuse": "true"})
```

## CI/CD — GitHub Actions

```yaml
jobs:
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e ".[test]"
      - run: pytest -m integration
        env:
          DOCKER_HOST: unix:///var/run/docker.sock
          TESTCONTAINERS_RYUK_DISABLED: "false"
```

## Anti-Patterns

| Anti-Pattern | Solution |
|---|---|
| New container per test | Session-scoped with `scope="session"` |
| Hardcoded `localhost:5432` | `container.get_exposed_port(5432)` |
| Using `latest` image | Pin to `postgres:16-alpine` |
| No wait strategy | Always use wait_for_logs or HttpWaitStrategy |

## Reference Documentation
- [Comprehensive Reference](../pytest/quick-ref/testcontainers-python.md)

**Official docs:** https://testcontainers-python.readthedocs.io/
