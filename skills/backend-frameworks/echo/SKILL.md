---
name: echo
description: |
  Echo Go web framework. Covers routing, middleware, binding, context,
  and WebSocket. Use for high-performance, minimalist Go APIs.

  USE WHEN: user mentions "echo", "labstack echo", "go echo framework",
  asks about "echo middleware", "echo context", "echo binding", "echo websocket",
  "high performance go api", "echo router"

  DO NOT USE FOR: Gin projects - use `gin` instead, Fiber projects - use `fiber` instead,
  Chi projects - use `chi` instead, non-Go backends
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Echo Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `echo` for comprehensive documentation.

## Basic Setup

```go
package main

import (
    "github.com/labstack/echo/v4"
    "net/http"
)

func main() {
    e := echo.New()

    e.GET("/", func(c echo.Context) error {
        return c.String(http.StatusOK, "Hello, World!")
    })

    e.Logger.Fatal(e.Start(":8080"))
}
```

## Routing

### Basic Routes

```go
e := echo.New()

e.GET("/users", listUsers)
e.GET("/users/:id", getUser)
e.POST("/users", createUser)
e.PUT("/users/:id", updateUser)
e.DELETE("/users/:id", deleteUser)

// Any method
e.Any("/any", handleAny)

// Match specific methods
e.Match([]string{"GET", "POST"}, "/multi", handler)
```

### Path Parameters

```go
// Single parameter
e.GET("/users/:id", func(c echo.Context) error {
    id := c.Param("id")
    return c.JSON(http.StatusOK, map[string]string{"id": id})
})

// Multiple parameters
e.GET("/users/:userId/posts/:postId", func(c echo.Context) error {
    userId := c.Param("userId")
    postId := c.Param("postId")
    return c.JSON(http.StatusOK, map[string]string{
        "userId": userId,
        "postId": postId,
    })
})
```

### Route Groups

```go
api := e.Group("/api")

v1 := api.Group("/v1")
v1.GET("/users", listUsersV1)
v1.POST("/users", createUserV1)

v2 := api.Group("/v2")
v2.GET("/users", listUsersV2)
v2.POST("/users", createUserV2)

// Group with middleware
admin := api.Group("/admin", adminMiddleware)
admin.GET("/stats", getStats)
```

## Context

### Request Data

```go
func handler(c echo.Context) error {
    // Path params
    id := c.Param("id")

    // Query params
    page := c.QueryParam("page")
    pageInt, _ := strconv.Atoi(c.QueryParam("page"))

    // Form data
    name := c.FormValue("name")

    // Headers
    auth := c.Request().Header.Get("Authorization")

    // Cookies
    cookie, _ := c.Cookie("session")

    return c.NoContent(http.StatusOK)
}
```

### Binding

```go
type CreateUserRequest struct {
    Name  string `json:"name" validate:"required"`
    Email string `json:"email" validate:"required,email"`
}

func createUser(c echo.Context) error {
    var req CreateUserRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }

    return c.JSON(http.StatusCreated, req)
}

// Query binding
type ListQuery struct {
    Page    int `query:"page"`
    PerPage int `query:"per_page"`
}

func listUsers(c echo.Context) error {
    var query ListQuery
    if err := c.Bind(&query); err != nil {
        return err
    }
    return c.JSON(http.StatusOK, query)
}
```

### Validation

```go
import "github.com/go-playground/validator/v10"

type CustomValidator struct {
    validator *validator.Validate
}

func (cv *CustomValidator) Validate(i interface{}) error {
    if err := cv.validator.Struct(i); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    return nil
}

func main() {
    e := echo.New()
    e.Validator = &CustomValidator{validator: validator.New()}

    e.POST("/users", createUser)
    e.Logger.Fatal(e.Start(":8080"))
}

func createUser(c echo.Context) error {
    var req CreateUserRequest
    if err := c.Bind(&req); err != nil {
        return err
    }
    if err := c.Validate(req); err != nil {
        return err
    }
    return c.JSON(http.StatusCreated, req)
}
```

## Middleware

### Built-in Middleware

```go
import (
    "github.com/labstack/echo/v4/middleware"
)

e := echo.New()

e.Use(middleware.Logger())
e.Use(middleware.Recover())
e.Use(middleware.RequestID())
e.Use(middleware.Gzip())

// CORS
e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
    AllowOrigins: []string{"https://example.com"},
    AllowMethods: []string{echo.GET, echo.POST, echo.PUT, echo.DELETE},
    AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAuthorization},
}))

// Rate limiter
e.Use(middleware.RateLimiter(middleware.NewRateLimiterMemoryStore(20)))
```

### Custom Middleware

```go
func TimingMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
    return func(c echo.Context) error {
        start := time.Now()
        err := next(c)
        duration := time.Since(start)
        c.Response().Header().Set("X-Response-Time", duration.String())
        return err
    }
}

e.Use(TimingMiddleware)
```

### Authentication Middleware

