# MongoDB Indexes Quick Reference

> **Knowledge Base:** Read `knowledge/mongodb/indexes.md` for complete documentation.

## Create Indexes

```javascript
// Single field index
db.users.createIndex({ email: 1 });           // Ascending
db.users.createIndex({ createdAt: -1 });      // Descending

// Compound index
db.orders.createIndex({ userId: 1, createdAt: -1 });

// Unique index
db.users.createIndex({ email: 1 }, { unique: true });

// Sparse index (skip nulls)
db.users.createIndex({ phone: 1 }, { sparse: true });

// TTL index (auto-delete)
db.sessions.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 3600 }  // 1 hour
);
```

## Special Index Types

```javascript
// Text index (full-text search)
db.articles.createIndex({ title: "text", body: "text" });
db.articles.find({ $text: { $search: "mongodb tutorial" } });

// Geospatial index
db.places.createIndex({ location: "2dsphere" });
db.places.find({
  location: {
    $near: {
      $geometry: { type: "Point", coordinates: [-73.9, 40.7] },
      $maxDistance: 1000  // meters
    }
  }
});

// Hashed index (for sharding)
db.users.createIndex({ _id: "hashed" });
```

## Index Management

```javascript
// List indexes
db.users.getIndexes();

// Drop index
db.users.dropIndex("email_1");
db.users.dropIndex({ email: 1 });

// Drop all indexes (except _id)
db.users.dropIndexes();

// Reindex collection
db.users.reIndex();
```

## Query Analysis

```javascript
// Explain query plan
db.users.find({ email: "test@example.com" }).explain("executionStats");

// Key metrics to check:
// - winningPlan.stage: IXSCAN (good) vs COLLSCAN (bad)
// - executionStats.totalDocsExamined
// - executionStats.totalKeysExamined
```

## Index Best Practices

```javascript
// Covered queries (index-only)
db.users.createIndex({ email: 1, name: 1 });
db.users.find(
  { email: "test@example.com" },
  { name: 1, _id: 0 }  // Only indexed fields
);

// ESR Rule for compound indexes:
// Equality → Sort → Range
db.orders.createIndex({
  status: 1,      // Equality first
  createdAt: -1,  // Sort second
  amount: 1       // Range last
});

// Partial index (filtered)
db.orders.createIndex(
  { createdAt: 1 },
  { partialFilterExpression: { status: "active" } }
);
```

**Official docs:** https://www.mongodb.com/docs/manual/indexes/
