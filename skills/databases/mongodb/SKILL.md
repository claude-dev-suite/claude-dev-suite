---
name: mongodb
description: |
  MongoDB document database. Covers CRUD operations, aggregations,
  and indexes. Use when working with MongoDB.

  USE WHEN: user mentions "mongodb", "mongo", "document database", asks about "aggregation pipeline",
  "embedded documents", "BSON", "replica sets", "sharding", "atlas"

  DO NOT USE FOR: SQL databases - use `postgresql`/`mysql` instead, Redis - use `redis` instead,
  Elasticsearch - use `elasticsearch` instead, Relational data - use SQL skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# MongoDB Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `mongodb` for comprehensive documentation.

## CRUD Operations

```javascript
// Create
db.users.insertOne({
  name: "John",
  email: "john@example.com",
  createdAt: new Date()
});

// Read
db.users.find({ isActive: true })
  .sort({ createdAt: -1 })
  .limit(20);

db.users.findOne({ _id: ObjectId("...") });

// Update
db.users.updateOne(
  { _id: ObjectId("...") },
  { $set: { name: "Jane" } }
);

// Delete
db.users.deleteOne({ _id: ObjectId("...") });
```

## Query Operators

```javascript
// Comparison
{ age: { $gt: 18, $lt: 65 } }
{ status: { $in: ["active", "pending"] } }

// Logical
{ $and: [{ age: { $gt: 18 } }, { isActive: true }] }
{ $or: [{ status: "admin" }, { role: "moderator" }] }

// Array
{ tags: { $all: ["tech", "news"] } }
{ "scores.0": { $gt: 90 } }
```

## Aggregation Pipeline

```javascript
db.orders.aggregate([
  { $match: { status: "completed" } },
  { $group: {
      _id: "$userId",
      totalSpent: { $sum: "$amount" },
      orderCount: { $count: {} }
  }},
  { $sort: { totalSpent: -1 } },
  { $limit: 10 }
]);
```

## Indexes

```javascript
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ createdAt: -1 });
db.users.createIndex({ name: "text" }); // Text search
```

## Production Readiness

### Security Configuration

```javascript
// Enable authentication (mongod.conf)
// security:
//   authorization: enabled

// Create admin user
use admin
db.createUser({
  user: "admin",
  pwd: "secure_password",
  roles: ["root"]
});

// Create application user with limited privileges
use mydb
db.createUser({
  user: "app_user",
  pwd: "app_password",
  roles: [
    { role: "readWrite", db: "mydb" }
  ]
});

// Create read-only user for reporting
db.createUser({
  user: "reporter",
  pwd: "reporter_password",
  roles: [{ role: "read", db: "mydb" }]
});
```

```yaml
# mongod.conf - Security settings
security:
  authorization: enabled

net:
  ssl:
    mode: requireSSL
    PEMKeyFile: /path/to/mongodb.pem
    CAFile: /path/to/ca.pem
```

### Connection with SSL

```javascript
// Node.js connection with SSL
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://host:27017', {
  ssl: true,
  sslCA: fs.readFileSync('/path/to/ca.pem'),
  sslCert: fs.readFileSync('/path/to/client.pem'),
  sslKey: fs.readFileSync('/path/to/client.key'),
  authSource: 'admin',
});
```

### Replica Set (High Availability)

```javascript
// Initialize replica set
rs.initiate({
  _id: "myReplicaSet",
  members: [
    { _id: 0, host: "mongo1:27017", priority: 2 },
    { _id: 1, host: "mongo2:27017", priority: 1 },
    { _id: 2, host: "mongo3:27017", priority: 1 }
  ]
});

// Connection string for replica set
mongodb://mongo1:27017,mongo2:27017,mongo3:27017/mydb?replicaSet=myReplicaSet&readPreference=secondaryPreferred
```

### Backup & Recovery

```bash
# mongodump backup
mongodump --uri="mongodb://user:pass@host:27017/mydb" \
  --out=/backup/$(date +%Y%m%d) \
  --gzip

# mongorestore
mongorestore --uri="mongodb://user:pass@host:27017/mydb" \
  --gzip /backup/20240115

# Continuous backup with oplog
mongodump --oplog --out=/backup/full

# Point-in-time recovery
mongorestore --oplogReplay --oplogLimit=1705315200 /backup/full
```

### Performance Tuning

