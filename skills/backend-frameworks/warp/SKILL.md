---
name: warp
description: |
  Warp Rust web framework using filters. Covers routing, filters, rejection,
  WebSocket, and TLS. Use for composable, type-safe Rust APIs.

  USE WHEN: user mentions "warp", "rust filters", "composable rust api",
  asks about "warp filters", "warp rejection", "filter composition rust",
  "rust hyper warp", "warp websocket"

  DO NOT USE FOR: Axum projects - use `axum` instead, Actix-web projects - use `actix-web` instead,
  Rocket projects - use `rocket` instead, non-Rust backends
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Warp Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `warp` for comprehensive documentation.

## Basic Setup

```toml
# Cargo.toml
[dependencies]
warp = "0.3"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

```rust
use warp::Filter;

#[tokio::main]
async fn main() {
    let hello = warp::path::end()
        .map(|| "Hello, World!");

    warp::serve(hello)
        .run(([127, 0, 0, 1], 8080))
        .await;
}
```

## Filters

### Path Filters

```rust
use warp::Filter;

// Static path
let index = warp::path::end()
    .map(|| "Index");

// Path segment
let users = warp::path("users")
    .and(warp::path::end())
    .map(|| "Users list");

// Path parameter
let user = warp::path("users")
    .and(warp::path::param::<u32>())
    .and(warp::path::end())
    .map(|id: u32| format!("User {}", id));

// Multiple parameters
let post = warp::path("users")
    .and(warp::path::param::<u32>())
    .and(warp::path("posts"))
    .and(warp::path::param::<u32>())
    .and(warp::path::end())
    .map(|user_id: u32, post_id: u32| {
        format!("User {} Post {}", user_id, post_id)
    });
```

### Method Filters

```rust
let get_users = warp::get()
    .and(warp::path("users"))
    .and(warp::path::end())
    .map(|| "Get users");

let create_user = warp::post()
    .and(warp::path("users"))
    .and(warp::path::end())
    .map(|| "Create user");

let update_user = warp::put()
    .and(warp::path("users"))
    .and(warp::path::param::<u32>())
    .and(warp::path::end())
    .map(|id: u32| format!("Update user {}", id));

let delete_user = warp::delete()
    .and(warp::path("users"))
    .and(warp::path::param::<u32>())
    .and(warp::path::end())
    .map(|id: u32| format!("Delete user {}", id));

// Combine routes
let routes = get_users
    .or(create_user)
    .or(update_user)
    .or(delete_user);
```

### Body Filters

```rust
use serde::{Deserialize, Serialize};
use warp::Filter;

#[derive(Deserialize, Serialize)]
struct CreateUser {
    name: String,
    email: String,
}

// JSON body
let create_user = warp::post()
    .and(warp::path("users"))
    .and(warp::body::json::<CreateUser>())
    .map(|user: CreateUser| {
        warp::reply::json(&user)
    });

// With size limit
let create_user_limited = warp::post()
    .and(warp::path("users"))
    .and(warp::body::content_length_limit(1024 * 16))
    .and(warp::body::json::<CreateUser>())
    .map(|user: CreateUser| {
        warp::reply::json(&user)
    });
```

### Query Filters

```rust
#[derive(Deserialize)]
struct Pagination {
    page: Option<u32>,
    per_page: Option<u32>,
}

let list_users = warp::get()
    .and(warp::path("users"))
    .and(warp::query::<Pagination>())
    .map(|pagination: Pagination| {
        let page = pagination.page.unwrap_or(1);
        format!("Page {}", page)
    });
```

### Header Filters

```rust
let with_auth = warp::header::<String>("authorization")
    .map(|auth: String| format!("Auth: {}", auth));

// Optional header
let with_optional_header = warp::header::optional::<String>("x-custom")
    .map(|custom: Option<String>| {
        custom.unwrap_or_else(|| "default".to_string())
    });
```

## Handlers

### Async Handlers

```rust
async fn list_users_handler() -> Result<impl warp::Reply, warp::Rejection> {
    let users = fetch_users().await;
    Ok(warp::reply::json(&users))
}