```go
func AuthMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
    return func(c echo.Context) error {
        auth := c.Request().Header.Get("Authorization")

        if auth == "" {
            return echo.NewHTTPError(http.StatusUnauthorized, "missing token")
        }

        if !strings.HasPrefix(auth, "Bearer ") {
            return echo.NewHTTPError(http.StatusUnauthorized, "invalid format")
        }

        token := auth[7:]
        user, err := validateToken(token)
        if err != nil {
            return echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
        }

        c.Set("user", user)
        return next(c)
    }
}

protected := e.Group("/api", AuthMiddleware)
protected.GET("/me", getMe)

func getMe(c echo.Context) error {
    user := c.Get("user").(*User)
    return c.JSON(http.StatusOK, user)
}
```

### JWT Middleware

```go
import "github.com/labstack/echo-jwt/v4"

e.Use(echojwt.WithConfig(echojwt.Config{
    SigningKey: []byte("secret"),
    NewClaimsFunc: func(c echo.Context) jwt.Claims {
        return new(jwtCustomClaims)
    },
}))
```

## Response

### Response Types

```go
// JSON
c.JSON(http.StatusOK, map[string]string{"message": "hello"})

// String
c.String(http.StatusOK, "Hello, World!")

// HTML
c.HTML(http.StatusOK, "<h1>Hello</h1>")

// XML
c.XML(http.StatusOK, data)

// Blob
c.Blob(http.StatusOK, "application/octet-stream", bytes)

// File
c.File("./static/file.txt")

// Redirect
c.Redirect(http.StatusMovedPermanently, "https://example.com")

// No Content
c.NoContent(http.StatusNoContent)
```

## WebSocket

```go
import (
    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool { return true },
}

e.GET("/ws", func(c echo.Context) error {
    ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
    if err != nil {
        return err
    }
    defer ws.Close()

    for {
        mt, msg, err := ws.ReadMessage()
        if err != nil {
            break
        }

        if err := ws.WriteMessage(mt, msg); err != nil {
            break
        }
    }
    return nil
})
```

## Error Handling

### HTTP Errors

```go
func getUser(c echo.Context) error {
    id := c.Param("id")
    user, err := findUser(id)
    if err != nil {
        return echo.NewHTTPError(http.StatusNotFound, "user not found")
    }
    return c.JSON(http.StatusOK, user)
}
```

### Custom Error Handler

```go
func customHTTPErrorHandler(err error, c echo.Context) {
    code := http.StatusInternalServerError
    message := "Internal Server Error"

    if he, ok := err.(*echo.HTTPError); ok {
        code = he.Code
        message = he.Message.(string)
    }

    c.Logger().Error(err)
    c.JSON(code, map[string]interface{}{
        "error":   http.StatusText(code),
        "message": message,
    })
}

e.HTTPErrorHandler = customHTTPErrorHandler
```

## Production Readiness

### Health Checks

```go
e.GET("/health", func(c echo.Context) error {
    return c.JSON(http.StatusOK, map[string]string{"status": "healthy"})
})

e.GET("/ready", func(c echo.Context) error {
    ctx, cancel := context.WithTimeout(c.Request().Context(), 2*time.Second)
    defer cancel()

    if err := db.PingContext(ctx); err != nil {
        return c.JSON(http.StatusServiceUnavailable, map[string]string{
            "status":   "not ready",
            "database": "disconnected",
        })
    }

    return c.JSON(http.StatusOK, map[string]string{
        "status":   "ready",
        "database": "connected",
    })
})
```

### Graceful Shutdown

```go
func main() {
    e := echo.New()
    e.GET("/", handler)

    go func() {
        if err := e.Start(":8080"); err != http.ErrServerClosed {
            e.Logger.Fatal("shutting down the server")
        }
    }()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := e.Shutdown(ctx); err != nil {
        e.Logger.Fatal(err)
    }
}
```

### Checklist

- [ ] Recovery middleware enabled
- [ ] CORS configured
- [ ] Rate limiting enabled
- [ ] Request validation
- [ ] Custom error handler
- [ ] Health/readiness endpoints
- [ ] Graceful shutdown
- [ ] Structured logging

## When NOT to Use This Skill

- **Gin projects** - Gin has different context and binding API
- **Fiber projects** - Fiber is Express-like with different patterns
- **Chi projects** - Chi is more stdlib-compatible
- **Simple stdlib servers** - Echo adds framework overhead
- **gRPC-only services** - Use gRPC framework directly

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Not returning from middleware | Handler executes anyway | Return early on auth failures |
| Using `c.JSON()` without status | Unclear response codes | Always specify status code first |
| Missing error handling | Panics in production | Use `echo.NewHTTPError()` |
| Global validator not set | No validation | Set `e.Validator` with custom validator |
| Not using groups | Flat route structure | Group routes with `e.Group()` |
| Ignoring context cancellation | Long-running requests | Check `c.Request().Context()` |

## Quick Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| Middleware not executing | Wrong position | Place before route registration |
| Validation not working | No validator set | Set `e.Validator` with go-playground/validator |
| CORS errors | Not configured | Use `middleware.CORS()` |
| Route not matching | Parameter mismatch | Check path parameter syntax `:id` |
| WebSocket handshake fails | Wrong upgrade header | Use gorilla/websocket upgrader |
| Panic on nil pointer | Missing error check | Check `c.Bind()` return value |

## Reference Documentation

- [Routing](quick-ref/routing.md)
- [Context](quick-ref/context.md)
- [Middleware](quick-ref/middleware.md)
