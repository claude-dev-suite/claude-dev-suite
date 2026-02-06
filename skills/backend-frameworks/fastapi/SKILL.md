---
name: fastapi
description: |
  FastAPI modern Python web framework. Covers routing, Pydantic models,
  dependency injection, and async support. Use when building Python APIs.

  USE WHEN: user mentions "fastapi", "pydantic", "async python api", "python rest api",
  asks about "dependency injection python", "python openapi", "python swagger",
  "async endpoints", "python api validation", "fastapi middleware"

  DO NOT USE FOR: Django apps - use `django` instead, Flask apps - use `flask` instead,
  synchronous Python APIs without type hints, GraphQL-only APIs
allowed-tools: Read, Grep, Glob, Write, Edit
---
# FastAPI Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for WebSocket integration including connection management, authentication, room management, Pydantic message protocols, heartbeat, Redis pub/sub scaling, and background tasks.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `fastapi` for comprehensive documentation.

## Basic Setup

```python
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel, EmailStr

app = FastAPI(title="My API")

class UserCreate(BaseModel):
    name: str
    email: EmailStr

class User(UserCreate):
    id: int

    class Config:
        from_attributes = True
```

## Route Patterns

```python
@app.get("/users", response_model=list[User])
async def get_users(skip: int = 0, limit: int = 100):
    return await db.users.find_many(skip=skip, limit=limit)

@app.get("/users/{user_id}", response_model=User)
async def get_user(user_id: int):
    user = await db.users.find(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.post("/users", response_model=User, status_code=201)
async def create_user(user: UserCreate):
    return await db.users.create(user.model_dump())
```

## Dependency Injection

```python
async def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def get_current_user(token: str = Depends(oauth2_scheme)):
    user = await verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

@app.get("/me", response_model=User)
async def get_me(user: User = Depends(get_current_user)):
    return user
```

## Key Features

- Auto OpenAPI/Swagger docs at `/docs`
- Pydantic validation
- Async support
- Type hints everywhere

## When NOT to Use This Skill

- **Django projects** - Django has its own ORM, admin, templates
- **Flask microservices** - Flask is lighter without type validation overhead
- **Synchronous WSGI apps** - FastAPI is async-first
- **Legacy Python 2.x** - FastAPI requires Python 3.7+
- **Non-REST APIs** - Use dedicated GraphQL or gRPC frameworks

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| `def` instead of `async def` | Blocks event loop | Use `async def` for I/O operations |
| Missing `response_model` | No output validation | Always specify `response_model` |
| Sync database calls | Blocks workers | Use async drivers (asyncpg, motor) |
| Global state without locks | Race conditions | Use `asyncio.Lock` or `Depends()` |
| Raising exceptions without HTTPException | Generic 500 errors | Use `HTTPException` with status codes |
| No input validation | Security vulnerabilities | Use Pydantic models with validators |

## Quick Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| "RuntimeError: no running event loop" | Calling async from sync code | Use `await` or `asyncio.run()` |
| Validation errors not clear | Missing field descriptions | Add `Field(description=...)` |
| Slow response times | Sync database calls | Switch to async SQLAlchemy |
| CORS errors in browser | Missing middleware | Add `CORSMiddleware` |
| Dependency not injected | Wrong import or syntax | Check `Depends()` syntax |

## Production Readiness

### Security Configuration

```python
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter

app = FastAPI(
    title="My API",
    docs_url="/docs" if os.getenv("ENV") != "production" else None,
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)
```

### Health Checks

```python
@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/ready")
async def readiness(db: Session = Depends(get_db)):
    try:
        db.execute("SELECT 1")
        return {"status": "ready", "database": "connected"}
    except Exception:
        return JSONResponse(status_code=503, content={"status": "not ready"})
```

### Graceful Shutdown

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.connect()
    yield
    await database.disconnect()

app = FastAPI(lifespan=lifespan)
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Request latency p99 | > 500ms |
| Error rate (5xx) | > 1% |
| Memory usage | > 80% |
| Worker utilization | > 90% |

### Checklist

- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Security headers middleware
- [ ] Pydantic validation on all inputs
- [ ] Health/readiness/liveness endpoints
- [ ] Structured logging (JSON format)
- [ ] Global exception handler
- [ ] Secrets via environment variables
- [ ] Docs disabled in production
- [ ] Gunicorn with multiple workers
- [ ] Graceful shutdown handling

## Reference Documentation

- [Pydantic Models](quick-ref/pydantic.md)
- [Dependencies](quick-ref/dependencies.md)
