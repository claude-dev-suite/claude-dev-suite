# Actix-web Advanced Patterns

## Custom Timing Middleware

```rust
use actix_web::{dev::{Service, ServiceRequest, ServiceResponse, Transform}, Error};
use futures::future::{ok, Ready, LocalBoxFuture};
use std::time::Instant;

pub struct Timing;

impl<S, B> Transform<S, ServiceRequest> for Timing
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Transform = TimingMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(TimingMiddleware { service })
    }
}

pub struct TimingMiddleware<S> {
    service: S,
}

impl<S, B> Service<ServiceRequest> for TimingMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(&self, cx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let start = Instant::now();
        let fut = self.service.call(req);

        Box::pin(async move {
            let res = fut.await?;
            let elapsed = start.elapsed();
            log::info!("Request completed in {:?}", elapsed);
            Ok(res)
        })
    }
}

// Usage
App::new().wrap(Timing)
```

---

## Authentication Middleware

```rust
use actix_web::{dev::ServiceRequest, Error, HttpMessage};
use actix_web_httpauth::extractors::bearer::BearerAuth;
use actix_web_httpauth::middleware::HttpAuthentication;

async fn validator(req: ServiceRequest, credentials: BearerAuth) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    let token = credentials.token();
    match verify_token(token).await {
        Ok(user) => {
            req.extensions_mut().insert(user);
            Ok(req)
        }
        Err(_) => Err((actix_web::error::ErrorUnauthorized("Invalid token"), req)),
    }
}

App::new()
    .wrap(HttpAuthentication::bearer(validator))
```

---

## Custom Error Type

```rust
use actix_web::{error::ResponseError, HttpResponse};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Resource not found: {0}")]
    NotFound(String),
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Internal server error")]
    InternalError(#[from] anyhow::Error),
}

impl ResponseError for AppError {
    fn error_response(&self) -> HttpResponse {
        match self {
            AppError::NotFound(msg) => {
                HttpResponse::NotFound().json(serde_json::json!({
                    "error": "not_found",
                    "message": msg
                }))
            }
            AppError::BadRequest(msg) => {
                HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "bad_request",
                    "message": msg
                }))
            }
            AppError::Unauthorized => {
                HttpResponse::Unauthorized().json(serde_json::json!({
                    "error": "unauthorized"
                }))
            }
            AppError::InternalError(_) => {
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "internal_error"
                }))
            }
        }
    }
}

// Usage in handlers
#[get("/users/{id}")]
async fn get_user(path: web::Path<u32>) -> Result<HttpResponse, AppError> {
    let id = path.into_inner();
    let user = find_user(id).await.ok_or_else(|| AppError::NotFound(format!("User {}", id)))?;
    Ok(HttpResponse::Ok().json(user))
}
```

---

## WebSocket Actor

```rust
use actix_web::{web, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use actix::{Actor, StreamHandler};

struct MyWs;

impl Actor for MyWs {
    type Context = ws::WebsocketContext<Self>;
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for MyWs {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => ctx.pong(&msg),
            Ok(ws::Message::Text(text)) => ctx.text(format!("Echo: {}", text)),
            Ok(ws::Message::Close(reason)) => {
                ctx.close(reason);
                ctx.stop();
            }
            _ => (),
        }
    }
}

async fn ws_route(req: HttpRequest, stream: web::Payload) -> Result<HttpResponse, actix_web::Error> {
    ws::start(MyWs, &req, stream)
}

App::new().route("/ws", web::get().to(ws_route))
```

---

## Graceful Shutdown

```rust
use tokio::signal;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let server = HttpServer::new(|| {
        App::new()
            .service(hello)
    })
    .bind("127.0.0.1:8080")?
    .shutdown_timeout(30)
    .run();

    let server_handle = server.handle();

    tokio::spawn(async move {
        signal::ctrl_c().await.expect("Failed to listen for ctrl-c");
        server_handle.stop(true).await;
    });

    server.await
}
```

---

## CORS Configuration

```rust
use actix_cors::Cors;

App::new()
    .wrap(
        Cors::default()
            .allowed_origin("https://example.com")
            .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
            .allowed_headers(vec![header::AUTHORIZATION, header::CONTENT_TYPE])
            .max_age(3600)
    )
```
