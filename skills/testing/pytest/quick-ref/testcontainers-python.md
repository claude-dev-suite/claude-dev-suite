# testcontainers-python — Comprehensive Reference

Version at time of writing: **4.14.1** (2026-01-31). Python ≥ 3.10 required.

---

## 1. Installation

```bash
# Core package only (GenericContainer, Network, DockerCompose, DockerImage)
pip install testcontainers

# Database modules
pip install "testcontainers[postgres]"
pip install "testcontainers[mysql]"
pip install "testcontainers[mongodb]"
pip install "testcontainers[redis]"
pip install "testcontainers[cassandra]"
pip install "testcontainers[clickhouse]"
pip install "testcontainers[elasticsearch]"
pip install "testcontainers[kafka]"
pip install "testcontainers[rabbitmq]"
pip install "testcontainers[minio]"
pip install "testcontainers[localstack]"

# Multiple extras at once
pip install "testcontainers[postgres,redis,kafka]"
```

### Full extras catalogue

| Extra | Extra deps installed |
|-------|---------------------|
| `postgres` | *(none — driver installed separately)* |
| `mysql` | sqlalchemy>=2, pymysql[rsa]>=1 |
| `mongodb` | pymongo>=4 |
| `redis` | redis>=7 |
| `kafka` | *(none)* |
| `rabbitmq` | pika>=1 |
| `minio` | minio>=7 |
| `localstack` | boto3>=1 |
| `elasticsearch` | *(none)* |
| `cassandra` | *(none)* |
| `clickhouse` | clickhouse-driver |
| `aws` | boto3>=1, httpx |
| `azurite` | azure-storage-blob>=12 |
| `neo4j` | neo4j>=6 |
| `cockroachdb` | *(none)* |
| `generic` | httpx, redis>=7 |
| `selenium` | selenium>=4 |
| `vault` | *(none)* |
| `k3s` | kubernetes, pyyaml>=6 |
| `trino` | trino |

### Docker requirements

- Docker Engine ≥ 20.10 running locally or reachable via `DOCKER_HOST`
- Ryuk container (`testcontainers/ryuk:0.8.1`) must be pullable unless disabled — handles cleanup of orphaned containers automatically

---

## 2. Core Architecture

```
testcontainers/
├── core/
│   ├── container.py        # DockerContainer base class
│   ├── image.py            # DockerImage (build from Dockerfile)
│   ├── network.py          # Network context manager
│   ├── config.py           # TestcontainersConfiguration
│   ├── wait_strategies.py  # LogMessageWaitStrategy, HttpWaitStrategy, etc.
│   ├── waiting_utils.py    # WaitStrategy ABC, wait_for_logs (legacy)
│   └── generic.py          # DbContainer (deprecated base for DB containers)
├── compose/
│   └── compose.py          # DockerCompose
└── modules/
    └── postgres/, mysql/, redis/, kafka/, ...
```

### Import paths

```python
from testcontainers.core.container import DockerContainer
from testcontainers.core.image import DockerImage
from testcontainers.core.network import Network
from testcontainers.compose import DockerCompose
from testcontainers.core.wait_strategies import (
    LogMessageWaitStrategy,
    HttpWaitStrategy,
    PortWaitStrategy,
    ExecWaitStrategy,
    HealthcheckWaitStrategy,
    FileExistsWaitStrategy,
    ContainerStatusWaitStrategy,
    CompositeWaitStrategy,
)

# Module containers
from testcontainers.postgres import PostgresContainer
from testcontainers.mysql import MySqlContainer
from testcontainers.mongodb import MongoDbContainer
from testcontainers.redis import RedisContainer, AsyncRedisContainer
from testcontainers.kafka import KafkaContainer
from testcontainers.rabbitmq import RabbitMqContainer
from testcontainers.minio import MinioContainer
from testcontainers.localstack import LocalStackContainer
from testcontainers.elasticsearch import ElasticSearchContainer
from testcontainers.cassandra import CassandraContainer
from testcontainers.clickhouse import ClickHouseContainer
```

---

## 3. DockerContainer — Base Class API

### Constructor

```python
DockerContainer(
    image: str,
    docker_client_kw: Optional[dict] = None,
    command: Optional[str] = None,
    env: Optional[dict[str, str]] = None,
    name: Optional[str] = None,
    ports: Optional[list[int]] = None,
    volumes: Optional[list[tuple]] = None,
    network: Optional[Network] = None,
    network_aliases: Optional[list[str]] = None,
    _wait_strategy: Optional[WaitStrategy] = None,
    **kwargs,
)
```

### Fluent configuration methods (all return `Self`)

```python
container = DockerContainer("nginx:alpine")

# Environment variables
container.with_env("KEY", "value")
container.with_envs(KEY="value", OTHER="value2")          # multiple at once
container.with_env_file("/path/to/.env")                   # reads dotenv file

# Ports
container.with_exposed_ports(8080)                         # random host port
container.with_exposed_ports(8080, 8443)                   # multiple
container.with_bind_ports(8080, 80)                        # container:host

# Volumes
container.with_volume_mapping("/host/path", "/container/path", mode="ro")
# mode: "ro" (read-only, default) or "rw" (read-write)

# Networking
container.with_network(network)                            # attach to Network
container.with_network_aliases("alias1", "alias2")

# Command and naming
container.with_command("nginx -g 'daemon off;'")
container.with_name("my-nginx")

# Wait strategy
container.waiting_for(LogMessageWaitStrategy("ready"))

# Pass extra kwargs to docker-py's run()
container.with_kwargs(mem_limit="512m", cpu_quota=50000)
```

### Lifecycle

```python
# As context manager (recommended)
with DockerContainer("hello-world") as container:
    stdout, stderr = container.get_logs()

# Manual lifecycle
container = DockerContainer("hello-world")
container.start()
# ... use container ...
container.stop(force=True, delete_volume=True)
```

### Query methods

```python
container.get_container_host_ip()   # → str, e.g. "127.0.0.1"
container.get_exposed_port(8080)    # → int, mapped host port
container.get_logs()                # → tuple[bytes, bytes] stdout, stderr
container.exec("command string")    # → (exit_code: int, output: bytes)
container.exec(["sh", "-c", "ls"])  # list form
container.status                    # "running", "created", "exited", ...
container.reload()                  # refresh container state
container.get_wrapped_container()   # underlying docker-py container object
```

---

## 4. Wait Strategies

All strategies inherit from `WaitStrategy` and support:

