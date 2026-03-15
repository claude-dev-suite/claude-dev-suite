# Redis Commands Quick Reference

> **Knowledge Base:** Read `knowledge/redis/commands.md` for complete documentation.

## Strings

```bash
# Set/Get
SET key "value"
GET key
SETNX key "value"        # Set if not exists
SETEX key 3600 "value"   # Set with TTL (seconds)
MSET k1 "v1" k2 "v2"     # Multiple set
MGET k1 k2               # Multiple get

# Counters
INCR counter             # +1
INCRBY counter 10        # +10
DECR counter             # -1
INCRBYFLOAT price 0.5    # Float increment

# String operations
APPEND key "suffix"
STRLEN key
GETRANGE key 0 5         # Substring
```

## Lists

```bash
# Push/Pop
LPUSH list "a" "b"       # Left push: [b, a]
RPUSH list "c"           # Right push: [b, a, c]
LPOP list                # Pop from left
RPOP list                # Pop from right
LLEN list                # Length

# Access
LRANGE list 0 -1         # All elements
LINDEX list 0            # Element at index
LSET list 0 "new"        # Set at index

# Blocking operations
BLPOP list 30            # Block until element or timeout
BRPOP list 30
```

## Sets

```bash
# Add/Remove
SADD tags "redis" "db"
SREM tags "db"
SPOP tags                # Random remove

# Query
SMEMBERS tags            # All members
SISMEMBER tags "redis"   # Check membership
SCARD tags               # Count

# Set operations
SUNION set1 set2         # Union
SINTER set1 set2         # Intersection
SDIFF set1 set2          # Difference
```

## Sorted Sets (ZSets)

```bash
# Add with scores
ZADD leaderboard 100 "player1" 200 "player2"

# Query
ZRANGE leaderboard 0 -1 WITHSCORES   # By rank (asc)
ZREVRANGE leaderboard 0 9            # Top 10 (desc)
ZRANGEBYSCORE leaderboard 100 200    # By score range
ZSCORE leaderboard "player1"         # Get score
ZRANK leaderboard "player1"          # Get rank

# Update
ZINCRBY leaderboard 50 "player1"     # Increment score

# Count
ZCARD leaderboard                    # Total count
ZCOUNT leaderboard 100 200           # Count in range
```

## Hashes

```bash
# Set/Get
HSET user:1 name "John" age "30"
HGET user:1 name
HMGET user:1 name age
HGETALL user:1

# Update
HINCRBY user:1 age 1
HDEL user:1 temp_field

# Query
HEXISTS user:1 name
HKEYS user:1
HVALS user:1
HLEN user:1
```

## Keys & TTL

```bash
# Key operations
KEYS user:*              # Find keys (slow!)
SCAN 0 MATCH user:* COUNT 100  # Iterate (production)
EXISTS key
DEL key
RENAME key newkey
TYPE key

# Expiration
EXPIRE key 3600          # Set TTL (seconds)
PEXPIRE key 3600000      # TTL in milliseconds
TTL key                  # Check remaining TTL
PERSIST key              # Remove TTL
```

## Pub/Sub

```bash
# Subscribe
SUBSCRIBE channel
PSUBSCRIBE pattern*

# Publish
PUBLISH channel "message"
```

## Transactions

```bash
MULTI
SET key1 "value1"
INCR counter
EXEC

# Watch (optimistic locking)
WATCH key
# ... check value ...
MULTI
SET key "new"
EXEC  # Fails if key changed
```

**Official docs:** https://redis.io/commands/
