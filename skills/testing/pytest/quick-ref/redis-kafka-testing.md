# Testing Redis and Kafka in Python

## Redis Testing

### Option A: fakeredis (no Docker, recommended for unit/fast integration)

```bash
pip install fakeredis[lua]          # + Lua script support
pip install fakeredis[json]         # + RedisJSON module support
```

```python
# tests/conftest.py
import pytest
import fakeredis

@pytest.fixture
def redis_client():
    """FakeRedis instance — reset for every test."""
    return fakeredis.FakeRedis(decode_responses=True)

@pytest.fixture
def async_redis_client():
    """Async FakeRedis for asyncio tests."""
    return fakeredis.FakeAsyncRedis(decode_responses=True)

# Shared state between two clients (same FakeServer instance)
@pytest.fixture
def shared_redis_server():
    return fakeredis.FakeServer()

@pytest.fixture
def redis_pub(shared_redis_server):
    return fakeredis.FakeRedis(server=shared_redis_server, decode_responses=True)

@pytest.fixture
def redis_sub(shared_redis_server):
    return fakeredis.FakeRedis(server=shared_redis_server, decode_responses=True)
```

```python
# tests/test_cache_service.py
def test_cache_set_get(redis_client):
    redis_client.set("user:1", '{"name": "Alice"}', ex=300)
    value = redis_client.get("user:1")
    assert value == '{"name": "Alice"}'

def test_cache_expiry(redis_client):
    redis_client.set("tmp", "value", px=100)  # 100ms TTL
    import time; time.sleep(0.2)
    assert redis_client.get("tmp") is None

@pytest.mark.asyncio
async def test_async_cache(async_redis_client):
    await async_redis_client.set("key", "val")
    result = await async_redis_client.get("key")
    assert result == "val"

def test_connection_error(shared_redis_server):
    """Simulate Redis being unreachable."""
    shared_redis_server.connected = False
    client = fakeredis.FakeRedis(server=shared_redis_server)
    with pytest.raises(redis.exceptions.ConnectionError):
        client.set("x", "y")
```

### Option B: pytest-redis (real Redis process managed by pytest)

```bash
pip install pytest-redis
```

```python
# conftest.py — pytest-redis starts/stops a local redis-server binary
import pytest

# redis_proc: session-scoped, starts redis-server
# redisdb:    function-scoped client, cleans DB after each test
# Both fixtures are provided by the plugin automatically.

def test_real_redis(redisdb):
    redisdb.set("hello", "world")
    assert redisdb.get("hello") == b"world"
```

### Option C: Testcontainers Redis (realistic, isolated)

```python
# conftest.py
import pytest
import redis
from testcontainers.redis import RedisContainer

@pytest.fixture(scope="session")
def redis_container():
    with RedisContainer("redis:7-alpine") as container:
        yield container

@pytest.fixture
def redis_client(redis_container):
    client = redis.Redis(
        host=redis_container.get_container_host_ip(),
        port=redis_container.get_exposed_port(6379),
        decode_responses=True,
    )
    yield client
    client.flushall()     # clean up between tests
    client.close()
```

### FastAPI Dependency Override Pattern

```python
# tests/conftest.py
import fakeredis
from myapp.main import app
from myapp.dependencies import get_redis

@pytest.fixture
def client():
    fake = fakeredis.FakeRedis(decode_responses=True)
    app.dependency_overrides[get_redis] = lambda: fake
    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

---

## Kafka Testing

### Option A: mockafka-py (no broker, confluent-kafka and aiokafka)

```bash
pip install mockafka-py
```

#### Synchronous (confluent-kafka)

```python
from mockafka import setup_kafka, produce, consume, bulk_produce

@setup_kafka(topics=[{"topic": "orders", "partition": 4}])
@produce(topic="orders", key="order-1", value='{"id": 1, "status": "created"}', partition=0)
@produce(topic="orders", key="order-2", value='{"id": 2, "status": "created"}', partition=0)
@consume(topics=["orders"])
def test_order_consumer(message=None):
    if message is None:
        return
    import json
    payload = json.loads(message.value())
    assert payload["status"] == "created"
```

```python
# Bulk produce
SAMPLE_MESSAGES = [
    {"topic": "events", "key": f"key-{i}", "value": f"val-{i}", "partition": i % 4}
    for i in range(100)
]

@setup_kafka(topics=[{"topic": "events", "partition": 4}])
@bulk_produce(list_of_messages=SAMPLE_MESSAGES)
@consume(topics=["events"])
def test_bulk_events(message=None):
    if message is None:
        return
    assert message.key() is not None
```

```python
# Class-based approach (no decorators)
from mockafka import FakeProducer, FakeConsumer, FakeAdminClientImpl
from confluent_kafka.admin import NewTopic