```python
strategy.with_startup_timeout(60)                    # seconds (int)
strategy.with_startup_timeout(timedelta(minutes=2))  # timedelta
strategy.with_poll_interval(0.5)                     # seconds (float)
strategy.with_poll_interval(timedelta(milliseconds=500))
strategy.with_transient_exceptions(MyException)      # retry on these
```

Methods chain fluently and return `Self`.

### LogMessageWaitStrategy

Waits for a string or regex pattern to appear in container logs.

```python
LogMessageWaitStrategy(
    message: Union[str, re.Pattern[str]],
    times: int = 1,                    # how many times pattern must appear
    predicate_streams_and: bool = False  # if True, must match BOTH stdout and stderr
)
```

```python
# Wait for literal string in logs
strategy = LogMessageWaitStrategy("ready for connections")

# Wait for regex in logs
import re
strategy = LogMessageWaitStrategy(re.compile(r"Server started on port \d+"))

# Wait for pattern to appear twice (e.g. MySQL "ready for connections" appears 2x)
strategy = LogMessageWaitStrategy(
    re.compile(r".*: ready for connections.*", flags=re.DOTALL | re.MULTILINE),
)

# Use on container
container.waiting_for(strategy.with_startup_timeout(60))
```

### HttpWaitStrategy

Makes HTTP requests to verify endpoint availability.

```python
HttpWaitStrategy(
    port: int,
    path: Optional[str] = "/",    # default path
)

# Factory method from full URL
HttpWaitStrategy.from_url("https://localhost:8080/api/health")
```

Fluent configuration:

```python
strategy = HttpWaitStrategy(8080, "/health")

strategy.for_status_code(200)                                   # exact code
strategy.for_status_code_matching(lambda code: 200 <= code < 300)  # predicate
strategy.for_response_predicate(lambda body: '"status":"ok"' in body)
strategy.using_tls(insecure=True)                               # HTTPS, skip cert verify
strategy.with_header("Authorization", "Bearer mytoken")
strategy.with_basic_credentials("user", "pass")
strategy.with_method("POST")
strategy.with_body('{"probe": true}')
```

Full example:

```python
container = (
    DockerContainer("myapp:latest")
    .with_exposed_ports(8080)
    .waiting_for(
        HttpWaitStrategy(8080, "/health")
        .for_status_code(200)
        .for_response_predicate(lambda body: "ready" in body)
        .with_startup_timeout(120)
    )
)
```

### PortWaitStrategy

Attempts a TCP connection to verify a port is listening.

```python
PortWaitStrategy(port: int)

# Example
container.waiting_for(PortWaitStrategy(5432).with_startup_timeout(60))
```

### ExecWaitStrategy

Executes a command inside the running container and waits for successful exit code.

```python
ExecWaitStrategy(
    command: Union[str, list[str]],
    expected_exit_code: int = 0,
)
```

```python
# Wait until psql can connect
strategy = ExecWaitStrategy(
    ["sh", "-c", "pg_isready -hlocalhost -Utest"]
)

# Wait until Redis PING returns PONG
strategy = ExecWaitStrategy(["redis-cli", "ping"])

# Custom exit code
strategy = ExecWaitStrategy("some-check", expected_exit_code=0)
```

PostgresContainer uses this internally:

```python
ExecWaitStrategy([
    "sh", "-c",
    f"PGPASSWORD='{password}' psql --username {username} --dbname {dbname} --host 127.0.0.1 -c 'select version();'"
])
```

### HealthcheckWaitStrategy

Waits for the container's Docker HEALTHCHECK to report "healthy". The container image must have a `HEALTHCHECK` instruction.

```python
HealthcheckWaitStrategy()

container.waiting_for(HealthcheckWaitStrategy().with_startup_timeout(120))
```

### FileExistsWaitStrategy

Waits for a file to appear on the host filesystem (useful for volume-mounted files created by containers).

```python
FileExistsWaitStrategy(file_path: Union[str, Path])

container.waiting_for(
    FileExistsWaitStrategy("/tmp/container-ready.lock").with_startup_timeout(30)
)
```

### ContainerStatusWaitStrategy

Waits for the container to reach "running" status.

```python
ContainerStatusWaitStrategy()

# Used internally by DbContainer
ContainerStatusWaitStrategy().with_transient_exceptions(Exception).wait_until_ready(self)
```

### CompositeWaitStrategy

Chains multiple strategies; all must succeed.

```python
CompositeWaitStrategy(*strategies: WaitStrategy)

container.waiting_for(
    CompositeWaitStrategy(
        PortWaitStrategy(5432),
        ExecWaitStrategy("pg_isready"),
    ).with_startup_timeout(120)
)
```

Timeout and poll interval set on the composite propagate to all child strategies.

### Legacy helpers (deprecated)

```python
# Deprecated — use WaitStrategy objects instead
from testcontainers.core.waiting_utils import wait_for_logs, wait_container_is_ready

# Old usage (still works but triggers DeprecationWarning)
wait_for_logs(container, "ready for connections")
wait_for_logs(container, lambda logs: "started" in logs)

# Decorator pattern (deprecated)
@wait_container_is_ready(ConnectionError)
def _connect(self) -> None:
    client.ping()
```

---

## 5. Built-in Container Modules

### PostgresContainer

```python
from testcontainers.postgres import PostgresContainer

PostgresContainer(
    image: str = "postgres:latest",
    port: int = 5432,
    username: Optional[str] = None,     # env POSTGRES_USER, default "test"
    password: Optional[str] = None,     # env POSTGRES_PASSWORD, default "test"
    dbname: Optional[str] = None,       # env POSTGRES_DB, default "test"
    driver: Optional[str] = "psycopg2", # None → no driver prefix in URL
    **kwargs,
)
```

Methods:
- `get_connection_url(host=None, driver=_UNSET) -> str` — returns SQLAlchemy-compatible URL
- `get_container_host_ip() -> str`
- `get_exposed_port(5432) -> int`

Wait strategy: `ExecWaitStrategy` running `psql -c 'select version();'`

```python
# Basic usage
with PostgresContainer("postgres:16-alpine") as pg:
    url = pg.get_connection_url()  # postgresql+psycopg2://test:test@127.0.0.1:PORT/test

# With psycopg3 driver
with PostgresContainer("postgres:16", driver="psycopg") as pg:
    engine = sqlalchemy.create_engine(pg.get_connection_url())

# Without driver prefix (for asyncpg, asyncio raw connections)
with PostgresContainer("postgres:16", driver=None) as pg:
    url = pg.get_connection_url()  # postgresql://test:test@127.0.0.1:PORT/test

# Custom credentials
with PostgresContainer(
    "postgres:16-alpine",
    username="myuser",
    password="s3cr3t",
    dbname="mydb",
) as pg:
    engine = sqlalchemy.create_engine(pg.get_connection_url())

# Initialization via volume mount
from pathlib import Path
container = PostgresContainer("postgres:16-alpine")
script = Path("tests/fixtures/schema.sql")
container.with_volume_mapping(
    host=str(script),
    container=f"/docker-entrypoint-initdb.d/{script.name}"
)
with container as pg:
    engine = sqlalchemy.create_engine(pg.get_connection_url())
    # schema.sql has already been executed
```

