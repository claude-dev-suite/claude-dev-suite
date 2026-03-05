# Aggregate Snapshots

## Overview

An event-sourced aggregate is rebuilt by replaying every event from its stream. For aggregates with hundreds or thousands of events, this replay becomes a performance bottleneck. Snapshots solve this by periodically persisting the aggregate's full state at a known event version. On subsequent loads, the system restores from the latest snapshot and replays only the events that occurred after it.

Snapshots are a **performance optimization**, not a correctness mechanism. The event stream remains the source of truth. Snapshots can be deleted, rebuilt, or ignored without data loss.

---

## When to Use Snapshots

### Performance Thresholds

Measure before optimizing. Snapshots add complexity, so only introduce them when replay cost is measurable.

| Stream Length | Typical Replay Time | Snapshot Recommended? |
|---|---|---|
| < 100 events | < 10ms | No |
| 100 - 500 events | 10 - 50ms | Unlikely, unless hot path |
| 500 - 2,000 events | 50 - 200ms | Consider it |
| > 2,000 events | > 200ms | Yes |

These numbers depend on event complexity, deserialization cost, and aggregate logic. Profile your specific aggregates.

### Good Candidates for Snapshots

- **Long-lived aggregates** -- bank accounts, user profiles, inventory items that accumulate events over months or years.
- **Frequently loaded aggregates** -- aggregates that are read on every API request in a hot path.
- **Complex replay logic** -- aggregates where each event apply method triggers expensive computation.

### Poor Candidates

- **Short-lived aggregates** -- orders that go through 5-10 states and then are archived.
- **Write-heavy, read-rare aggregates** -- batch processing pipelines where aggregates are loaded once and discarded.

---

## Snapshot Strategies

### Every N Events

The simplest strategy. After appending events, check if the new version crosses a threshold.

```typescript
const SNAPSHOT_INTERVAL = 100;

async function saveAggregateWithSnapshot(
  aggregate: EventSourcedAggregate,
  eventStore: EventStore,
  snapshotStore: SnapshotStore,
): Promise<void> {
  // Persist events
  await eventStore.append(
    aggregate.id,
    aggregate.loadedVersion,
    aggregate.uncommittedEvents,
  );

  // Check if snapshot is needed
  const newVersion = aggregate.loadedVersion + aggregate.uncommittedEvents.length;
  const lastSnapshotVersion = aggregate.snapshotVersion ?? 0;

  if (newVersion - lastSnapshotVersion >= SNAPSHOT_INTERVAL) {
    await snapshotStore.save({
      aggregateId: aggregate.id,
      aggregateType: aggregate.type,
      version: newVersion,
      state: aggregate.toSnapshot(),
      createdAt: new Date().toISOString(),
    });
  }
}
```

### Time-Based

Take a snapshot if more than N minutes have passed since the last one. Useful when event frequency varies wildly between aggregates.

```java
@Service
public class TimeBasedSnapshotPolicy implements SnapshotPolicy {

    private final Duration snapshotInterval = Duration.ofMinutes(30);
    private final SnapshotStore snapshotStore;

    @Override
    public boolean shouldSnapshot(AggregateRoot aggregate) {
        var lastSnapshot = snapshotStore.findLatest(aggregate.getId());
        if (lastSnapshot.isEmpty()) {
            return aggregate.getVersion() > 50; // minimum events before first snapshot
        }
        var elapsed = Duration.between(lastSnapshot.get().createdAt(), Instant.now());
        return elapsed.compareTo(snapshotInterval) > 0;
    }
}
```

### Hybrid (N Events + Time)

Combine both: snapshot every N events OR if T time has passed since the last snapshot, whichever comes first. This handles both high-frequency and low-frequency aggregates gracefully.

---

## Snapshot Storage

### Schema

```sql
CREATE TABLE snapshots (
    aggregate_id    UUID NOT NULL,
    aggregate_type  VARCHAR(255) NOT NULL,
    version         BIGINT NOT NULL,
    state           JSONB NOT NULL,
    schema_version  INT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (aggregate_id, version)
);

-- Only the latest snapshot per aggregate is typically needed
CREATE INDEX idx_snapshots_latest ON snapshots (aggregate_id, version DESC);
```

