---
name: rocket
description: |
  Rocket Rust web framework. Covers routing, fairings, guards, state,
  and testing. Use for type-safe, boilerplate-free Rust APIs.

  USE WHEN: user mentions "rocket", "rust type-safe api", "rocket guards",
  asks about "rocket fairings", "rocket state", "compile-time route checking",
  "rust web macros", "rocket testing"

  DO NOT USE FOR: Axum projects - use `axum` instead, Actix-web projects - use `actix-web` instead,
  Warp projects - use `warp` instead, non-Rust backends
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Rocket Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for custom guards (authentication, API key), fairings (CORS, timing), database state, error catchers, and testing patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rocket` for comprehensive documentation.

## Basic Setup

```toml
# Cargo.toml
[dependencies]
rocket = { version = "0.5", features = ["json"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
```

```rust
#[macro_use] extern crate rocket;

#[get("/")]
fn index() -> &'static str {
    "Hello, World!"
}

#[launch]
fn rocket() -> _ {
    rocket::build().mount("/", routes![index])
}
```

## Routing

```rust
#[get("/users/<id>")]
fn get_user(id: u32) -> String {
    format!("User {}", id)
}

#[post("/users", data = "<user>")]
fn create_user(user: Json<CreateUser>) -> Json<User> {
    Json(User::from(user.into_inner()))
}

#[get("/files/<path..>")]
fn get_file(path: PathBuf) -> Option<NamedFile> {
    NamedFile::open(Path::new("static/").join(path)).ok()
}

// Query parameters
#[derive(FromForm)]
struct Pagination { page: Option<u32>, per_page: Option<u32> }

#[get("/users?<pagination..>")]
fn list_users(pagination: Pagination) -> Json<Vec<User>> {
    let page = pagination.page.unwrap_or(1);
    Json(fetch_users(page, pagination.per_page.unwrap_or(20)))
}

// Mounting
#[launch]
fn rocket() -> _ {
    rocket::build()
        .mount("/", routes![index])
        .mount("/api/v1", routes![list_users, get_user, create_user])
}
```

## Request Guards

```rust
// JSON body
#[post("/users", data = "<user>")]
fn create_user(user: Json<CreateUser>) -> Json<User> {
    Json(User::from(user.into_inner()))
}

// Form data
#[post("/login", data = "<login>")]
fn login(login: Form<LoginForm>) -> String {
    format!("Welcome, {}", login.username)
}

// Cookies
#[get("/session")]
fn session(cookies: &CookieJar<'_>) -> Option<String> {
    cookies.get("session_id").map(|c| c.value().to_string())
}
```

## State Management

```rust
use std::sync::atomic::{AtomicU64, Ordering};

struct HitCount(AtomicU64);

#[get("/count")]
fn count(hit_count: &State<HitCount>) -> String {
    let count = hit_count.0.fetch_add(1, Ordering::Relaxed);
    format!("Hits: {}", count)
}

#[launch]
fn rocket() -> _ {
    rocket::build()
        .manage(HitCount(AtomicU64::new(0)))
        .mount("/", routes![count])
}
```

## Fairings (Middleware)

```rust
use rocket::fairing::AdHoc;

#[launch]
fn rocket() -> _ {
    rocket::build()
        .attach(AdHoc::on_liftoff("Liftoff", |_| Box::pin(async {
            println!("Rocket has launched!");
        })))
}
```

## When NOT to Use This Skill

- **Axum projects** - Axum integrates better with Tower ecosystem
- **Actix-web projects** - Actix has more performance optimizations
- **Stable Rust requirement** - Rocket requires nightly (though v0.5 works on stable)

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Using `Outcome::Forward` everywhere | Routes become hard to trace | Use specific error types |
| Not using request guards | Repetitive validation code | Create custom `FromRequest` guards |
| Mutable state without sync primitives | Data races | Use `Mutex` or `RwLock` with `State` |
| No database connection pooling | Resource exhaustion | Use `rocket_db_pools` |
| Hardcoded secrets in Rocket.toml | Security risk | Use environment variables |

## Quick Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| "Use of unstable library feature" | Wrong Rust version | Install nightly or use Rocket 0.5+ |
| Route not matching | Rank conflict | Specify `rank` attribute or reorder routes |
| Guard returns error | Validation failed | Check guard implementation logic |
| Database error on startup | Wrong connection string | Verify `Rocket.toml` database config |
| CORS issues | No fairing | Add CORS fairing with proper config |

## Production Checklist

- [ ] Rocket.toml configured for production
- [ ] CORS fairing attached
- [ ] Custom error catchers registered
- [ ] Request guards for authentication
- [ ] Database pool configured
- [ ] Health/readiness endpoints
- [ ] Secret key set for release

## Reference Documentation

- [Guards](quick-ref/guards.md)
- [Fairings](quick-ref/fairings.md)