```javascript
// Index best practices
db.collection.createIndex({ field: 1 }, { background: true });

// Compound indexes for common queries
db.orders.createIndex({ userId: 1, createdAt: -1 });

// TTL index for automatic expiration
db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 });

// Partial indexes for filtered queries
db.orders.createIndex(
  { status: 1 },
  { partialFilterExpression: { status: { $in: ["pending", "processing"] } } }
);

// Analyze query performance
db.orders.find({ userId: "123" }).explain("executionStats");
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Connection count | > 80% max |
| Replication lag | > 10 seconds |
| Query targeting | > 1000 docs examined/returned |
| Cache hit ratio | < 95% |
| Oplog window | < 24 hours |
| Disk usage | > 80% |

### Monitoring Commands

```javascript
// Server status
db.serverStatus();

// Current operations
db.currentOp({ "active": true, "secs_running": { "$gt": 5 } });

// Replication status
rs.status();

// Index usage stats
db.collection.aggregate([{ $indexStats: {} }]);

// Collection stats
db.collection.stats();

// Database profiler (slow queries)
db.setProfilingLevel(1, { slowms: 100 });
db.system.profile.find().sort({ ts: -1 }).limit(10);
```

### Read/Write Concerns

```javascript
// Write concern for durability
db.orders.insertOne(order, {
  writeConcern: { w: "majority", j: true, wtimeout: 5000 }
});

// Read concern for consistency
db.orders.find({ userId: "123" }).readConcern("majority");

// Read preference for scaling reads
db.orders.find().readPref("secondaryPreferred");
```

### Sharding (Horizontal Scaling)

```javascript
// Enable sharding on database
sh.enableSharding("mydb");

// Shard collection with hashed key
sh.shardCollection("mydb.orders", { _id: "hashed" });

// Shard collection with range key
sh.shardCollection("mydb.logs", { timestamp: 1 });

// Check sharding status
sh.status();
```

### Checklist

- [ ] Authentication enabled
- [ ] TLS/SSL encryption enabled
- [ ] Least-privilege user accounts
- [ ] Replica set configured (3+ nodes)
- [ ] Regular mongodump backups
- [ ] Oplog size adequate for recovery window
- [ ] Indexes on query fields
- [ ] Query profiler enabled (slow queries)
- [ ] Write concern: majority + journal
- [ ] Connection pooling configured
- [ ] Monitoring alerts configured
- [ ] Sharding (if > 100GB or high throughput)

## When NOT to Use This Skill

- **Relational data with complex joins** - Use `postgresql` or `mysql` for relational databases
- **Transactions across multiple tables** - Use SQL databases with ACID guarantees
- **Full-text search** - Use `elasticsearch` for advanced search features
- **Caching** - Use `redis` for in-memory caching
- **Graph relationships** - Consider Neo4j or graph databases

## Anti-Patterns

| Anti-Pattern | Issue | Solution |
|--------------|-------|----------|
| Unbounded array growth | Document size limit (16MB), performance degradation | Use separate collection or capped arrays |
| Missing indexes on queries | Collection scans, slow performance | Create indexes on query fields |
| Using `$lookup` excessively | Poor performance, not optimized for joins | Denormalize data or redesign schema |
| Storing large binary data | Exceeds 16MB limit, slow queries | Use GridFS for files > 16MB |
| Not using projection | Transfers unnecessary data | Specify needed fields in projection |
| Ignoring write concern | Data loss risk | Use `majority` write concern for important data |
| Not using read preference | Overloading primary | Use secondary reads for analytics |
| Massive embedded documents | Hard to query, update complexity | Split into separate collections |
| Not handling connection pooling | Connection exhaustion | Configure proper pool size |
| Using `count()` on large collections | Slow, scans collection | Use `countDocuments()` or `estimatedDocumentCount()` |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Slow queries | `db.collection.explain("executionStats")` | Add indexes, check query pattern |
| High memory usage | `db.serverStatus().mem` | Increase RAM, optimize indexes |
| Connection pool exhausted | Check connection count | Increase pool size, fix connection leaks |
| Replication lag | `rs.status()` and check `optimeDate` | Increase resources, tune oplog size |
| Disk space full | `db.stats()` | Compact collections, increase storage |
| Index not being used | `explain()` shows COLLSCAN | Verify index exists, check query shape |
| Write conflicts | Check error logs for writeConflict | Retry logic, reduce concurrent updates |
| Document too large | Error: "document is larger than 16MB" | Use GridFS or split document |

## Reference Documentation
- [Aggregation](quick-ref/aggregation.md)
- [Indexes](quick-ref/indexes.md)
