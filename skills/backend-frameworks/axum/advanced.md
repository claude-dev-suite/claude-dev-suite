# Axum - Advanced Patterns

## Authentication Middleware

```rust
use axum::{
    middleware::{self, Next},
    extract::{Request, State},
    response::Response,
    http::StatusCode,
};

#[derive(Clone)]
struct CurrentUser {
    id: u32,
    name: String,
}

async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|h| h.to_str().ok());

    match auth_header {
        Some(token) if token.starts_with("Bearer ") => {
            let token = &token[7..];
            match verify_token(token, &state).await {
                Ok(user) => {
                    request.extensions_mut().insert(user);
                    Ok(next.run(request).await)
                }
                Err(_) => Err(StatusCode::UNAUTHORIZED),
            }
        }
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

// Extract user in handler
async fn protected_handler(
    Extension(user): Extension<CurrentUser>,
) -> String {
    format!("Hello, {}", user.name)
}

let protected_routes = Router::new()
    .route("/me", get(protected_handler))
    .layer(middleware::from_fn_with_state(state.clone(), auth_middleware));
```

## WebSocket

```rust
use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::Response,
};

async fn ws_handler(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    while let Some(msg) = socket.recv().await {
        match msg {
            Ok(Message::Text(text)) => {
                if socket.send(Message::Text(format!("Echo: {}", text))).await.is_err() {
                    break;
                }
            }
            Ok(Message::Close(_)) => break,
            _ => {}
        }
    }
}

let app = Router::new().route("/ws", get(ws_handler));
```

## Graceful Shutdown

```rust
use tokio::signal;

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", get(index));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("Shutdown signal received");
}
```

## Custom Timing Middleware

```rust
use axum::{
    middleware::{self, Next},
    extract::Request,
    response::Response,
};
use std::time::Instant;

async fn timing_middleware(request: Request, next: Next) -> Response {
    let start = Instant::now();
    let response = next.run(request).await;
    let duration = start.elapsed();
    tracing::info!("Request completed in {:?}", duration);
    response
}

let app = Router::new()
    .route("/", get(index))
    .layer(middleware::from_fn(timing_middleware));
```

## Error Handling

```rust
use axum::{response::{IntoResponse, Response}, http::StatusCode};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Internal error")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Internal error".into()),
        };

        (status, Json(serde_json::json!({ "error": message }))).into_response()
    }
}

// Usage
async fn get_user(Path(id): Path<u32>) -> Result<Json<User>, AppError> {
    let user = find_user(id).await.ok_or_else(|| AppError::NotFound(format!("User {}", id)))?;
    Ok(Json(user))
}
```

## Typed Header Extraction

```rust
use axum_extra::typed_header::TypedHeader;
use axum_extra::headers::Authorization;
use axum_extra::headers::authorization::Bearer;

async fn protected(TypedHeader(auth): TypedHeader<Authorization<Bearer>>) -> String {
    format!("Token: {}", auth.token())
}
```