Environment variable fallbacks: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`

### MySqlContainer

```python
from testcontainers.mysql import MySqlContainer

MySqlContainer(
    image: str = "mysql:latest",
    dialect: Optional[str] = None,        # e.g. "pymysql" — do NOT include "mysql+" prefix
    username: Optional[str] = None,       # env MYSQL_USER, default "test"
    root_password: Optional[str] = None,  # env MYSQL_ROOT_PASSWORD, default "test"
    password: Optional[str] = None,       # env MYSQL_PASSWORD, default "test"
    dbname: Optional[str] = None,         # env MYSQL_DATABASE, default "test"
    port: int = 3306,
    seed: Optional[str] = None,           # path to directory of .sql files
    wait_strategy_check_string: str = r".*: ready for connections.*: ready for connections.*",
    **kwargs,
)
```

Methods: `get_connection_url() -> str`

Wait strategy: `LogMessageWaitStrategy` looking for double "ready for connections".

```python
# Basic usage
with MySqlContainer("mysql:8.3.0") as mysql:
    engine = sqlalchemy.create_engine(mysql.get_connection_url())

# With PyMySQL dialect
with MySqlContainer("mysql:8.3.0", dialect="pymysql") as mysql:
    url = mysql.get_connection_url()  # mysql+pymysql://test:test@HOST:PORT/test

# With seed SQL files
with MySqlContainer(seed="tests/seeds/") as mysql:
    engine = sqlalchemy.create_engine(mysql.get_connection_url())
    # SQL files from tests/seeds/ loaded into /docker-entrypoint-initdb.d/

# MariaDB
with MySqlContainer("mariadb:11.3.2", dialect="pymysql") as mariadb:
    engine = sqlalchemy.create_engine(mariadb.get_connection_url())
```

Environment variable fallbacks: `MYSQL_USER`, `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_DIALECT`

### MongoDbContainer

```python
from testcontainers.mongodb import MongoDbContainer

MongoDbContainer(
    image: str = "mongo:latest",
    port: int = 27017,
    username: Optional[str] = None,   # env MONGO_INITDB_ROOT_USERNAME, default "test"
    password: Optional[str] = None,   # env MONGO_INITDB_ROOT_PASSWORD, default "test"
    dbname: Optional[str] = None,     # env MONGO_DB, default "test"
    **kwargs,
)
```

Methods: `get_connection_url() -> str`, `get_connection_client() -> MongoClient`

Wait strategy: waits for "waiting for connections" in logs.

```python
from testcontainers.mongodb import MongoDbContainer

with MongoDbContainer("mongo:7.0.7") as mongo:
    client = mongo.get_connection_client()
    db = client.test
    result = db.restaurants.insert_one({"name": "Vella", "cuisine": "Italian"})
    doc = db.restaurants.find_one({"name": "Vella"})
```

### RedisContainer / AsyncRedisContainer

```python
from testcontainers.redis import RedisContainer, AsyncRedisContainer

RedisContainer(
    image: str = "redis:latest",
    port: int = 6379,
    password: Optional[str] = None,
    **kwargs,
)
```

Methods: `get_client(**kwargs) -> redis.Redis`

```python
# Synchronous
with RedisContainer("redis:7-alpine") as redis_container:
    client = redis_container.get_client()
    client.set("key", "value")
    assert client.get("key") == b"value"

# With password
with RedisContainer("redis:7-alpine", password="s3cr3t") as redis_container:
    client = redis_container.get_client()
    client.ping()
```

```python
# Async
import pytest
from testcontainers.redis import AsyncRedisContainer

@pytest.mark.parametrize("anyio_backend", ["asyncio"])
async def test_async_redis(anyio_backend):
    with AsyncRedisContainer() as container:
        client = await container.get_async_client(decode_responses=True)
        await client.set("hello", "world")
        value = await client.get("hello")
        assert value == "world"
```

### KafkaContainer

```python
from testcontainers.kafka import KafkaContainer

KafkaContainer(
    image: str = "confluentinc/cp-kafka:7.6.0",
    port: int = 9093,
    wait_strategy_check_string: str = r".*\[KafkaServer id=\d+\] started.*",
    listener_name: str = "PLAINTEXT",
    security_protocol: str = "PLAINTEXT",
    **kwargs,
)
```

Methods: `get_bootstrap_server() -> str`, `with_kraft() -> Self`, `with_cluster_id(id) -> Self`

Wait strategy: `LogMessageWaitStrategy` on `[KafkaServer id=\d+] started`

```python
from testcontainers.kafka import KafkaContainer

# ZooKeeper mode (default)
with KafkaContainer() as kafka:
    server = kafka.get_bootstrap_server()  # e.g. "127.0.0.1:32768"
    producer = KafkaProducer(bootstrap_servers=[server])
    producer.send("my-topic", b"hello")

# KRaft mode (Kafka 7.0.0+)
with KafkaContainer("confluentinc/cp-kafka:7.6.0").with_kraft() as kafka:
    server = kafka.get_bootstrap_server()

# Custom port
with KafkaContainer(port=9888) as kafka:
    assert kafka.port == 9888

# On a Docker network (for multi-container scenarios)
from testcontainers.core.network import Network
from testcontainers.kafka import kafka_config

with Network() as network:
    kafka = (
        KafkaContainer()
        .with_network(network)
        .with_network_aliases("kafka")
    )
    kafka_config.limit_broker_to_first_host = True
    with kafka:
        server = kafka.get_bootstrap_server()
```

### RabbitMqContainer

```python
from testcontainers.rabbitmq import RabbitMqContainer

RabbitMqContainer(
    image: str = "rabbitmq:latest",
    port: Optional[int] = None,        # env RABBITMQ_NODE_PORT, default 5672
    username: Optional[str] = None,    # env RABBITMQ_DEFAULT_USER, default "guest"
    password: Optional[str] = None,    # env RABBITMQ_DEFAULT_PASS, default "guest"
    vhost: Optional[str] = None,       # env RABBITMQ_DEFAULT_VHOST, default "/"
    **kwargs,
)
```

Methods: `get_connection_params() -> pika.ConnectionParameters`

```python
import pika
from testcontainers.rabbitmq import RabbitMqContainer

