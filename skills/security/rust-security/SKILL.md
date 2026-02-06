---
name: rust-security
description: |
  Rust security patterns for web applications. Covers memory safety guarantees,
  dependency auditing, secure coding practices, and OWASP for Rust ecosystem.

  USE WHEN: user works with "Rust", "Actix", "Axum", "Rocket", "Warp", asks about "Rust vulnerabilities", "cargo audit", "Rust injection", "Rust authentication"

  DO NOT USE FOR: general OWASP concepts - use `owasp` or `owasp-top-10` instead, other language security - use language-specific skills
allowed-tools: Read, Grep, Glob, Bash
---
# Rust Security - Quick Reference

## When NOT to Use This Skill
- **General OWASP concepts** - Use `owasp` or `owasp-top-10` skill
- **Java security** - Use `java-security` skill
- **Python security** - Use `python-security` skill
- **Secrets management** - Use `secrets-management` skill

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rust` for Rust security documentation.

## Rust's Built-in Security Advantages

Rust provides memory safety by default:
- No null pointer dereferences (Option<T> instead)
- No buffer overflows (bounds checking)
- No use-after-free (ownership system)
- No data races (borrow checker)

However, Rust does NOT protect against:
- Logic errors (authorization bugs)
- SQL injection (string handling)
- XSS (template handling)
- Secrets exposure
- Dependency vulnerabilities

## Dependency Auditing

```bash
# cargo-audit - Check for known vulnerabilities
cargo install cargo-audit
cargo audit

# cargo-deny - Policy-based linting
cargo install cargo-deny
cargo deny check

# Check outdated dependencies
cargo install cargo-outdated
cargo outdated

# Snyk for Rust
snyk test
```

### cargo-deny Configuration (deny.toml)

```toml
[advisories]
vulnerability = "deny"
unmaintained = "warn"
yanked = "deny"

[licenses]
unlicensed = "deny"
allow = ["MIT", "Apache-2.0", "BSD-3-Clause"]

[bans]
multiple-versions = "warn"
wildcards = "deny"

[sources]
unknown-registry = "deny"
unknown-git = "deny"
```

### CI/CD Integration

```yaml
# GitHub Actions
- name: Security audit
  run: |
    cargo install cargo-audit
    cargo audit

- name: Dependency policy check
  run: |
    cargo install cargo-deny
    cargo deny check
```

## SQL Injection Prevention

### SQLx - Safe (Compile-time Checked)

```rust
use sqlx::{PgPool, query_as};

// SAFE - Compile-time verified query
let user: Option<User> = sqlx::query_as!(
    User,
    "SELECT * FROM users WHERE email = $1",
    email
)
.fetch_optional(&pool)
.await?;

// SAFE - Runtime query with bind
let user: Option<User> = sqlx::query_as::<_, User>(
    "SELECT * FROM users WHERE email = $1"
)
.bind(&email)
.fetch_optional(&pool)
.await?;
```

### Diesel - Safe (Type-safe ORM)

```rust
use diesel::prelude::*;

// SAFE - Type-safe query
let user = users::table
    .filter(users::email.eq(&email))
    .first::<User>(&mut conn)
    .optional()?;

// SAFE - Explicit parameter binding
diesel::sql_query("SELECT * FROM users WHERE email = $1")
    .bind::<Text, _>(&email)
    .load::<User>(&mut conn)?;
```

### UNSAFE Patterns

```rust
// UNSAFE - String formatting
let query = format!("SELECT * FROM users WHERE email = '{}'", email);  // NEVER!

// UNSAFE - String concatenation
let query = "SELECT * FROM users WHERE email = '".to_owned() + &email + "'";  // NEVER!
```

## XSS Prevention

### Askama (Compile-time Templates - Auto-escaping)

```rust
use askama::Template;

#[derive(Template)]
#[template(path = "page.html")]
struct PageTemplate<'a> {
    user_input: &'a str,  // Auto-escaped in template
}
```

```html
<!-- page.html - auto-escaped -->
<p>{{ user_input }}</p>

<!-- Explicit raw (use with caution) -->
<p>{{ user_input|safe }}</p>  <!-- Only if already sanitized -->
```

### Tera (Runtime Templates)

```rust
use tera::{Tera, Context};

let tera = Tera::new("templates/**/*")?;
let mut ctx = Context::new();
ctx.insert("user_input", &user_input);  // Auto-escaped

let rendered = tera.render("page.html", &ctx)?;
```

### Manual Sanitization with ammonia

```rust
use ammonia::clean;

// Sanitize HTML input
let safe_html = clean(&user_input);

// Custom policy
use ammonia::Builder;

