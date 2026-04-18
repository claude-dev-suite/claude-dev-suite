---
name: personalization-rag
description: |
  User-specific retrieval. Per-user namespaces/filters, preference embeddings,
  collaborative signals, reranking with user context (role, history, favorites),
  privacy-preserving design (encrypted metadata, differential privacy), GDPR-
  compliant personalization, long-term user memory with mem0/Zep/Letta, graph-
  based user-entity memory.

  USE WHEN: user mentions "personalized RAG", "user-specific RAG", "per-user
  retrieval", "mem0", "Zep", "Letta", "long-term memory", "user preferences RAG"

  DO NOT USE FOR: per-session chat memory - use `conversational-rag`;
  feedback-driven model updates - use `feedback-loops`;
  multi-tenant isolation only - use `rag-architecture`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Personalization in RAG

## Three Layers of Personalization

| Layer | Data | Updated |
|---|---|---|
| Session (short-term) | Current conversation | Per turn |
| Profile (long-term) | Role, preferences, skills, favorites | Weeks to months |
| Behavior (collaborative) | Clicks, dwell, ratings | Continuous |

## Access Isolation: Per-User Namespaces

Mandatory when users have private data. Separate vector DB collections or namespaces per user.

```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, Filter, FieldCondition, MatchValue

client = QdrantClient(url="http://localhost:6333")

def ensure_user_space(user_id: str):
    coll = f"user_{user_id}"
    if not client.collection_exists(coll):
        client.create_collection(
            coll, vectors_config=VectorParams(size=1536, distance=Distance.COSINE)
        )

def retrieve_for_user(user_id: str, query_vec: list[float], k: int = 5):
    ensure_user_space(user_id)
    return client.search(collection_name=f"user_{user_id}", query_vector=query_vec, limit=k)
```

Alternative: single collection with hard metadata filter. Cheaper; requires a strict filter on every read:

```python
user_filter = Filter(must=[FieldCondition(key="user_id", match=MatchValue(value=user_id))])
client.search(collection_name="kb", query_vector=query_vec, query_filter=user_filter, limit=5)
```

Namespace-per-user scales to ~10k users per cluster; filter-based scales to millions but every query must apply the filter or you leak data.

## Preference Embedding

Embed the user profile once per session and blend with the query embedding.

```python
import numpy as np
from openai import OpenAI

oai = OpenAI()

def user_profile_text(user_id: str) -> str:
    # Pull from your profile store
    role = profiles[user_id]["role"]            # "senior backend engineer"
    langs = profiles[user_id]["languages"]      # ["Go", "Python"]
    faves = profiles[user_id]["favorite_repos"][:5]
    return f"Role: {role}. Languages: {', '.join(langs)}. Interests: {', '.join(faves)}."

def blended_query(user_id: str, query: str, alpha: float = 0.8) -> list[float]:
    q_vec = np.array(oai.embeddings.create(model="text-embedding-3-small",
                                           input=query).data[0].embedding)
    u_vec = np.array(oai.embeddings.create(model="text-embedding-3-small",
                                           input=user_profile_text(user_id)).data[0].embedding)
    v = alpha * q_vec + (1 - alpha) * u_vec
    return (v / np.linalg.norm(v)).tolist()
```

Alpha: 0.8-0.9 is a sensible default. Query dominates; user bias nudges.

## Personalized Reranking

Reranker sees the user context explicitly. More controllable than blended embeddings.

```python
import cohere
co = cohere.Client()

def personalized_rerank(user_id: str, query: str, docs, top_n: int = 5):
    profile = user_profile_text(user_id)
    augmented_query = f"User: {profile}\nQuestion: {query}"
    res = co.rerank(
        query=augmented_query,
        documents=[d.page_content for d in docs],
        top_n=top_n,
        model="rerank-english-v3.0",
    )
    return [docs[r.index] for r in res.results]
```

For open models, use a cross-encoder with the same pattern.

## Collaborative Filtering Signals

Borrow from recommender systems: users similar to this user engaged with these chunks.

```python
# Precomputed: chunk_popularity[user_id] = {chunk_id: score}
# Similarity: cosine over normalized rating vectors.

def collab_boost(user_id: str, candidate_ids: list[str], k_neighbors: int = 20):
    neighbors = nearest_users(user_id, k=k_neighbors)
    boosts = {cid: 0.0 for cid in candidate_ids}
    for n, sim in neighbors:
        for cid, score in chunk_popularity[n].items():
            if cid in boosts:
                boosts[cid] += sim * score
    return boosts

def personalized_score(user_id, q, candidates, alpha=0.7):
    semantic = {d.id: d.score for d in candidates}
    collab = collab_boost(user_id, [d.id for d in candidates])
    return {cid: alpha * semantic[cid] + (1 - alpha) * collab.get(cid, 0)
            for cid in semantic}
```

Needs enough users + interactions to be worth it (> 1k active users, > 100k interactions).

## Long-Term Memory: mem0 / Zep / Letta

### mem0

```python
from mem0 import Memory

mem = Memory()

mem.add("I prefer TypeScript over JavaScript and build with Vite.",
        user_id="alice", metadata={"kind": "preference"})

relevant = mem.search("What framework should I use?", user_id="alice", limit=5)
```

mem0 extracts structured facts, deduplicates, and stores in a graph + vector hybrid.

### Zep (long-term memory + temporal reasoning)