with RabbitMqContainer("rabbitmq:3.13") as rmq:
    connection = pika.BlockingConnection(rmq.get_connection_params())
    channel = connection.channel()
    channel.queue_declare("my-queue")
    channel.basic_publish("", "my-queue", b"hello")
    method, props, body = channel.basic_get("my-queue")
    assert body == b"hello"

# Custom credentials
with RabbitMqContainer(
    "rabbitmq:3.13",
    username="myuser",
    password="mypass",
    vhost="myvhost",
    port=5673,
) as rmq:
    params = rmq.get_connection_params()
```

### MinioContainer

```python
from testcontainers.minio import MinioContainer

MinioContainer(
    image: str = "minio/minio:RELEASE.2022-12-02T19-19-22Z",
    port: int = 9000,
    access_key: str = "minioadmin",
    secret_key: str = "minioadmin",
    **kwargs,
)
```

Methods: `get_client(**kwargs) -> Minio`, `get_config() -> dict`

Wait strategy: `HttpWaitStrategy(port, "/minio/health/live")`

```python
import io
from testcontainers.minio import MinioContainer

with MinioContainer(access_key="test", secret_key="test") as minio:
    client = minio.get_client()
    client.make_bucket("my-bucket")

    content = b"Hello, World!"
    client.put_object("my-bucket", "hello.txt", io.BytesIO(content), len(content))

    data = client.get_object("my-bucket", "hello.txt").data
    assert data == content

    # Get connection config for direct use
    cfg = minio.get_config()
    # {"endpoint": "127.0.0.1:PORT", "access_key": "test", "secret_key": "test"}
```

### LocalStackContainer

```python
from testcontainers.localstack import LocalStackContainer

LocalStackContainer(
    image: str = "localstack/localstack:2.0.1",
    edge_port: int = 4566,
    region_name: Optional[str] = None,  # env AWS_DEFAULT_REGION, default "us-west-1"
    **kwargs,
)
```

Methods: `get_url() -> str`, `get_client(name, **kwargs) -> boto3.client`, `with_services(*services) -> Self`

```python
import boto3
from testcontainers.localstack import LocalStackContainer

with LocalStackContainer(image="localstack/localstack:3.0") as localstack:
    # Restrict to specific services (faster startup)
    # localstack.with_services("s3", "sqs", "dynamodb")

    # Get a boto3 client pre-configured for LocalStack
    s3 = localstack.get_client("s3")
    s3.create_bucket(Bucket="test-bucket")
    s3.put_object(Bucket="test-bucket", Key="hello.txt", Body=b"world")

    dynamo = localstack.get_client("dynamodb")
    tables = dynamo.list_tables()

# Direct boto3 client configuration
with LocalStackContainer() as localstack:
    endpoint = localstack.get_url()
    sqs = boto3.client(
        "sqs",
        endpoint_url=endpoint,
        region_name="us-east-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",
    )
    queue = sqs.create_queue(QueueName="my-queue")
```

### ElasticSearchContainer

```python
from testcontainers.elasticsearch import ElasticSearchContainer

ElasticSearchContainer(
    image: str = "elasticsearch",   # include version tag: "elasticsearch:8.12.2"
    port: int = 9200,
    mem_limit: str = ...,           # pass via kwargs: mem_limit="3G"
    **kwargs,
)
```

Wait strategy: `HttpWaitStrategy(9200)` (requires `xpack.security.enabled=false` for ES 8+, set automatically).

```python
import json, urllib.request
from testcontainers.elasticsearch import ElasticSearchContainer

# ES 8.x (security automatically disabled for testing)
with ElasticSearchContainer("elasticsearch:8.12.2", mem_limit="3G") as es:
    host = es.get_container_host_ip()
    port = es.get_exposed_port(9200)
    resp = urllib.request.urlopen(f"http://{host}:{port}")
    info = json.loads(resp.read().decode())
    assert info["version"]["number"] == "8.12.2"

# With elasticsearch-py client
from elasticsearch import Elasticsearch
with ElasticSearchContainer("elasticsearch:8.12.2", mem_limit="3G") as es:
    host = es.get_container_host_ip()
    port = es.get_exposed_port(9200)
    client = Elasticsearch(f"http://{host}:{port}")
    client.index(index="test", document={"field": "value"})
```

### CassandraContainer

```python
from testcontainers.cassandra import CassandraContainer

CassandraContainer(
    image: str = "cassandra:latest",
    wait_strategy_check_string: str = "Startup complete",
    **kwargs,
)
```

Class constants: `CQL_PORT = 9042`, `DEFAULT_LOCAL_DATACENTER = "datacenter1"`

Methods: `get_contact_points() -> list[tuple[str, int]]`, `get_local_datacenter() -> str`

Wait strategy: `LogMessageWaitStrategy("Startup complete")`

```python
from cassandra.cluster import Cluster, DCAwareRoundRobinPolicy
from testcontainers.cassandra import CassandraContainer

with CassandraContainer("cassandra:4.1.4") as cassandra:
    cluster = Cluster(
        cassandra.get_contact_points(),
        load_balancing_policy=DCAwareRoundRobinPolicy(
            cassandra.get_local_datacenter()
        ),
    )
    session = cluster.connect()
    result = session.execute("SELECT release_version FROM system.local;")
    assert result.one().release_version == "4.1.4"
```

### ClickHouseContainer

```python
from testcontainers.clickhouse import ClickHouseContainer

ClickHouseContainer(
    image: str = "clickhouse/clickhouse-server:latest",
    port: int = 9000,              # native protocol port
    username: Optional[str] = None,  # env CLICKHOUSE_USER, default "test"
    password: Optional[str] = None,  # env CLICKHOUSE_PASSWORD, default "test"
    dbname: Optional[str] = None,    # env CLICKHOUSE_DB, default "test"
    **kwargs,
)
```

Also exposes port 8123 (HTTP). Wait strategy: HTTP check on port 8123 looking for "Ok" response.

Methods: `get_connection_url(host=None) -> str`

```python
import clickhouse_driver
from testcontainers.clickhouse import ClickHouseContainer

with ClickHouseContainer("clickhouse/clickhouse-server:23.8") as ch:
    client = clickhouse_driver.Client.from_url(ch.get_connection_url())
    result = client.execute("SELECT version()")
    print(result)  # [('23.8.x.x',)]
