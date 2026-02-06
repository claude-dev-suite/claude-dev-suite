---
name: chi
description: |
  Chi lightweight Go HTTP router. Covers routing, middleware, context,
  and patterns. Use for idiomatic, stdlib-compatible Go APIs.

  USE WHEN: user mentions "chi", "go-chi", "lightweight go router", "stdlib go router",
  asks about "chi middleware", "chi router", "chi context", "idiomatic go api",
  "net/http compatible router", "chi patterns"

  DO NOT USE FOR: Gin projects - use `gin` instead, Echo projects - use `echo` instead,
  Fiber projects - use `fiber` instead, non-Go backends
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Chi Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `chi` for comprehensive documentation.

## Basic Setup

```go
package main

import (
    "net/http"
    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
)

func main() {
    r := chi.NewRouter()

    r.Use(middleware.Logger)
    r.Use(middleware.Recoverer)

    r.Get("/", func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte("Hello, World!"))
    })

    http.ListenAndServe(":8080", r)
}
```

## Routing

### Basic Routes

```go
r := chi.NewRouter()

r.Get("/users", listUsers)
r.Get("/users/{id}", getUser)
r.Post("/users", createUser)
r.Put("/users/{id}", updateUser)
r.Delete("/users/{id}", deleteUser)

// Method not allowed handler
r.MethodNotAllowed(methodNotAllowedHandler)

// Not found handler
r.NotFound(notFoundHandler)
```

### Path Parameters

```go
r.Get("/users/{userID}", func(w http.ResponseWriter, r *http.Request) {
    userID := chi.URLParam(r, "userID")
    json.NewEncoder(w).Encode(map[string]string{"id": userID})
})

// Regex constraints
r.Get("/articles/{date:\\d{4}-\\d{2}-\\d{2}}", getArticleByDate)

// Catch-all
r.Get("/files/*", serveFiles)
```

### Route Groups

```go
r := chi.NewRouter()

r.Route("/api", func(r chi.Router) {
    r.Route("/v1", func(r chi.Router) {
        r.Get("/users", listUsersV1)
        r.Post("/users", createUserV1)
    })

    r.Route("/v2", func(r chi.Router) {
        r.Get("/users", listUsersV2)
        r.Post("/users", createUserV2)
    })
})
```

### Subrouters

```go
r := chi.NewRouter()

// Mount subrouter
apiRouter := chi.NewRouter()
apiRouter.Get("/users", listUsers)
apiRouter.Post("/users", createUser)

r.Mount("/api/v1", apiRouter)
```

## Context

### Request Context

```go
func getUser(w http.ResponseWriter, r *http.Request) {
    // Path params
    userID := chi.URLParam(r, "userID")

    // Query params
    page := r.URL.Query().Get("page")

    // Headers
    auth := r.Header.Get("Authorization")

    // Context values
    user := r.Context().Value("user").(*User)

    json.NewEncoder(w).Encode(user)
}
```

### Context with Values

```go
func UserContext(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        userID := chi.URLParam(r, "userID")
        user, err := findUser(userID)
        if err != nil {
            http.Error(w, "User not found", http.StatusNotFound)
            return
        }

        ctx := context.WithValue(r.Context(), "user", user)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

r.Route("/users/{userID}", func(r chi.Router) {
    r.Use(UserContext)
    r.Get("/", getUser)
    r.Put("/", updateUser)
})
```

## Middleware

### Built-in Middleware

```go
import "github.com/go-chi/chi/v5/middleware"

r := chi.NewRouter()

r.Use(middleware.RequestID)
r.Use(middleware.RealIP)
r.Use(middleware.Logger)
r.Use(middleware.Recoverer)
r.Use(middleware.Compress(5))
r.Use(middleware.Timeout(60 * time.Second))
r.Use(middleware.Throttle(100))
r.Use(middleware.Heartbeat("/ping"))
```

### Custom Middleware

```go
func TimingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next.ServeHTTP(w, r)
        duration := time.Since(start)
        log.Printf("%s %s %v", r.Method, r.URL.Path, duration)
    })
}

r.Use(TimingMiddleware)
```

### Authentication Middleware

```go
func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        auth := r.Header.Get("Authorization")

        if auth == "" {
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
            return
        }

        if !strings.HasPrefix(auth, "Bearer ") {
            http.Error(w, "Invalid token format", http.StatusUnauthorized)
            return
        }

        token := auth[7:]
        user, err := validateToken(token)
        if err != nil {
            http.Error(w, "Invalid token", http.StatusUnauthorized)
            return
        }

        ctx := context.WithValue(r.Context(), "user", user)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

r.Route("/api", func(r chi.Router) {
    r.Use(AuthMiddleware)
    r.Get("/me", getMe)
})

func getMe(w http.ResponseWriter, r *http.Request) {
    user := r.Context().Value("user").(*User)
    json.NewEncoder(w).Encode(user)
}
```

### CORS Middleware

```go
import "github.com/go-chi/cors"

r.Use(cors.Handler(cors.Options{
    AllowedOrigins:   []string{"https://example.com"},
    AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
    AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
    AllowCredentials: true,
    MaxAge:           300,
}))
```

## Response Helpers

### render Package