### TypeScript Snapshot Store

```typescript
export interface Snapshot {
  aggregateId: string;
  aggregateType: string;
  version: number;
  state: Record<string, unknown>;
  schemaVersion: number;
  createdAt: string;
}

export class PostgresSnapshotStore {
  constructor(private pool: Pool) {}

  async save(snapshot: Snapshot): Promise<void> {
    await this.pool.query(
      `INSERT INTO snapshots
         (aggregate_id, aggregate_type, version, state, schema_version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (aggregate_id, version) DO NOTHING`,
      [
        snapshot.aggregateId,
        snapshot.aggregateType,
        snapshot.version,
        JSON.stringify(snapshot.state),
        snapshot.schemaVersion,
        snapshot.createdAt,
      ]
    );
  }

  async findLatest(aggregateId: string): Promise<Snapshot | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM snapshots
       WHERE aggregate_id = $1
       ORDER BY version DESC
       LIMIT 1`,
      [aggregateId]
    );
    return rows.length > 0 ? this.toSnapshot(rows[0]) : null;
  }

  async deleteAll(aggregateId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM snapshots WHERE aggregate_id = $1',
      [aggregateId]
    );
  }

  private toSnapshot(row: any): Snapshot {
    return {
      aggregateId: row.aggregate_id,
      aggregateType: row.aggregate_type,
      version: row.version,
      state: row.state,
      schemaVersion: row.schema_version,
      createdAt: row.created_at.toISOString(),
    };
  }
}
```

### Java Snapshot Store

```java
@Repository
public class PostgresSnapshotStore implements SnapshotStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    @Override
    public void save(Snapshot snapshot) {
        jdbc.update("""
            INSERT INTO snapshots
                (aggregate_id, aggregate_type, version, state, schema_version, created_at)
            VALUES (?, ?, ?, ?::jsonb, ?, ?)
            ON CONFLICT (aggregate_id, version) DO NOTHING
            """,
            snapshot.aggregateId(),
            snapshot.aggregateType(),
            snapshot.version(),
            serializeState(snapshot.state()),
            snapshot.schemaVersion(),
            snapshot.createdAt()
        );
    }

    @Override
    public Optional<Snapshot> findLatest(UUID aggregateId) {
        var results = jdbc.query("""
            SELECT * FROM snapshots
            WHERE aggregate_id = ?
            ORDER BY version DESC
            LIMIT 1
            """,
            this::mapRow, aggregateId
        );
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }
}
```

---

## Snapshot + Events Replay

The core loading pattern: restore from the latest snapshot, then replay only events after the snapshot version.

### TypeScript Aggregate Loading

```typescript
export class SnapshotAwareRepository<T extends EventSourcedAggregate> {
  constructor(
    private eventStore: EventStore,
    private snapshotStore: PostgresSnapshotStore,
    private factory: AggregateFactory<T>,
  ) {}

  async load(aggregateId: string): Promise<T> {
    // 1. Try to load latest snapshot
    const snapshot = await this.snapshotStore.findLatest(aggregateId);

    let aggregate: T;
    let fromVersion: number;

    if (snapshot) {
      // 2a. Restore aggregate from snapshot
      aggregate = this.factory.fromSnapshot(snapshot);
      fromVersion = snapshot.version;
    } else {
      // 2b. Create empty aggregate
      aggregate = this.factory.createEmpty(aggregateId);
      fromVersion = 0;
    }

    // 3. Load and replay only events after the snapshot version
    const events = await this.eventStore.loadStreamFrom(aggregateId, fromVersion);

    for (const event of events) {
      aggregate.applyEvent(event);
    }

    return aggregate;
  }