let list_users = warp::get()
    .and(warp::path("users"))
    .and_then(list_users_handler);
```

### With State

```rust
use std::sync::Arc;
use tokio::sync::Mutex;

struct AppState {
    db_pool: PgPool,
    counter: Mutex<u32>,
}

fn with_state(
    state: Arc<AppState>,
) -> impl Filter<Extract = (Arc<AppState>,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || state.clone())
}

async fn get_count(state: Arc<AppState>) -> Result<impl warp::Reply, warp::Rejection> {
    let count = state.counter.lock().await;
    Ok(warp::reply::json(&serde_json::json!({ "count": *count })))
}

#[tokio::main]
async fn main() {
    let state = Arc::new(AppState {
        db_pool: create_pool().await,
        counter: Mutex::new(0),
    });

    let count_route = warp::get()
        .and(warp::path("count"))
        .and(with_state(state.clone()))
        .and_then(get_count);

    warp::serve(count_route)
        .run(([127, 0, 0, 1], 8080))
        .await;
}
```

## Rejections and Error Handling

### Custom Rejection

```rust
use warp::reject::Reject;

#[derive(Debug)]
struct NotFound;
impl Reject for NotFound {}

#[derive(Debug)]
struct Unauthorized;
impl Reject for Unauthorized {}

#[derive(Debug)]
struct BadRequest(String);
impl Reject for BadRequest {}

async fn get_user(id: u32) -> Result<impl warp::Reply, warp::Rejection> {
    match find_user(id).await {
        Some(user) => Ok(warp::reply::json(&user)),
        None => Err(warp::reject::custom(NotFound)),
    }
}
```

### Rejection Handler

```rust
use warp::http::StatusCode;

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    message: String,
}