```

---

## 6. DockerImage — Build from Dockerfile

```python
from testcontainers.core.image import DockerImage

DockerImage(
    path: Union[str, PathLike],       # build context directory
    tag: Optional[str] = None,        # e.g. "myapp:test"
    clean_up: bool = True,            # remove image on exit
    dockerfile_path: Union[str, PathLike] = "Dockerfile",
    no_cache: bool = False,
    buildargs: Optional[dict] = None, # --build-arg KEY=VALUE
    docker_client_kw: Optional[dict] = None,
    **kwargs,
)
```

Properties/methods:
- `short_id: str` — truncated image ID (no `sha256:` prefix)
- `build() -> Self`
- `remove(force=True, noprune=False) -> None`
- `get_logs() -> list[dict]`
- `get_wrapped_image()` — underlying docker-py Image object
- `str(image)` → tag if set, else short_id

```python
from testcontainers.core.image import DockerImage
from testcontainers.core.container import DockerContainer
from testcontainers.core.wait_strategies import LogMessageWaitStrategy

# Build image and run container from it
with DockerImage(path="./myapp", tag="myapp:test", no_cache=True) as image:
    with DockerContainer(str(image)).waiting_for(
        LogMessageWaitStrategy("Application started")
    ) as container:
        # container is running with your built image
        host = container.get_container_host_ip()
        port = container.get_exposed_port(8080)

# Build with build args
with DockerImage(
    path="./myapp",
    tag="myapp:test",
    buildargs={"APP_VERSION": "1.2.3", "PYTHON_VERSION": "3.12"},
) as image:
    pass

# Custom Dockerfile location
with DockerImage(
    path="./",
    tag="myapp:test",
    dockerfile_path="docker/Dockerfile.test",
) as image:
    pass
```

---

## 7. Network — Multi-Container Communication

```python
from testcontainers.core.network import Network

Network(
    docker_client_kw: Optional[dict] = None,
    docker_network_kw: Optional[dict] = None,  # passed to docker-py networks.create
)
```

Properties/methods:
- `name: str` — auto-generated UUID name
- `id: Optional[str]` — Docker network ID after creation
- `create() -> Network`
- `remove() -> None`
- `connect(container_id, network_aliases=None) -> None`

```python
from testcontainers.core.network import Network
from testcontainers.core.container import DockerContainer

# Two containers communicating on a shared network
with (
    Network() as network,
    DockerContainer("nginx:alpine")
    .with_name("web")
    .with_network(network)
    .with_network_aliases("web", "web-alias") as web,
    DockerContainer("curlimages/curl:latest")
    .with_network(network)
    .with_command("tail -f /dev/null") as curl,
):
    # curl container can reach web container by name
    status, output = curl.exec("curl -s http://web")
    assert status == 0

# Manual network management (without context manager)
network = Network()
network.create()
print(network.id)   # "abc123..."
network.remove()
```

---

## 8. DockerCompose

```python
from testcontainers.compose import DockerCompose

DockerCompose(
    context: Union[str, PathLike],             # directory containing docker-compose.yml
    compose_file_name: Optional[Union[str, list[str]]] = None,  # override filename(s)
    pull: bool = False,                        # docker compose pull before up
    build: bool = False,                       # docker compose up --build
    wait: bool = True,                         # docker compose up --wait (healthchecks)
    keep_volumes: bool = False,                # don't delete volumes on stop
    env_file: Optional[Union[str, list[str]]] = None,  # --env-file path(s)
    services: Optional[list[str]] = None,     # start only these services
    docker_command_path: Optional[str] = None, # override "docker" binary path
    profiles: Optional[list[str]] = None,     # --profile names
    quiet_pull: bool = False,
    quiet_build: bool = False,
)
```

Key methods:
- `start() -> None`
- `stop(down=True) -> None` — `down=True` runs `docker compose down --volumes`
- `get_containers(include_all=False) -> list[ComposeContainer]`
- `get_container(service_name=None, include_all=False) -> ComposeContainer`
- `get_service_host(service_name, port) -> str`
- `get_service_port(service_name, port) -> int`
- `get_service_host_and_port(service_name, port) -> tuple[str, int]`
- `get_logs(*services) -> tuple[str, str]`
- `exec_in_container(command, service_name=None) -> tuple[str, str, int]`
- `wait_for(url) -> DockerCompose` — polls URL until 2xx
- `waiting_for(strategies: dict[str, WaitStrategy]) -> DockerCompose` — per-service strategies
- `get_config(...) -> dict`

```python
from testcontainers.compose import DockerCompose
from testcontainers.core.wait_strategies import LogMessageWaitStrategy

# Basic usage
with DockerCompose(context="./tests") as compose:
    host, port = compose.get_service_host_and_port("postgres", 5432)
    print(f"Postgres: {host}:{port}")

# Custom compose file
with DockerCompose(
    context="./tests",
    compose_file_name="docker-compose.test.yml",
) as compose:
    pass

# Multiple compose files
with DockerCompose(
    context="./tests",
    compose_file_name=["docker-compose.yml", "docker-compose.override.yml"],
) as compose:
    pass

# Specific services only
with DockerCompose(
    context="./tests",
    services=["postgres", "redis"],
) as compose:
    pg_host, pg_port = compose.get_service_host_and_port("postgres", 5432)

# With wait strategies per service
with DockerCompose(context="./tests").waiting_for({
    "postgres": LogMessageWaitStrategy("database system is ready to accept connections"),
    "redis": LogMessageWaitStrategy("Ready to accept connections"),
}) as compose:
    pass

# With env file
with DockerCompose(context="./tests", env_file=".env.test") as compose:
    pass

# With profiles
with DockerCompose(context="./tests", profiles=["testing"]) as compose:
    container = compose.get_container("myservice")
    print(container.Service, container.State)

# Execute command inside a service container
with DockerCompose(context="./tests") as compose:
    stdout, stderr, exit_code = compose.exec_in_container(
        command=["psql", "-U", "test", "-c", "\\dt"],
        service_name="postgres",
    )

# Wait for HTTP endpoint
with DockerCompose(context="./tests") as compose:
    host, port = compose.get_service_host_and_port("app", 8080)
    compose.wait_for(f"http://{host}:{port}/health")

# Pull images before starting
with DockerCompose(context="./tests", pull=True, build=True) as compose:
    pass
```

`ComposeContainer` fields: `ID`, `Name`, `Command`, `Project`, `Service`, `State`, `Health`, `ExitCode`, `Publishers`

---

## 9. Pytest Fixture Patterns

### Session-scoped container (recommended)

Start once per test session, reuse across all tests in the suite.

```python
# tests/conftest.py
import pytest
import sqlalchemy
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def pg_container():
    """Start PostgreSQL once for the entire test session."""
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg

