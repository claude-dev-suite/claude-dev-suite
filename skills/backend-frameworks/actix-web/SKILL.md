---
name: actix-web
description: |
  Actix-web Rust web framework. Covers routing, extractors, middleware,
  state management, and WebSocket. Use for high-performance Rust APIs.

  USE WHEN: user mentions "actix-web", "actix", "rust web framework", "rust api",
  asks about "rust async web", "actix middleware", "actix extractors",
  "rust websocket", "high performance rust api"

  DO NOT USE FOR: Axum projects - use `axum` instead, Rocket projects - use `rocket` instead,
  Warp projects - use `warp` instead, non-Rust backends
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Actix-web Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for custom timing middleware, authentication middleware, custom error types, WebSocket actors, and graceful shutdown patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `actix-web` for comprehensive documentation.

## Basic Setup

```toml
# Cargo.toml
[dependencies]
actix-web = "4"
actix-rt = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
```

```rust
use actix_web::{web, App, HttpServer, HttpResponse, Responder};

async fn hello() -> impl Responder {
    HttpResponse::Ok().body("Hello, World!")
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .route("/", web::get().to(hello))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
```

## Route Macros

```rust
use actix_web::{get, post, web, HttpResponse, Responder};

#[get("/users/{id}")]
async fn get_user(path: web::Path<u32>) -> impl Responder {
    let id = path.into_inner();
    HttpResponse::Ok().json(serde_json::json!({ "id": id }))
}

#[post("/users")]
async fn create_user(body: web::Json<CreateUser>) -> impl Responder {
    HttpResponse::Created().json(body.into_inner())
}

// Register with App
App::new()
    .service(get_user)
    .service(create_user)
```

## Extractors

| Extractor | Purpose |
|-----------|---------|
| `web::Path<T>` | URL path parameters |
| `web::Query<T>` | Query string |
| `web::Json<T>` | JSON body |
| `web::Form<T>` | Form data |
| `web::Data<T>` | Application state |

## Application State

```rust
struct AppState {
    db_pool: Pool<Postgres>,
}

#[get("/users")]
async fn list_users(data: web::Data<AppState>) -> impl Responder {
    let users = sqlx::query_as!(User, "SELECT * FROM users")
        .fetch_all(&data.db_pool)
        .await?;
    HttpResponse::Ok().json(users)
}

HttpServer::new(move || {
    App::new()
        .app_data(web::Data::new(state.clone()))
        .service(list_users)
})
```

## Built-in Middleware

```rust
use actix_web::middleware::{Logger, Compress, NormalizePath};

App::new()
    .wrap(Logger::default())
    .wrap(Compress::default())
    .wrap(NormalizePath::trim())
```

## Health Checks

```rust
#[get("/health")]
async fn health() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({ "status": "healthy" }))
}

#[get("/ready")]
async fn ready(data: web::Data<AppState>) -> impl Responder {
    match data.db_pool.acquire().await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "status": "ready",
            "database": "connected"
        })),
        Err(_) => HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "status": "not ready"
        })),
    }
}
```

## When NOT to Use This Skill

- **Axum projects** - Axum is more ergonomic with Tower ecosystem
- **Rocket projects** - Rocket has better compile-time guarantees
- **Warp projects** - Warp uses filters for composition
- **Simple CLI tools** - No web server needed
- **Embedded systems** - Too heavy for resource-constrained devices

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| `.clone()` on every request | Performance overhead | Use `web::Data<Arc<T>>` for shared state |
| Blocking I/O in async handlers | Blocks executor threads | Use `web::block()` for blocking operations |
| Not using extractors | Manual parsing is error-prone | Use `Json`, `Path`, `Query` extractors |
| Missing `#[actix_web::main]` | Manual runtime setup | Use macro for simple setup |
| Global mutable state | Data races | Use `Mutex` or `RwLock` with `web::Data` |
| No custom error types | Generic error messages | Implement `ResponseError` trait |

## Quick Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| "Cannot move out of borrowed content" | Ownership issue | Clone data or use `web::Data<Arc<T>>` |
| Handler not found (404) | Route not registered | Check `.service()` or `.route()` calls |
| JSON parsing fails | Wrong content-type | Ensure client sends `Content-Type: application/json` |
| Slow performance | Blocking I/O | Wrap blocking code in `web::block()` |
| WebSocket connection closes | Missing ping/pong | Implement heartbeat mechanism |
| State not accessible | Not added to app | Use `.app_data()` when building app |

## Checklist

- [ ] CORS properly configured
- [ ] Authentication middleware
- [ ] Custom error handling
- [ ] Request logging (Logger middleware)
- [ ] Health/readiness endpoints
- [ ] Graceful shutdown
- [ ] Connection pooling for database
- [ ] Input validation
- [ ] Rate limiting (actix-ratelimit)

## Reference Documentation

- [Extractors](quick-ref/extractors.md)
- [Middleware](quick-ref/middleware.md)