async fn handle_rejection(err: warp::Rejection) -> Result<impl warp::Reply, std::convert::Infallible> {
    let (code, message) = if err.is_not_found() {
        (StatusCode::NOT_FOUND, "Not Found")
    } else if let Some(_) = err.find::<NotFound>() {
        (StatusCode::NOT_FOUND, "Resource not found")
    } else if let Some(_) = err.find::<Unauthorized>() {
        (StatusCode::UNAUTHORIZED, "Unauthorized")
    } else if let Some(e) = err.find::<BadRequest>() {
        (StatusCode::BAD_REQUEST, &e.0 as &str)
    } else if let Some(_) = err.find::<warp::reject::MethodNotAllowed>() {
        (StatusCode::METHOD_NOT_ALLOWED, "Method not allowed")
    } else {
        (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
    };

    let json = warp::reply::json(&ErrorResponse {
        error: code.to_string(),
        message: message.to_string(),
    });

    Ok(warp::reply::with_status(json, code))
}

// Apply to routes
let routes = get_users
    .or(create_user)
    .recover(handle_rejection);
```

## WebSocket

```rust
use warp::ws::{Message, WebSocket};
use futures::{StreamExt, SinkExt};

async fn handle_ws(ws: WebSocket) {
    let (mut tx, mut rx) = ws.split();

    while let Some(result) = rx.next().await {
        match result {
            Ok(msg) => {
                if msg.is_text() {
                    let text = msg.to_str().unwrap();
                    let reply = Message::text(format!("Echo: {}", text));
                    if tx.send(reply).await.is_err() {
                        break;
                    }
                } else if msg.is_close() {
                    break;
                }
            }
            Err(e) => {
                eprintln!("WebSocket error: {}", e);
                break;
            }
        }
    }
}

let ws_route = warp::path("ws")
    .and(warp::ws())
    .map(|ws: warp::ws::Ws| {
        ws.on_upgrade(handle_ws)
    });
```

### Broadcast with Channels

```rust
use tokio::sync::broadcast;

async fn handle_ws_broadcast(
    ws: WebSocket,
    tx: broadcast::Sender<String>,
) {
    let mut rx = tx.subscribe();
    let (mut ws_tx, mut ws_rx) = ws.split();

    // Spawn receiver task
    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if ws_tx.send(Message::text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages
    while let Some(result) = ws_rx.next().await {
        if let Ok(msg) = result {
            if msg.is_text() {
                let _ = tx.send(msg.to_str().unwrap().to_string());
            }
        }
    }

    send_task.abort();
}
```

## TLS

```rust
#[tokio::main]
async fn main() {
    let routes = warp::path::end().map(|| "Hello, TLS!");

    warp::serve(routes)
        .tls()
        .cert_path("cert.pem")
        .key_path("key.pem")
        .run(([0, 0, 0, 0], 443))
        .await;
}
```

## Production Readiness

### CORS

```rust
use warp::cors;

let cors = warp::cors()
    .allow_any_origin()
    .allow_methods(vec!["GET", "POST", "PUT", "DELETE"])
    .allow_headers(vec!["content-type", "authorization"]);

let routes = get_users
    .or(create_user)
    .with(cors);
```

### Logging

```rust
use warp::Filter;

let routes = get_users
    .or(create_user)
    .with(warp::log("api"));
```

### Health Checks

```rust
let health = warp::path("health")
    .and(warp::path::end())
    .map(|| warp::reply::json(&serde_json::json!({ "status": "healthy" })));

let ready = warp::path("ready")
    .and(warp::path::end())
    .and(with_state(state.clone()))
    .and_then(|state: Arc<AppState>| async move {
        match sqlx::query("SELECT 1").execute(&state.db_pool).await {
            Ok(_) => Ok(warp::reply::json(&serde_json::json!({
                "status": "ready"
            }))),
            Err(_) => Err(warp::reject::custom(ServiceUnavailable)),
        }
    });
```

### Graceful Shutdown

```rust
use tokio::signal;

#[tokio::main]
async fn main() {
    let routes = warp::path::end().map(|| "Hello");

    let (addr, server) = warp::serve(routes)
        .bind_with_graceful_shutdown(([0, 0, 0, 0], 8080), async {
            signal::ctrl_c().await.expect("Failed to listen for ctrl-c");
            println!("Shutting down...");
        });

    println!("Server running on {}", addr);
    server.await;
}
```

### Checklist

- [ ] CORS configured
- [ ] Logging enabled
- [ ] Custom rejection handler
- [ ] Health/readiness endpoints
- [ ] Graceful shutdown
- [ ] TLS for production
- [ ] Rate limiting
- [ ] Request body size limits

## When NOT to Use This Skill

- **Axum projects** - Axum is more ergonomic with extractors
- **Actix-web projects** - Actix has more batteries included
- **Rocket projects** - Rocket has simpler macro-based routing
- **Beginners to Rust web** - Filter composition has learning curve
- **Simple CRUD APIs** - Other frameworks have less boilerplate

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Deep filter nesting | Hard to debug | Extract filters to named functions |
| Not using `.and()` properly | Filter doesn't compose | Chain filters with `.and()` |
| Missing `.recover()` | Rejections not handled | Add `.recover(handle_rejection)` |
| Cloning state in every filter | Performance cost | Use `warp::any().map(move || state.clone())` |
| No custom rejections | Generic errors | Define custom rejection types |
| Blocking operations | Blocks executor | Use `tokio::task::spawn_blocking` |

## Quick Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| "Filter not satisfied" | Missing filter requirement | Check `.and()` chain for all needed filters |
| Type inference errors | Complex filter types | Use `impl Filter` return type |
| Route not matching | Wrong filter order | Order filters from specific to general |
| JSON parsing fails | Wrong content-type | Ensure `Content-Type: application/json` |
| WebSocket upgrade rejected | Missing upgrade header | Check client WebSocket handshake |
| State not accessible | Filter not composed | Use `.and(with_state(state))` |

## Reference Documentation

- [Filters](quick-ref/filters.md)
- [Rejections](quick-ref/rejections.md)
- [WebSocket](quick-ref/websocket.md)