@pytest.fixture(scope="session")
def db_engine(pg_container):
    """Create SQLAlchemy engine (session-scoped)."""
    engine = sqlalchemy.create_engine(pg_container.get_connection_url())
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()

@pytest.fixture
def db_session(db_engine):
    """Isolated session per test via savepoint rollback."""
    connection = db_engine.connect()
    transaction = connection.begin()
    Session = sqlalchemy.orm.sessionmaker(
        bind=connection, join_transaction_mode="create_savepoint"
    )
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()
```

### Module-scoped container

```python
@pytest.fixture(scope="module")
def pg_container():
    """Start PostgreSQL once per test module."""
    postgres = PostgresContainer("postgres:16-alpine")
    postgres.start()

    def remove_container():
        postgres.stop()

    yield postgres
    postgres.stop()
```

### Function-scoped (fresh container per test — slow, use only when needed)

```python
@pytest.fixture
def pg_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg
```

### module-scoped with autouse + request.addfinalizer

```python
# tests/test_customers.py (standalone pattern from official guide)
import os
import pytest
from testcontainers.postgres import PostgresContainer

postgres = PostgresContainer("postgres:16-alpine")

@pytest.fixture(scope="module", autouse=True)
def setup(request):
    postgres.start()
    request.addfinalizer(postgres.stop)
    os.environ["DB_HOST"] = postgres.get_container_host_ip()
    os.environ["DB_PORT"] = str(postgres.get_exposed_port(5432))
    os.environ["DB_USERNAME"] = postgres.username
    os.environ["DB_PASSWORD"] = postgres.password
    os.environ["DB_NAME"] = postgres.dbname

@pytest.fixture(scope="function", autouse=True)
def clean_db():
    """Clean data between tests."""
    yield
    with sqlalchemy.create_engine(postgres.get_connection_url()).begin() as conn:
        conn.execute(sqlalchemy.text("TRUNCATE TABLE customers CASCADE"))
```

### Multiple containers with shared network

```python
# tests/conftest.py
import pytest
from testcontainers.core.network import Network
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer
from testcontainers.kafka import KafkaContainer

@pytest.fixture(scope="session")
def docker_network():
    with Network() as net:
        yield net

@pytest.fixture(scope="session")
def pg_container(docker_network):
    with PostgresContainer("postgres:16-alpine").with_network(docker_network) as pg:
        yield pg

@pytest.fixture(scope="session")
def redis_container(docker_network):
    with RedisContainer("redis:7-alpine").with_network(docker_network) as redis:
        yield redis

@pytest.fixture(scope="session")
def kafka_container(docker_network):
    with (
        KafkaContainer("confluentinc/cp-kafka:7.6.0")
        .with_kraft()
        .with_network(docker_network)
    ) as kafka:
        yield kafka
```

### FastAPI / Starlette integration

```python
from fastapi.testclient import TestClient
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def pg_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg

@pytest.fixture(scope="session")
def app_client(pg_container):
    from myapp.main import app
    from myapp.db import get_db, engine
    Base.metadata.create_all(engine)
    with TestClient(app) as client:
        yield client
```

---

## 10. SQLAlchemy Integration Patterns

### Standard session fixture (sync)

```python
import pytest
import sqlalchemy
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from testcontainers.postgres import PostgresContainer

class Base(DeclarativeBase):
    pass

@pytest.fixture(scope="session")
def engine(pg_container):
    url = pg_container.get_connection_url()       # postgresql+psycopg2://...
    eng = sqlalchemy.create_engine(url, echo=False)
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()

@pytest.fixture
def db_session(engine):
    """Per-test session with savepoint isolation."""
    conn = engine.connect()
    trans = conn.begin()
    Session = sessionmaker(bind=conn, join_transaction_mode="create_savepoint")
    session = Session()
    yield session
    session.close()
    trans.rollback()
    conn.close()
```

### Async SQLAlchemy (asyncpg)

testcontainers-python does not have a built-in async wait strategy but PostgresContainer uses `ExecWaitStrategy` to wait for readiness, so the container start is always synchronous. Connect with asyncpg after it's up:

```python
import pytest
import pytest_asyncio
import asyncpg
from testcontainers.postgres import PostgresContainer
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

@pytest.fixture(scope="session")
def pg_container():
    """Container started synchronously (testcontainers is sync)."""
    with PostgresContainer("postgres:16-alpine", driver=None) as pg:
        yield pg