```go
import "github.com/go-chi/render"

type UserResponse struct {
    ID    string `json:"id"`
    Name  string `json:"name"`
    Email string `json:"email"`
}

func (u *UserResponse) Render(w http.ResponseWriter, r *http.Request) error {
    return nil
}

func getUser(w http.ResponseWriter, r *http.Request) {
    user := &UserResponse{
        ID:    "1",
        Name:  "Alice",
        Email: "alice@example.com",
    }
    render.JSON(w, r, user)
}

// Error response
type ErrResponse struct {
    Err            error  `json:"-"`
    HTTPStatusCode int    `json:"-"`
    StatusText     string `json:"status"`
    ErrorText      string `json:"error,omitempty"`
}

func (e *ErrResponse) Render(w http.ResponseWriter, r *http.Request) error {
    render.Status(r, e.HTTPStatusCode)
    return nil
}

func ErrNotFound(err error) render.Renderer {
    return &ErrResponse{
        Err:            err,
        HTTPStatusCode: http.StatusNotFound,
        StatusText:     "Resource not found",
        ErrorText:      err.Error(),
    }
}
```

### Manual JSON Response

```go
func respond(w http.ResponseWriter, status int, data interface{}) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(data)
}

func getUser(w http.ResponseWriter, r *http.Request) {
    user := User{ID: "1", Name: "Alice"}
    respond(w, http.StatusOK, user)
}
```

## Error Handling

```go
type APIError struct {
    StatusCode int    `json:"-"`
    Message    string `json:"message"`
    Details    string `json:"details,omitempty"`
}

func (e *APIError) Error() string {
    return e.Message
}

func errorHandler(w http.ResponseWriter, r *http.Request, err error) {
    var apiErr *APIError
    if errors.As(err, &apiErr) {
        respond(w, apiErr.StatusCode, apiErr)
        return
    }

    respond(w, http.StatusInternalServerError, map[string]string{
        "message": "Internal server error",
    })
}

func getUser(w http.ResponseWriter, r *http.Request) {
    userID := chi.URLParam(r, "userID")
    user, err := findUser(userID)
    if err != nil {
        errorHandler(w, r, &APIError{
            StatusCode: http.StatusNotFound,
            Message:    "User not found",
        })
        return
    }
    respond(w, http.StatusOK, user)
}
```

## Patterns

### Resource Pattern

```go
type UsersResource struct {
    db *sql.DB
}

func (rs UsersResource) Routes() chi.Router {
    r := chi.NewRouter()

    r.Get("/", rs.List)
    r.Post("/", rs.Create)

    r.Route("/{id}", func(r chi.Router) {
        r.Use(rs.UserCtx)
        r.Get("/", rs.Get)
        r.Put("/", rs.Update)
        r.Delete("/", rs.Delete)
    })

    return r
}

func (rs UsersResource) UserCtx(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        id := chi.URLParam(r, "id")
        user, err := rs.db.FindUser(id)
        if err != nil {
            http.Error(w, "User not found", http.StatusNotFound)
            return
        }
        ctx := context.WithValue(r.Context(), "user", user)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

// Mount resource
r.Mount("/users", UsersResource{db: db}.Routes())
```

## Production Readiness

### Health Checks

```go
r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
    respond(w, http.StatusOK, map[string]string{"status": "healthy"})
})

r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()

    if err := db.PingContext(ctx); err != nil {
        respond(w, http.StatusServiceUnavailable, map[string]string{
            "status":   "not ready",
            "database": "disconnected",
        })
        return
    }

    respond(w, http.StatusOK, map[string]string{
        "status":   "ready",
        "database": "connected",
    })
})
```

### Graceful Shutdown

```go
func main() {
    r := chi.NewRouter()
    r.Get("/", handler)

    srv := &http.Server{
        Addr:    ":8080",
        Handler: r,
    }

    go func() {
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            log.Fatal(err)
        }
    }()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := srv.Shutdown(ctx); err != nil {
        log.Fatal(err)
    }
}
```

### Checklist

- [ ] Recoverer middleware enabled
- [ ] CORS configured
- [ ] Request timeout set
- [ ] Throttling enabled
- [ ] Health/readiness endpoints
- [ ] Graceful shutdown
- [ ] Structured logging
- [ ] Context-based values

## When NOT to Use This Skill

- **Gin projects** - Gin has more built-in features
- **Echo projects** - Echo has different context patterns
- **Fiber projects** - Fiber is Express-like and faster
- **Need built-in validation** - Chi is minimal, use Gin or Echo
- **WebSocket-heavy apps** - Other frameworks have better support

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Not using `chi.URLParam()` | Manual param extraction | Use `chi.URLParam(r, "id")` |
| Missing middleware order | Wrong execution sequence | Order middleware carefully |
| Not using context for values | Global state issues | Use `context.WithValue()` |
| Forgetting to call `next.ServeHTTP()` | Handler chain breaks | Always call `next.ServeHTTP(w, r)` |
| No structured error handling | Inconsistent responses | Create helper functions |
| Using subrouters incorrectly | Routes don't match | Use `.Route()` or `.Mount()` properly |

## Quick Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| Route not matching | Wrong path pattern | Check regex constraints and params |
| Middleware not executing | Order issue | Place middleware before routes |
| Context value is nil | Not set properly | Use `context.WithValue()` in middleware |
| CORS errors | Not configured | Use `cors.Handler()` from go-chi/cors |
| Panic on missing param | No default | Check `chi.URLParam()` return value |
| 405 Method Not Allowed | Wrong HTTP method | Verify route method matches request |

## Reference Documentation

- [Routing](quick-ref/routing.md)
- [Middleware](quick-ref/middleware.md)
- [Patterns](quick-ref/patterns.md)