def test_produce_and_consume_class_style():
    admin = FakeAdminClientImpl()
    admin.create_topics([NewTopic("payments", num_partitions=2)])

    producer = FakeProducer()
    producer.produce(topic="payments", key="txn-1", value="100.00", partition=0)
    producer.flush()

    consumer = FakeConsumer()
    consumer.subscribe(["payments"])
    msg = consumer.poll(timeout=1.0)
    assert msg is not None
    assert msg.key() == "txn-1"
    consumer.close()
```

#### Asynchronous (aiokafka)

```python
import pytest
from mockafka import asetup_kafka, aproduce, aconsume

@pytest.mark.asyncio
@asetup_kafka(topics=[{"topic": "user-events", "partition": 8}], clean=True)
@aproduce(topic="user-events", key="user-123", value='{"event":"login"}', partition=0)
@aconsume(topics=["user-events"])
async def test_async_event_consumer(message=None):
    if message is None:
        return
    assert message.key() == "user-123"
```

### Option B: Testcontainers Kafka (real broker, integration tests)

```bash
pip install testcontainers[kafka] confluent-kafka
```

```python
# conftest.py
import pytest
from testcontainers.kafka import KafkaContainer
from confluent_kafka import Producer, Consumer, KafkaError
from confluent_kafka.admin import AdminClient, NewTopic

@pytest.fixture(scope="session")
def kafka_container():
    with KafkaContainer("confluentinc/cp-kafka:7.6.0") as kafka:
        yield kafka

@pytest.fixture(scope="session")
def kafka_bootstrap(kafka_container):
    return kafka_container.get_bootstrap_server()

@pytest.fixture
def kafka_admin(kafka_bootstrap):
    admin = AdminClient({"bootstrap.servers": kafka_bootstrap})
    return admin

@pytest.fixture
def kafka_producer(kafka_bootstrap):
    p = Producer({"bootstrap.servers": kafka_bootstrap})
    yield p
    p.flush()

@pytest.fixture
def kafka_consumer(kafka_bootstrap):
    c = Consumer({
        "bootstrap.servers": kafka_bootstrap,
        "group.id": "test-group",
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    })
    yield c
    c.close()
```

```python
# tests/test_kafka_integration.py
import json, time

def test_produce_consume(kafka_admin, kafka_producer, kafka_consumer, kafka_bootstrap):
    # Create topic
    kafka_admin.create_topics([NewTopic("orders", num_partitions=1, replication_factor=1)])
    time.sleep(1)  # wait for topic creation

    # Produce a message
    kafka_producer.produce("orders", key="order-1", value=json.dumps({"id": 1}))
    kafka_producer.flush()

    # Consume and verify
    kafka_consumer.subscribe(["orders"])
    msg = kafka_consumer.poll(timeout=10.0)
    assert msg is not None
    assert not msg.error()
    payload = json.loads(msg.value())
    assert payload["id"] == 1
```

### Option C: pytest-kafka plugin (manages Kafka process via trivup)

```bash
pip install pytest-kafka
```

```python
# conftest.py — pytest-kafka provides kafka_server and zookeeper fixtures
from pytest_kafka import make_zookeeper_process, make_kafka_process, make_kafka_consumer

ZOOKEEPER_PROC = make_zookeeper_process()
KAFKA_PROC = make_kafka_process(ZOOKEEPER_PROC)

# Fixtures are available as `zookeeper_proc` and `kafka_server`
def test_with_kafka_server(kafka_server):
    bootstrap = kafka_server.bootstrap_server
    assert bootstrap is not None
```

### GitHub Actions: Kafka Service Container

```yaml
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.6.0
    env:
      ZOOKEEPER_CLIENT_PORT: 2181
    ports:
      - 2181:2181

  kafka:
    image: confluentinc/cp-kafka:7.6.0
    env:
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    ports:
      - 9092:9092
    options: >-
      --health-cmd "kafka-topics --bootstrap-server localhost:9092 --list"
      --health-interval 10s
      --health-timeout 10s
      --health-retries 10
```

---

## Redis + Kafka Combined Fixture Pattern

```python
# conftest.py
import pytest
import fakeredis
from mockafka import FakeProducer, FakeConsumer, FakeAdminClientImpl

@pytest.fixture
def infra(monkeypatch):
    """Swap all external infra with in-memory fakes."""
    fake_redis = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr("myapp.cache.redis_client", fake_redis)

    fake_producer = FakeProducer()
    monkeypatch.setattr("myapp.events.producer", fake_producer)

    return {"redis": fake_redis, "producer": fake_producer}

def test_order_processing_pipeline(infra, db_session):
    # Creates order, caches it in Redis, publishes to Kafka
    result = process_order(order_id="42", db=db_session)
    assert infra["redis"].get("order:42") is not None
```