@pytest_asyncio.fixture(scope="session")
async def async_engine(pg_container):
    """Async SQLAlchemy engine using asyncpg."""
    # Convert sync URL to async: postgresql:// → postgresql+asyncpg://
    sync_url = pg_container.get_connection_url()
    async_url = sync_url.replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(async_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()

@pytest_asyncio.fixture
async def async_session(async_engine):
    AsyncSessionLocal = sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    async with AsyncSessionLocal() as session:
        yield session
        await session.rollback()

# Test using async session
@pytest.mark.asyncio
async def test_async_db(async_session):
    user = User(name="Alice")
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    assert user.id is not None
```

### Direct asyncpg connection

```python
import asyncpg
import pytest_asyncio
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def pg_container():
    with PostgresContainer("postgres:16-alpine", driver=None) as pg:
        yield pg

@pytest_asyncio.fixture
async def asyncpg_conn(pg_container):
    host = pg_container.get_container_host_ip()
    port = pg_container.get_exposed_port(5432)
    conn = await asyncpg.connect(
        host=host,
        port=port,
        user=pg_container.username,
        password=pg_container.password,
        database=pg_container.dbname,
    )
    yield conn
    await conn.close()
```

---

## 11. Configuration and Environment Variables

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE` | auto-detected | Override Docker socket path |
| `TESTCONTAINERS_RYUK_PRIVILEGED` | `false` | Run Ryuk container in privileged mode |
| `TESTCONTAINERS_RYUK_DISABLED` | `false` | Disable Ryuk cleanup container |
| `RYUK_CONTAINER_IMAGE` | `testcontainers/ryuk:0.8.1` | Custom Ryuk image |
| `RYUK_RECONNECTION_TIMEOUT` | `10s` | Ryuk reconnection timeout |
| `TC_MAX_TRIES` | `120` | Max polling attempts |
| `TC_POOLING_INTERVAL` | `1` | Seconds between polls |
| `TC_HOST` / `TESTCONTAINERS_HOST_OVERRIDE` | auto | Override host IP |
| `TESTCONTAINERS_CONNECTION_MODE` | auto | `bridge_ip`, `gateway_ip`, or `docker_host` |
| `DOCKER_AUTH_CONFIG` | — | JSON for private registry auth |

### `~/.testcontainers.properties` file

```properties
# Persistent settings (read at startup)
tc.host=127.0.0.1
ryuk.disabled=false
ryuk.container.privileged=false
```

### Programmatic configuration

```python
from testcontainers.core.config import testcontainers_config

testcontainers_config.max_tries = 240
testcontainers_config.sleep_time = 0.5
testcontainers_config.ryuk_disabled = True

# Access computed properties
print(testcontainers_config.timeout)    # max_tries * sleep_time (seconds)
print(testcontainers_config.ryuk_image) # "testcontainers/ryuk:0.8.1"
```

### Connection modes

| Mode | `use_mapped_port` | Notes |
|------|-------------------|-------|
| `bridge_ip` | `False` | Connects to container's bridge IP directly |
| `gateway_ip` | `True` | Uses Docker gateway IP with mapped ports |
| `docker_host` | `True` | Uses Docker host IP with mapped ports |

---

## 12. Reuse Mode

Reuse keeps containers alive between test runs to speed up development. The container is identified by its configuration hash.

**Enable reuse:**

```properties
# ~/.testcontainers.properties
testcontainers.reuse.enable=true
```

```python
# In code: set env var before running tests
import os
os.environ["TESTCONTAINERS_REUSE_ENABLE"] = "true"
```

**Important notes:**
- Ryuk is the cleanup mechanism — when Ryuk is disabled, containers persist after the process exits
- To approximate Java's `.withReuse(true)`, disable Ryuk: `TESTCONTAINERS_RYUK_DISABLED=true`
- The Python library does not have a `.with_reuse()` method; reuse is implemented via the Ryuk disable mechanism
- In CI, always keep Ryuk enabled for proper cleanup
- Shared Ryuk: within a single Python process, the Reaper singleton is shared across all container instances

```python
# Development workflow: skip container startup/teardown overhead
# pytest.ini or pyproject.toml
[tool.pytest.ini_options]
# Run with: TESTCONTAINERS_RYUK_DISABLED=true pytest
```

---

## 13. Volume Mounts, Init Scripts, and Files

### Volume mounting

```python
# Read-only volume mount (default)
container.with_volume_mapping("/host/data", "/container/data", mode="ro")

# Read-write volume mount
container.with_volume_mapping("/host/logs", "/container/logs", mode="rw")

# Init SQL scripts via volume (works for postgres, mysql)
from pathlib import Path
script = Path("tests/fixtures/schema.sql")
PostgresContainer("postgres:16-alpine").with_volume_mapping(
    host=str(script),
    container=f"/docker-entrypoint-initdb.d/{script.name}",
)
```

### MySQL seed directory

```python
# MySqlContainer.seed mounts an entire directory
MySqlContainer("mysql:8.0", seed="tests/seeds/")
# Files in tests/seeds/ are tar-archived and PUT to /docker-entrypoint-initdb.d/
```

### create_file — inject files at runtime

```python
import tarfile
import time
from io import BytesIO

def create_file_in_container(container, content: bytes, path: str):
    """Inject a file into a running container."""
    with BytesIO() as archive, tarfile.TarFile(fileobj=archive, mode="w") as tar:
        tarinfo = tarfile.TarInfo(name=path)
        tarinfo.size = len(content)
        tarinfo.mtime = time.time()
        tar.addfile(tarinfo, BytesIO(content))
        archive.seek(0)
        container.get_wrapped_container().put_archive("/", archive)

# KafkaContainer uses this to inject startup scripts
```

### .env file loading

```python
container.with_env_file("/path/to/.env")
# Reads KEY=VALUE pairs via python-dotenv, including variable interpolation
# e.g. ADMIN_EMAIL=admin@${DOMAIN} resolves to admin@example.org
```

---

## 14. CI/CD — GitHub Actions

### Ubuntu runners have Docker pre-installed — testcontainers works out of the box

```yaml
# .github/workflows/tests.yml
name: tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest   # Docker Engine available

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"

      - name: Install dependencies
        run: pip install -r requirements-test.txt

      - name: Run integration tests
        run: pytest -m integration --tb=short -q
        env:
          # Optional: testcontainers will auto-detect Docker socket
          # Ryuk cleanup runs automatically
          TESTCONTAINERS_RYUK_DISABLED: "false"
```

### Docker-in-Docker (DinD) — only needed if runner itself is a container

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    container:
      image: python:3.12-slim
      options: --privileged    # required for DinD

    services:
      docker:
        image: docker:dind
        options: --privileged

    env:
      DOCKER_HOST: tcp://docker:2376
      DOCKER_TLS_VERIFY: "1"
      DOCKER_CERT_PATH: /certs/client

    steps:
      - uses: actions/checkout@v4
      - run: pip install -r requirements-test.txt
      - run: pytest -m integration
```

### Key CI/CD best practices

1. **Use `ubuntu-latest`** — Docker is pre-installed, no extra setup needed
2. **Session-scoped fixtures** — start containers once per CI job, not per test
3. **Ryuk enabled in CI** — ensures orphaned containers are cleaned up even if tests crash
4. **Image caching** — Docker layer caching saves time on repeated runs
5. **Lightweight images** — prefer `postgres:16-alpine` over `postgres:16`
6. **Explicit version pins** — never use `latest` in CI; use `postgres:16.2-alpine`
7. **Disable Ryuk only in development** — `TESTCONTAINERS_RYUK_DISABLED=true` for faster local dev

```yaml
# Cache Docker images between runs
- name: Cache Docker images
  uses: ScribeMD/docker-cache@0.3.7
  with:
    key: docker-${{ hashFiles('requirements-test.txt') }}
```

---

## 15. Common Pitfalls and Troubleshooting

### Container not starting / timeout

```python
# Increase startup timeout
container.waiting_for(
    LogMessageWaitStrategy("ready").with_startup_timeout(300)  # 5 minutes
)

# Or globally
from testcontainers.core.config import testcontainers_config
testcontainers_config.max_tries = 300
testcontainers_config.sleep_time = 1.0
```

### "Cannot connect to Docker daemon"

```bash
# Check Docker is running
docker info

# Set socket path explicitly
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock

# Or in code
container = DockerContainer("postgres:16", docker_client_kw={"base_url": "unix://var/run/docker.sock"})
```

### Port conflicts — never hardcode ports

```python
# Wrong
engine = sqlalchemy.create_engine("postgresql://test:test@localhost:5432/test")

# Correct — use dynamic mapped port
host = container.get_container_host_ip()
port = container.get_exposed_port(5432)
engine = sqlalchemy.create_engine(f"postgresql://test:test@{host}:{port}/test")

# Even better — use get_connection_url()
engine = sqlalchemy.create_engine(container.get_connection_url())
```

### Slow tests — containers starting per test

```python
# Wrong: function-scoped container = start/stop per test
@pytest.fixture
def db(self):
    with PostgresContainer() as pg:
        yield pg

# Correct: session-scoped container + per-test isolation via savepoints
@pytest.fixture(scope="session")
def pg():
    with PostgresContainer() as pg:
        yield pg
```

### Special characters in passwords

```python
# urllib.parse.quote is applied automatically by get_connection_url()
with PostgresContainer("postgres:16", password="p@$%25+0&%rd :/!=?") as pg:
    url = pg.get_connection_url()  # password is properly URL-encoded
    engine = sqlalchemy.create_engine(url)
```

### Ryuk causing "connection reset" errors in CI

```bash
# If Ryuk needs privileged mode (rootless Docker environments)
export TESTCONTAINERS_RYUK_PRIVILEGED=true

# Or disable Ryuk entirely (clean up manually)
export TESTCONTAINERS_RYUK_DISABLED=true
```

### Elasticsearch needs memory limit

```python
# ES will OOM without memory limit
with ElasticSearchContainer("elasticsearch:8.12.2", mem_limit="3G") as es:
    pass
```

### Kafka on custom network: limit_broker_to_first_host

```python
# When using Kafka with a Docker network, must set this flag
from testcontainers.kafka import kafka_config
kafka_config.limit_broker_to_first_host = True
# Or via env: TC_KAFKA_LIMIT_BROKER_TO_FIRST_HOST=true
```

### MySQL wait_strategy detects double "ready for connections"

MySQL logs "ready for connections" twice during startup. The default `wait_strategy_check_string` expects both occurrences:

```python
MySqlContainer(
    "mysql:8.0",
    wait_strategy_check_string=r".*: ready for connections.*: ready for connections.*",
)
# For MariaDB you may need a different pattern
```

### Container exits unexpectedly

```python
from testcontainers.core.waiting_utils import wait_for_logs

# raise_on_exit=True will throw RuntimeError if container exits before log appears
wait_for_logs(container, "ready", raise_on_exit=True)
```

### Checking container status

```python
container.reload()
print(container.status)        # "running", "exited", "created", ...
stdout, stderr = container.get_logs()
print(stdout.decode())
print(stderr.decode())
```

---

## 16. Advanced Patterns

### GenericContainer with custom wait strategy

```python
from testcontainers.core.container import DockerContainer
from testcontainers.core.wait_strategies import HttpWaitStrategy, CompositeWaitStrategy, PortWaitStrategy

# Custom app container
container = (
    DockerContainer("myapp:latest")
    .with_exposed_ports(8080, 9090)
    .with_env("DATABASE_URL", "postgresql://test:test@db:5432/test")
    .with_env("REDIS_URL", "redis://cache:6379/0")
    .with_network(my_network)
    .with_network_aliases("app")
    .waiting_for(
        CompositeWaitStrategy(
            PortWaitStrategy(8080),
            HttpWaitStrategy(8080, "/health").for_status_code(200),
        ).with_startup_timeout(120)
    )
)
with container as app:
    host = app.get_container_host_ip()
    port = app.get_exposed_port(8080)
```

### WaitStrategy on DockerCompose per service

```python
from testcontainers.compose import DockerCompose
from testcontainers.core.wait_strategies import LogMessageWaitStrategy, HttpWaitStrategy

compose = DockerCompose(context="./tests", wait=False)  # don't use --wait flag
compose.waiting_for({
    "db": LogMessageWaitStrategy("database system is ready to accept connections"),
    "api": HttpWaitStrategy(8080, "/health").for_status_code(200),
    "worker": LogMessageWaitStrategy("Worker started"),
})
with compose:
    pass
```

### Injecting container details into application under test

```python
@pytest.fixture(scope="session")
def pg_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg

@pytest.fixture(scope="session", autouse=True)
def configure_app(pg_container, monkeypatch):
    """Override app config with container URLs."""
    monkeypatch.setenv("DATABASE_URL", pg_container.get_connection_url())
    monkeypatch.setenv("DB_HOST", pg_container.get_container_host_ip())
    monkeypatch.setenv("DB_PORT", str(pg_container.get_exposed_port(5432)))
```

### PostgreSQL + Alembic migrations in fixtures

```python
@pytest.fixture(scope="session")
def engine(pg_container):
    from alembic import command
    from alembic.config import Config

    url = pg_container.get_connection_url()
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")

    eng = sqlalchemy.create_engine(url)
    yield eng
    eng.dispose()
```

### Using with pytest-docker-compose

For teams preferring `docker-compose.yml` files:

```python
# conftest.py
import pytest
from testcontainers.compose import DockerCompose

@pytest.fixture(scope="session")
def compose():
    with DockerCompose(
        context=".",
        compose_file_name="docker-compose.test.yml",
        pull=True,
    ) as c:
        yield c

def test_api(compose):
    host, port = compose.get_service_host_and_port("api", 8080)
    import requests
    resp = requests.get(f"http://{host}:{port}/health")
    assert resp.status_code == 200
```

---

## 17. Package and Dependency Reference

```
testcontainers[postgres]    → pip install "psycopg2-binary" or "psycopg[binary]" separately
testcontainers[mysql]       → pymysql included; also needs sqlalchemy
testcontainers[mongodb]     → pymongo included
testcontainers[redis]       → redis-py included
testcontainers[kafka]       → install kafka-python or confluent-kafka separately
testcontainers[rabbitmq]    → pika included
testcontainers[minio]       → minio-py included
testcontainers[localstack]  → boto3 included
testcontainers[elasticsearch] → install elasticsearch-py separately
testcontainers[cassandra]   → install cassandra-driver separately
testcontainers[clickhouse]  → clickhouse-driver included
```

Core runtime dependencies: `docker`, `urllib3`, `wrapt`, `typing-extensions`, `python-dotenv`

Source repository: https://github.com/testcontainers/testcontainers-python
Documentation: https://testcontainers-python.readthedocs.io/en/latest/
PyPI: https://pypi.org/project/testcontainers/
Official getting-started guide: https://testcontainers.com/guides/getting-started-with-testcontainers-for-python/
