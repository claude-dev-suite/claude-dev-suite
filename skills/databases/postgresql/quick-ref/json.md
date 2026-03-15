# PostgreSQL JSON Queries

> **Knowledge Base:** Read `knowledge/postgresql/json.md` for complete documentation.

## JSON vs JSONB

```sql
-- JSONB (recommended) - binary, indexed, faster queries
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    profile JSONB DEFAULT '{}'
);

-- JSON - text, preserves whitespace/order
CREATE TABLE logs (
    id SERIAL PRIMARY KEY,
    data JSON
);
```

## Accessing Data

```sql
-- Arrow operators
SELECT profile->'address' FROM users;           -- JSON object
SELECT profile->>'name' FROM users;             -- Text value
SELECT profile->'address'->>'city' FROM users;  -- Nested text

-- Path operator
SELECT profile #> '{address,city}' FROM users;   -- JSON at path
SELECT profile #>> '{address,city}' FROM users;  -- Text at path
```

## Querying JSONB

```sql
-- Contains
SELECT * FROM users WHERE profile @> '{"role": "admin"}';

-- Key exists
SELECT * FROM users WHERE profile ? 'email';

-- Any key exists
SELECT * FROM users WHERE profile ?| array['email', 'phone'];

-- All keys exist
SELECT * FROM users WHERE profile ?& array['email', 'name'];

-- Path value check
SELECT * FROM users WHERE profile->>'role' = 'admin';
SELECT * FROM users WHERE (profile->>'age')::int > 18;
```

## Modifying JSONB

```sql
-- Set value
UPDATE users SET profile = jsonb_set(profile, '{role}', '"admin"');

-- Set nested value
UPDATE users SET profile = jsonb_set(profile, '{address,city}', '"NYC"');

-- Remove key
UPDATE users SET profile = profile - 'password';

-- Remove nested key
UPDATE users SET profile = profile #- '{address,zip}';

-- Concatenate/merge
UPDATE users SET profile = profile || '{"verified": true}';
```

## Aggregation

```sql
-- Build JSON object
SELECT jsonb_build_object(
    'name', name,
    'email', email
) FROM users;

-- Aggregate to array
SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name))
FROM users;

-- Aggregate to object
SELECT jsonb_object_agg(id, name)
FROM users;
```

## Indexing JSONB

```sql
-- GIN index for containment queries
CREATE INDEX idx_users_profile ON users USING GIN(profile);

-- Expression index for specific path
CREATE INDEX idx_users_role ON users((profile->>'role'));

-- Path ops (smaller, specific operators)
CREATE INDEX idx_users_profile_path ON users USING GIN(profile jsonb_path_ops);
```

## JSON Functions

```sql
-- Array elements
SELECT jsonb_array_elements(profile->'tags') FROM users;

-- Object keys/values
SELECT jsonb_each(profile) FROM users;
SELECT jsonb_object_keys(profile) FROM users;

-- Pretty print
SELECT jsonb_pretty(profile) FROM users;
```

**Official docs:** https://www.postgresql.org/docs/current/functions-json.html