let safe_html = Builder::default()
    .tags(hashset!["p", "b", "i", "a"])
    .url_schemes(hashset!["http", "https"])
    .link_rel(Some("noopener noreferrer"))
    .clean(&user_input)
    .to_string();
```

## Authentication - JWT

### jsonwebtoken

```rust
use jsonwebtoken::{encode, decode, Header, Algorithm, Validation, EncodingKey, DecodingKey};
use serde::{Serialize, Deserialize};
use chrono::{Utc, Duration};

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,       // user_id
    email: String,
    exp: usize,        // expiration
    iat: usize,        // issued at
}

fn generate_token(user_id: &str, email: &str, secret: &[u8]) -> Result<String, Error> {
    let expiration = Utc::now()
        .checked_add_signed(Duration::hours(1))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: user_id.to_owned(),
        email: email.to_owned(),
        exp: expiration,
        iat: Utc::now().timestamp() as usize,
    };

    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret)
    )
}

fn validate_token(token: &str, secret: &[u8]) -> Result<Claims, Error> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret),
        &validation
    )?;

    Ok(token_data.claims)
}
```

### Password Hashing with argon2

```rust
use argon2::{
    password_hash::{
        rand_core::OsRng,
        PasswordHash, PasswordHasher, PasswordVerifier, SaltString
    },
    Argon2
};

fn hash_password(password: &str) -> Result<String, Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    Ok(argon2
        .hash_password(password.as_bytes(), &salt)?
        .to_string())
}

fn verify_password(password: &str, hash: &str) -> Result<bool, Error> {
    let parsed_hash = PasswordHash::new(hash)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}
```

## Input Validation with validator

```rust
use validator::{Validate, ValidationError};
use regex::Regex;
use lazy_static::lazy_static;

lazy_static! {
    static ref NAME_REGEX: Regex = Regex::new(r"^[a-zA-Z\s\-']+$").unwrap();
}

#[derive(Debug, Validate, Deserialize)]
struct CreateUserRequest {
    #[validate(email, length(max = 255))]
    email: String,

    #[validate(length(min = 12, max = 128), custom = "validate_password_strength")]
    password: String,

    #[validate(length(min = 2, max = 100), regex = "NAME_REGEX")]
    name: String,
}

fn validate_password_strength(password: &str) -> Result<(), ValidationError> {
    let has_upper = password.chars().any(|c| c.is_uppercase());
    let has_lower = password.chars().any(|c| c.is_lowercase());
    let has_digit = password.chars().any(|c| c.is_numeric());
    let has_special = password.chars().any(|c| "@$!%*?&".contains(c));

    if has_upper && has_lower && has_digit && has_special {
        Ok(())
    } else {
        Err(ValidationError::new("password_strength"))
    }
}

// Axum handler
async fn create_user(
    Json(payload): Json<CreateUserRequest>
) -> Result<Json<User>, AppError> {
    payload.validate()?;
    // payload is validated
}
```

## Secure File Upload (Axum)

```rust
use axum::{
    extract::Multipart,
    response::Json,
};
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

const MAX_FILE_SIZE: usize = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES: &[&str] = &["image/jpeg", "image/png", "application/pdf"];

async fn upload_file(mut multipart: Multipart) -> Result<Json<UploadResponse>, AppError> {
    while let Some(field) = multipart.next_field().await? {
        let content_type = field.content_type()
            .ok_or(AppError::BadRequest("Missing content type"))?;

        // Validate content type
        if !ALLOWED_TYPES.contains(&content_type) {
            return Err(AppError::BadRequest("File type not allowed"));
        }

        let data = field.bytes().await?;

        // Validate size
        if data.len() > MAX_FILE_SIZE {
            return Err(AppError::BadRequest("File too large"));
        }

        // Generate safe filename
        let ext = match content_type {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "application/pdf" => "pdf",
            _ => return Err(AppError::BadRequest("Unknown type")),
        };
        let safe_name = format!("{}.{}", Uuid::new_v4(), ext);

        // Save file
        let path = format!("uploads/{}", safe_name);
        let mut file = File::create(&path).await?;
        file.write_all(&data).await?;

        return Ok(Json(UploadResponse { filename: safe_name }));
    }

    Err(AppError::BadRequest("No file provided"))
}
```

## CORS Configuration (Axum)

```rust
use tower_http::cors::{CorsLayer, Any};
use http::{HeaderValue, Method};

let cors = CorsLayer::new()
    .allow_origin("https://myapp.com".parse::<HeaderValue>().unwrap())
    .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
    .allow_headers([http::header::AUTHORIZATION, http::header::CONTENT_TYPE])
    .allow_credentials(true);

let app = Router::new()
    .route("/api/users", get(get_users))
    .layer(cors);
```

## Security Headers Middleware

```rust
use axum::{
    middleware::{self, Next},
    response::Response,
    http::Request,
};

