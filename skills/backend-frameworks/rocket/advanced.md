# Rocket Advanced Patterns

## Custom Request Guards

### Authentication Guard
```rust
struct User {
    id: u32,
    name: String,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for User {
    type Error = ();

    async fn from_request(request: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        let auth_header = request.headers().get_one("Authorization");

        match auth_header {
            Some(header) if header.starts_with("Bearer ") => {
                let token = &header[7..];
                match verify_token(token).await {
                    Ok(user) => Outcome::Success(user),
                    Err(_) => Outcome::Error((Status::Unauthorized, ())),
                }
            }
            _ => Outcome::Error((Status::Unauthorized, ())),
        }
    }
}

#[get("/me")]
fn get_me(user: User) -> Json<User> {
    Json(user)
}
```

### API Key Guard
```rust
use rocket::request::{FromRequest, Outcome, Request};
use rocket::http::Status;

struct ApiKey(String);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for ApiKey {
    type Error = &'static str;

    async fn from_request(request: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        match request.headers().get_one("X-API-Key") {
            Some(key) if is_valid_key(key) => Outcome::Success(ApiKey(key.to_string())),
            Some(_) => Outcome::Error((Status::Unauthorized, "Invalid API key")),
            None => Outcome::Error((Status::BadRequest, "Missing API key")),
        }
    }
}

#[get("/protected")]
fn protected(key: ApiKey) -> String {
    format!("Authenticated with key: {}", key.0)
}
```

## Database State

```rust
use rocket_db_pools::{Database, Connection};
use rocket_db_pools::sqlx::{self, PgPool};

#[derive(Database)]
#[database("main_db")]
struct MainDb(PgPool);

#[get("/users/<id>")]
async fn get_user(mut db: Connection<MainDb>, id: i32) -> Option<Json<User>> {
    sqlx::query_as!(User, "SELECT * FROM users WHERE id = $1", id)
        .fetch_optional(&mut **db)
        .await
        .ok()
        .flatten()
        .map(Json)
}

#[launch]
fn rocket() -> _ {
    rocket::build()
        .attach(MainDb::init())
        .mount("/api", routes![get_user])
}
```

## Custom Fairings

### Timing Fairing
```rust
use rocket::{fairing::{Fairing, Info, Kind}, Data, Request, Response};
use std::time::Instant;

struct TimingFairing;

#[rocket::async_trait]
impl Fairing for TimingFairing {
    fn info(&self) -> Info {
        Info {
            name: "Request Timing",
            kind: Kind::Request | Kind::Response,
        }
    }

    async fn on_request(&self, request: &mut Request<'_>, _: &mut Data<'_>) {
        request.local_cache(|| Instant::now());
    }

    async fn on_response<'r>(&self, request: &'r Request<'_>, response: &mut Response<'r>) {
        let start = request.local_cache(|| Instant::now());
        let duration = start.elapsed();
        response.set_raw_header("X-Response-Time", format!("{}ms", duration.as_millis()));
    }
}

#[launch]
fn rocket() -> _ {
    rocket::build()
        .attach(TimingFairing)
}
```

### CORS Fairing
```rust
use rocket::fairing::{Fairing, Info, Kind};
use rocket::http::Header;
use rocket::{Request, Response};

pub struct CORS;

#[rocket::async_trait]
impl Fairing for CORS {
    fn info(&self) -> Info {
        Info {
            name: "CORS",
            kind: Kind::Response,
        }
    }

    async fn on_response<'r>(&self, _request: &'r Request<'_>, response: &mut Response<'r>) {
        response.set_header(Header::new("Access-Control-Allow-Origin", "*"));
        response.set_header(Header::new("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE"));
        response.set_header(Header::new("Access-Control-Allow-Headers", "Content-Type, Authorization"));
    }
}

// OPTIONS handler for preflight
#[options("/<_..>")]
fn options() -> Status {
    Status::Ok
}
```

### Lifecycle Fairings
```rust
use rocket::fairing::AdHoc;

#[launch]
fn rocket() -> _ {
    rocket::build()
        .attach(AdHoc::on_liftoff("Liftoff", |_| Box::pin(async {
            println!("Rocket has launched!");
        })))
        .attach(AdHoc::on_shutdown("Shutdown", |_| Box::pin(async {
            println!("Shutting down...");
        })))
}
```

## Error Handling

### Error Catchers
```rust
use rocket::Request;
use rocket::serde::json::Json;

#[catch(404)]
fn not_found(req: &Request) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "error": "not_found",
        "path": req.uri().path().as_str()
    }))
}

#[catch(500)]
fn internal_error() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "error": "internal_server_error"
    }))
}

#[catch(401)]
fn unauthorized() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "error": "unauthorized"
    }))
}

#[launch]
fn rocket() -> _ {
    rocket::build()
        .register("/", catchers![not_found, internal_error, unauthorized])
}
```

### Result Responses
```rust
use rocket::response::status::{Created, NotFound, BadRequest};

#[get("/users/<id>")]
fn get_user(id: u32) -> Result<Json<User>, NotFound<String>> {
    find_user(id)
        .map(Json)
        .ok_or_else(|| NotFound(format!("User {} not found", id)))
}

#[post("/users", data = "<user>")]
fn create_user(user: Json<CreateUser>) -> Result<Created<Json<User>>, BadRequest<String>> {
    validate_user(&user)
        .map_err(|e| BadRequest(e.to_string()))?;

    let created = User::create(user.into_inner());
    Ok(Created::new("/users/1").body(Json(created)))
}
```

## Testing

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rocket::local::blocking::Client;
    use rocket::http::Status;

    fn client() -> Client {
        Client::tracked(rocket()).expect("valid rocket instance")
    }

    #[test]
    fn test_index() {
        let client = client();
        let response = client.get("/").dispatch();
        assert_eq!(response.status(), Status::Ok);
        assert_eq!(response.into_string().unwrap(), "Hello, World!");
    }

    #[test]
    fn test_get_user() {
        let client = client();
        let response = client.get("/users/1").dispatch();
        assert_eq!(response.status(), Status::Ok);
    }

    #[test]
    fn test_create_user() {
        let client = client();
        let response = client
            .post("/users")
            .header(ContentType::JSON)
            .body(r#"{"name":"Alice","email":"alice@example.com"}"#)
            .dispatch();
        assert_eq!(response.status(), Status::Created);
    }
}
```

## Production Configuration

### Rocket.toml
```toml
[default]
address = "0.0.0.0"
port = 8080
log_level = "normal"

[release]
address = "0.0.0.0"
port = 8080
log_level = "critical"
secret_key = "..."
```

### Health Checks
```rust
#[get("/health")]
fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "healthy" }))
}

#[get("/ready")]
async fn ready(db: Connection<MainDb>) -> Result<Json<serde_json::Value>, Status> {
    sqlx::query("SELECT 1")
        .execute(&mut **db)
        .await
        .map_err(|_| Status::ServiceUnavailable)?;

    Ok(Json(serde_json::json!({
        "status": "ready",
        "database": "connected"
    })))
}
```
