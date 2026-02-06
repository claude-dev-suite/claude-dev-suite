---
name: axum
description: |
  Axum Rust web framework by Tokio. Covers routing, handlers, extractors,
  middleware, and state. Use for ergonomic async Rust APIs.

  USE WHEN: user mentions "axum", "tokio web", "rust async api", "tower middleware",
  asks about "axum extractors", "axum state", "axum router", "rust websocket axum",
  "hyper server", "ergonomic rust api"

  DO NOT USE FOR: Actix-web projects - use `actix-web` instead, Rocket projects - use `rocket` instead,
  Warp projects - use `warp` instead, non-Rust backends
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Axum Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for authentication middleware, WebSocket handling, graceful shutdown, and custom error types.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `axum` for comprehensive documentation.

## Basic Setup

```toml
# Cargo.toml
[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
tower-http = { version = "0.5", features = ["cors", "trace"] }
```

```rust
use axum::{routing::get, Router};

async fn hello() -> &'static str {
    "Hello, World!"
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", get(hello));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

## Routing

```rust
let app = Router::new()
    .route("/", get(index))
    .route("/users", get(list_users).post(create_user))
    .route("/users/:id", get(get_user).put(update_user).delete(delete_user));

// Nested Routes
let api_routes = Router::new()
    .route("/users", get(list_users));

let app = Router::new().nest("/api/v1", api_routes);
```

## Extractors

```rust
use axum::extract::{Path, Query, Json, State};

// Path parameters
async fn get_user(Path(id): Path<u32>) -> String {
    format!("User {}", id)
}

// Query parameters
#[derive(Deserialize)]
struct Pagination { page: Option<u32>, per_page: Option<u32> }

async fn list_users(Query(pagination): Query<Pagination>) -> Json<Value> {
    Json(json!({ "page": pagination.page.unwrap_or(1) }))
}

// JSON body
async fn create_user(Json(payload): Json<CreateUser>) -> (StatusCode, Json<Value>) {
    (StatusCode::CREATED, Json(json!({ "name": payload.name })))
}
```

## Application State

```rust
use std::sync::Arc;

struct AppState {
    db_pool: sqlx::PgPool,
}

async fn handler(State(state): State<Arc<AppState>>) -> String {
    // Use state.db_pool
}

let state = Arc::new(AppState { db_pool: pool });
let app = Router::new()
    .route("/", get(handler))
    .with_state(state);
```

## Tower Middleware

```rust
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tower::ServiceBuilder;

let app = Router::new()
    .route("/", get(index))
    .layer(
        ServiceBuilder::new()
            .layer(TraceLayer::new_for_http())
            .layer(CorsLayer::permissive())
    );
```

## Health Checks

```rust
async fn health() -> Json<Value> {
    Json(json!({ "status": "healthy" }))
}

async fn ready(State(state): State<Arc<AppState>>) -> Result<Json<Value>, StatusCode> {
    sqlx::query("SELECT 1")
        .execute(&state.db_pool)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

    Ok(Json(json!({ "status": "ready" })))
}
```

## When NOT to Use This Skill

- **Actix-web projects** - Actix has more built-in features
- **Rocket projects** - Rocket has compile-time route checking
- **Sync-only Rust code** - Axum requires async runtime

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Not using `Arc` for state | Expensive clones | Wrap state in `Arc<AppState>` |
| Blocking operations in handlers | Blocks executor | Use `tokio::task::spawn_blocking` |
| Missing error conversion | Compiler errors | Implement `IntoResponse` for errors |
| Not using extractors | Manual parsing | Use `Path`, `Query`, `Json` extractors |

## Quick Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| "Handler doesn't implement Handler" | Wrong signature | Check extractor order and return type |
| Route not matching | Conflicting routes | Order routes from specific to general |
| State not accessible | Wrong state type | Ensure `with_state()` matches `State<T>` |
| Missing CORS headers | No layer | Add `CorsLayer` from tower-http |

## Production Checklist

- [ ] Tracing/logging configured
- [ ] CORS properly set up
- [ ] Error handling with custom types
- [ ] Health/readiness endpoints
- [ ] Graceful shutdown
- [ ] State management with Arc
- [ ] Input validation

## Reference Documentation
- [Extractors](quick-ref/extractors.md)
- [Middleware](quick-ref/middleware.md)