```python
from zep_cloud.client import Zep
z = Zep(api_key=...)

z.memory.add(session_id="alice_web", messages=[
    {"role": "user", "content": "I manage the platform team at Acme."}
])

mem = z.memory.get(session_id="alice_web")
# mem.relevant_facts includes entities, summaries, and timestamps.
```

### Letta (MemGPT)

```python
from letta import create_client, ChatMemory
client = create_client()
agent = client.create_agent(
    name="alice_agent",
    memory=ChatMemory(human="Alice, senior backend engineer, prefers Go.",
                      persona="You are a helpful technical assistant."),
)
```

Letta manages a hierarchical memory (core, archival, recall) with an internal memory-management LLM loop.

## Graph-Based User-Entity Memory

Facts as (subject, predicate, object, timestamp). Retrieval by entity and relationship.

```python
# Neo4j via Cypher
"""
MERGE (u:User {id: $user_id})
MERGE (e:Entity {name: $entity})
MERGE (u)-[r:RELATES {kind: $rel}]->(e)
SET r.first_seen = coalesce(r.first_seen, datetime()),
    r.last_seen = datetime(),
    r.count = coalesce(r.count, 0) + 1
"""

def expand_query_with_entities(user_id: str, query: str):
    """Expand the query with the user's most-connected entities from the graph."""
    res = neo4j.run("""
        MATCH (u:User {id: $u})-[r:RELATES]->(e:Entity)
        RETURN e.name AS name, r.count AS c
        ORDER BY c DESC LIMIT 10
    """, u=user_id).data()
    entities = [row["name"] for row in res]
    return f"{query} (user interests: {', '.join(entities)})"
```

## Privacy & Compliance

### Encryption at rest

Metadata that contains PII must be encrypted. Vector DBs do not typically provide per-field crypto; use an application-layer wrapper.

```python
from cryptography.fernet import Fernet

cipher = Fernet(KEY)

def store(user_id: str, vec, meta: dict):
    safe_meta = {
        "user_id": user_id,
        "ciphertext": cipher.encrypt(json.dumps(meta).encode()).decode(),
    }
    client.upsert(...)

def retrieve(user_id, q_vec):
    res = client.search(...)
    for p in res:
        p.payload["meta"] = json.loads(cipher.decrypt(p.payload["ciphertext"]))
    return res
```

### GDPR Right-to-Erasure

Namespace-per-user makes deletion one operation:

```python
def delete_user(user_id: str):
    client.delete_collection(f"user_{user_id}")
    profiles.pop(user_id, None)
    mem.delete_all(user_id=user_id)
    neo4j.run("MATCH (u:User {id:$u}) DETACH DELETE u", u=user_id)
```

With filter-based isolation, you also need:

```python
client.delete(
    collection_name="kb",
    points_selector=Filter(must=[FieldCondition(key="user_id", match=MatchValue(value=user_id))]),
)
```

Audit: record the deletion event (ID, timestamp, triggering request) to an immutable log for regulatory proof.

### Differential Privacy for Collaborative Features

If collaborative signals leak user behavior back to other users, add calibrated noise.

```python
import numpy as np

def dp_boost(boosts: dict, epsilon: float = 1.0):
    sensitivity = 1.0  # cap per-user contribution
    scale = sensitivity / epsilon
    return {k: v + np.random.laplace(0, scale) for k, v in boosts.items()}
```

Epsilon 1-5 is typical for recommender systems; stricter in regulated sectors.

### Data Minimization

Do not store raw queries indefinitely. Extract facts, discard raw text after N days.

```python
# Daily job:
# 1. Extract facts from query_log via LLM.
# 2. Store facts in user profile.
# 3. Delete raw query log entries > 30 days old.
```

## Evaluation of Personalization

- A/B test personalized vs non-personalized retriever.
- Per-user lift: average top-K relevance delta per user.
- Cold start: how does the system behave with no profile data?
- Fairness: does personalization disadvantage a protected group?

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Single shared index without a user filter | Leaks data across users; always filter |
| Storing PII in vector metadata unencrypted | Encrypt or hash |
| Profile blend with alpha < 0.5 | User bias overrides query; surface irrelevant but personalized docs |
| Long-term memory that never forgets | Apply TTL, consent, and data minimization |
| Collab filtering without enough data | Falls back to noise; gate behind a threshold |
| Personalization before basic retrieval works | Fix retrieval first; personalization can only marginally help |
| Same system prompt for all users | User role / expertise level belongs in the system prompt |
| No cold-start handling | New users get zero personalization; design explicit onboarding signals |
| Deleting user but leaving vector entries | Deletion is audit-material; test it |
| Testing only on power users | Measure across activity percentiles |

## Production Checklist

- [ ] Namespace-per-user or hard filter on every retrieval
- [ ] Right-to-erasure endpoint deletes across vector DB, profile, memory store, graph
- [ ] Deletion events logged immutably with timestamp + request ID
- [ ] PII metadata encrypted at rest
- [ ] Per-user token / query rate limits
- [ ] User profile store (Postgres) with versioning
- [ ] Long-term memory store (mem0/Zep/Letta) evaluated
- [ ] Collaborative signals gated behind minimum activity threshold
- [ ] Differential privacy on cross-user aggregates if exposed
- [ ] Cold-start experience designed (default profile, onboarding questions)
- [ ] Personalization A/B tested vs baseline
- [ ] Fairness audit across protected groups
- [ ] Raw query retention policy (delete after N days, keep extracted facts)