  async save(aggregate: T): Promise<void> {
    const uncommitted = aggregate.uncommittedEvents;
    if (uncommitted.length === 0) return;

    await this.eventStore.append(
      aggregate.id,
      aggregate.loadedVersion,
      uncommitted,
    );

    // Check snapshot policy
    const newVersion = aggregate.loadedVersion + uncommitted.length;
    if (this.shouldSnapshot(aggregate, newVersion)) {
      await this.snapshotStore.save({
        aggregateId: aggregate.id,
        aggregateType: aggregate.type,
        version: newVersion,
        state: aggregate.toSnapshot(),
        schemaVersion: aggregate.snapshotSchemaVersion,
        createdAt: new Date().toISOString(),
      });
    }
  }

  private shouldSnapshot(aggregate: T, newVersion: number): boolean {
    const lastSnapshotVersion = aggregate.snapshotVersion ?? 0;
    return newVersion - lastSnapshotVersion >= 100;
  }
}
```

### Java Aggregate Loading

```java
@Service
public class SnapshotAwareAggregateRepository<T extends AggregateRoot> {

    private final EventStore eventStore;
    private final SnapshotStore snapshotStore;
    private final AggregateFactory<T> factory;
    private final SnapshotPolicy snapshotPolicy;

    public T load(UUID aggregateId) {
        // 1. Try snapshot
        Optional<Snapshot> snapshot = snapshotStore.findLatest(aggregateId);

        T aggregate;
        long fromVersion;

        if (snapshot.isPresent()) {
            aggregate = factory.fromSnapshot(snapshot.get());
            fromVersion = snapshot.get().version();
        } else {
            aggregate = factory.createEmpty(aggregateId);
            fromVersion = 0;
        }

        // 2. Replay events after snapshot
        List<StoredEvent> events = eventStore.loadStreamFrom(aggregateId, fromVersion);
        for (var event : events) {
            aggregate.applyEvent(event);
        }

        return aggregate;
    }

    @Transactional
    public void save(T aggregate) {
        List<StoredEvent> uncommitted = aggregate.getUncommittedEvents();
        if (uncommitted.isEmpty()) return;

        eventStore.append(aggregate.getId(), aggregate.getLoadedVersion(), uncommitted);

        if (snapshotPolicy.shouldSnapshot(aggregate)) {
            snapshotStore.save(new Snapshot(
                aggregate.getId(),
                aggregate.getType(),
                aggregate.getVersion(),
                aggregate.toSnapshotState(),
                aggregate.getSnapshotSchemaVersion(),
                Instant.now()
            ));
        }
    }
}
```

---

## Versioning Snapshots When Aggregates Evolve

Aggregates change over time: new fields are added, old fields are restructured, internal representations shift. Snapshots serialized under an old schema must still be loadable.

### Schema Version Strategy

Every snapshot carries a `schemaVersion`. When loading a snapshot, the aggregate factory checks the version and applies migrations.

```typescript
interface SnapshotMigration {
  fromVersion: number;
  toVersion: number;
  migrate(state: Record<string, unknown>): Record<string, unknown>;
}

const orderSnapshotMigrations: SnapshotMigration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    migrate(state) {
      // v1 -> v2: items was an array of {id, qty}, now includes unitPrice
      return {
        ...state,
        items: (state.items as any[]).map(item => ({
          ...item,
          unitPrice: item.unitPrice ?? 0, // backfill with zero
        })),
      };
    },
  },
  {
    fromVersion: 2,
    toVersion: 3,
    migrate(state) {
      // v2 -> v3: flat shippingAddress string becomes structured object
      const address = state.shippingAddress as string;
      return {
        ...state,
        shippingAddress: {
          line1: address,
          city: '',
          postalCode: '',
          country: 'US',
        },
      };
    },
  },
];

function migrateSnapshot(
  state: Record<string, unknown>,
  fromVersion: number,
  currentVersion: number,
  migrations: SnapshotMigration[],
): Record<string, unknown> {
  let migrated = { ...state };
  let version = fromVersion;

  while (version < currentVersion) {
    const migration = migrations.find(m => m.fromVersion === version);
    if (!migration) {
      throw new Error(`No migration path from snapshot version ${version}`);
    }
    migrated = migration.migrate(migrated);
    version = migration.toVersion;
  }

  return migrated;
}
```

### Java Snapshot Migration

```java
public interface SnapshotMigration {
    int fromVersion();
    int toVersion();
    JsonNode migrate(JsonNode state);
}