async fn security_headers<B>(request: Request<B>, next: Next<B>) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();

    headers.insert("X-Content-Type-Options", "nosniff".parse().unwrap());
    headers.insert("X-Frame-Options", "DENY".parse().unwrap());
    headers.insert("X-XSS-Protection", "0".parse().unwrap());
    headers.insert("Referrer-Policy", "strict-origin-when-cross-origin".parse().unwrap());
    headers.insert("Content-Security-Policy", "default-src 'self'".parse().unwrap());
    headers.insert(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains".parse().unwrap()
    );

    response
}

// Apply to router
let app = Router::new()
    .route("/", get(index))
    .layer(middleware::from_fn(security_headers));
```

## Rate Limiting

```rust
use governor::{Quota, RateLimiter};
use nonzero_ext::nonzero;
use std::sync::Arc;

// Create rate limiter
let limiter = Arc::new(RateLimiter::direct(
    Quota::per_minute(nonzero!(10u32))
));

// Middleware
async fn rate_limit<B>(
    State(limiter): State<Arc<RateLimiter<...>>>,
    request: Request<B>,
    next: Next<B>
) -> Result<Response, StatusCode> {
    match limiter.check() {
        Ok(_) => Ok(next.run(request).await),
        Err(_) => Err(StatusCode::TOO_MANY_REQUESTS),
    }
}
```

## Secrets Management

```rust
use std::env;

#[derive(Clone)]
struct Config {
    jwt_secret: String,
    database_url: String,
    api_key: String,
}

impl Config {
    fn from_env() -> Result<Self, ConfigError> {
        Ok(Config {
            jwt_secret: env::var("JWT_SECRET")
                .map_err(|_| ConfigError::Missing("JWT_SECRET"))?,
            database_url: env::var("DATABASE_URL")
                .map_err(|_| ConfigError::Missing("DATABASE_URL"))?,
            api_key: env::var("API_KEY")
                .map_err(|_| ConfigError::Missing("API_KEY"))?,
        })
    }
}

// NEVER hardcode secrets
// const JWT_SECRET: &str = "hardcoded-secret";  // NEVER!
```

## Logging Security Events

```rust
use tracing::{info, warn};

fn log_login_attempt(username: &str, success: bool, ip: &str) {
    info!(
        user = username,
        success = success,
        ip = ip,
        "login attempt"
    );
}

fn log_access_denied(user_id: &str, resource: &str, ip: &str) {
    warn!(
        user_id = user_id,
        resource = resource,
        ip = ip,
        "access denied"
    );
}

// NEVER log sensitive data
// info!(password = password, "user data");  // NEVER!
```

## Unsafe Code Guidelines

```rust
// Minimize unsafe blocks
// Document why unsafe is necessary
// Encapsulate unsafe in safe abstractions

/// SAFETY: buffer is guaranteed to be valid UTF-8
/// because it was created from a valid String
unsafe fn process_buffer(buffer: &[u8]) -> &str {
    std::str::from_utf8_unchecked(buffer)
}

// Prefer safe alternatives
let s = std::str::from_utf8(buffer)?;  // Safe version
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `format!` in SQL query | SQL injection | Use query macros with bind |
| `|safe` filter on user input | XSS vulnerability | Sanitize with ammonia first |
| Hardcoded secrets | Secret exposure | Use environment variables |
| Excessive `unsafe` blocks | Memory safety bypass | Minimize and document unsafe |
| Ignoring `cargo audit` warnings | Known vulnerabilities | Update or replace dependencies |
| Weak JWT algorithms | Token forgery | Use HS256 minimum |
| `unwrap()` in handlers | Panic in production | Use proper error handling |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| cargo audit finds RUSTSEC | Vulnerable crate | Update with `cargo update` |
| JWT validation fails | Wrong algorithm/key | Check Algorithm enum and key |
| CORS error | Origin not configured | Add origin to CorsLayer |
| Password hash slow | Argon2 params too high | Adjust memory/iterations |
| SQLx compile error | Query doesn't match schema | Run `cargo sqlx prepare` |
| Template not escaping | Using `|safe` filter | Remove filter or sanitize input |

## Security Scanning Commands

```bash
# Vulnerability audit
cargo audit

# Policy check
cargo deny check

# Clippy security lints
cargo clippy -- -W clippy::all -W clippy::pedantic

# Check for secrets
gitleaks detect
trufflehog git file://.

# SAST with semgrep
semgrep --config=p/rust .
```

## Related Skills
- [OWASP Top 10:2025](../owasp-top-10/SKILL.md)
- [OWASP General](../owasp/SKILL.md)
- [Secrets Management](../secrets-management/SKILL.md)
- [Supply Chain Security](../supply-chain/SKILL.md)