@Component
public class OrderSnapshotMigrationChain {

    private final List<SnapshotMigration> migrations;

    public OrderSnapshotMigrationChain() {
        this.migrations = List.of(
            new SnapshotMigration() {
                public int fromVersion() { return 1; }
                public int toVersion() { return 2; }
                public JsonNode migrate(JsonNode state) {
                    var node = (ObjectNode) state;
                    var items = (ArrayNode) node.get("items");
                    for (var item : items) {
                        if (!item.has("unitPrice")) {
                            ((ObjectNode) item).put("unitPrice", 0);
                        }
                    }
                    return node;
                }
            }
        );
    }

    public JsonNode migrateToLatest(JsonNode state, int fromVersion, int currentVersion) {
        var current = state;
        var version = fromVersion;

        while (version < currentVersion) {
            int v = version;
            var migration = migrations.stream()
                .filter(m -> m.fromVersion() == v)
                .findFirst()
                .orElseThrow(() ->
                    new IllegalStateException("No migration from version " + v));
            current = migration.migrate(current);
            version = migration.toVersion();
        }

        return current;
    }
}
```

### When to Invalidate Snapshots

Sometimes it is simpler to delete all snapshots and let the system rebuild them on next load rather than write a complex migration.

```typescript
// After deploying a breaking aggregate change:
async function invalidateAllSnapshots(
  snapshotStore: PostgresSnapshotStore,
  aggregateType: string,
): Promise<void> {
  await snapshotStore.pool.query(
    'DELETE FROM snapshots WHERE aggregate_type = $1',
    [aggregateType]
  );
  console.log(`All ${aggregateType} snapshots invalidated. Will rebuild on next load.`);
}
```

This is safe because the event stream is the source of truth. The first load after invalidation will be slower (full replay), but subsequent loads will create fresh snapshots.

---

## Anti-Patterns

1. **Treating snapshots as the source of truth** -- If you cannot delete all snapshots and still recover full state from events, your architecture is broken. Snapshots are a cache.
2. **Snapshotting too eagerly** -- Snapshotting after every event wastes storage and I/O. Measure replay cost first. Start without snapshots and add them only for aggregates that demonstrate a need.
3. **No snapshot schema versioning** -- Deploying a new aggregate field without versioning the snapshot schema causes deserialization failures on old snapshots.
4. **Storing snapshots in the event stream** -- Some designs append a "snapshot event" to the aggregate stream. This conflates the event log (source of truth) with an optimization artifact and complicates stream reading.
5. **Unbounded snapshot retention** -- Keeping every snapshot version for every aggregate wastes storage. Retain only the latest 1-2 snapshots per aggregate and garbage-collect the rest.
6. **Skipping events after snapshot** -- A bug where the system restores from a snapshot but forgets to replay subsequent events, resulting in stale state. Always load snapshot then replay remaining events.

---

## Production Checklist

- [ ] Snapshots are only taken for aggregates that exceed the measured replay cost threshold.
- [ ] The loading path always replays events after the snapshot version (never returns snapshot state alone).
- [ ] Snapshot schema version is stored and checked on every load.
- [ ] Migration functions exist for every schema version transition.
- [ ] A snapshot invalidation mechanism exists for breaking aggregate changes.
- [ ] Old snapshots are garbage-collected (retain only the latest per aggregate).
- [ ] Snapshot creation is asynchronous or non-blocking on the command path when possible.
- [ ] Monitoring tracks snapshot hit rate, miss rate (full replays), and average replay length.
- [ ] Load testing compares aggregate load times with and without snapshots.
- [ ] Snapshots can be deleted in bulk for a given aggregate type without affecting correctness.
