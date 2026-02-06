---
name: fiber
description: |
  Fiber Go web framework inspired by Express. Covers routing, middleware,
  context, WebSocket, and prefork. Use for Express-like Go development.

  USE WHEN: user mentions "fiber", "gofiber", "express-like go", "fasthttp go",
  asks about "fiber middleware", "fiber context", "fiber prefork", "fiber websocket",
  "go express", "fast go framework"

  DO NOT USE FOR: Gin projects - use `gin` instead, Echo projects - use `echo` instead,
  Chi projects - use `chi` instead, standard net/http compatibility required
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Fiber Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for validation with go-playground/validator, WebSocket setup, custom error handling, prefork mode, and graceful shutdown.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `fiber` for comprehensive documentation.

## Basic Setup

```go
package main

import "github.com/gofiber/fiber/v2"

func main() {
    app := fiber.New()

    app.Get("/", func(c *fiber.Ctx) error {
        return c.SendString("Hello, World!")
    })

    app.Listen(":8080")
}
```

## Configuration

```go
app := fiber.New(fiber.Config{
    Prefork:       true,               // Multiple processes
    StrictRouting: true,               // /foo != /foo/
    CaseSensitive: true,               // /Foo != /foo
    BodyLimit:     4 * 1024 * 1024,    // 4MB
    ReadTimeout:   10 * time.Second,
    WriteTimeout:  10 * time.Second,
})
```

## Routing

```go
app.Get("/users", listUsers)
app.Get("/users/:id", getUser)
app.Post("/users", createUser)
app.Put("/users/:id", updateUser)
app.Delete("/users/:id", deleteUser)

// Path parameters
app.Get("/users/:id", func(c *fiber.Ctx) error {
    id := c.Params("id")
    return c.JSON(fiber.Map{"id": id})
})

// Optional parameter
app.Get("/users/:name?", func(c *fiber.Ctx) error {
    name := c.Params("name", "anonymous")
    return c.JSON(fiber.Map{"name": name})
})

// Route groups
api := app.Group("/api")
v1 := api.Group("/v1")
v1.Get("/users", listUsersV1)
```

## Context - Request Data

```go
app.Post("/users", func(c *fiber.Ctx) error {
    // Path params
    id := c.Params("id")
    idInt, _ := c.ParamsInt("id")

    // Query params
    page := c.Query("page", "1")
    pageInt := c.QueryInt("page", 1)

    // Headers
    auth := c.Get("Authorization")

    // Cookies
    session := c.Cookies("session_id")

    return c.SendStatus(fiber.StatusOK)
})
```

## Body Parsing

```go
type CreateUserRequest struct {
    Name  string `json:"name"`
    Email string `json:"email"`
}

app.Post("/users", func(c *fiber.Ctx) error {
    var req CreateUserRequest
    if err := c.BodyParser(&req); err != nil {
        return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
            "error": err.Error(),
        })
    }
    return c.Status(fiber.StatusCreated).JSON(req)
})
```

## Middleware

```go
import (
    "github.com/gofiber/fiber/v2/middleware/logger"
    "github.com/gofiber/fiber/v2/middleware/recover"
    "github.com/gofiber/fiber/v2/middleware/cors"
    "github.com/gofiber/fiber/v2/middleware/limiter"
)

app.Use(recover.New())
app.Use(logger.New())

app.Use(cors.New(cors.Config{
    AllowOrigins: "https://example.com",
    AllowMethods: "GET,POST,PUT,DELETE",
}))

app.Use(limiter.New(limiter.Config{
    Max:        100,
    Expiration: 1 * time.Minute,
}))
```

## Health Checks

```go
app.Get("/health", func(c *fiber.Ctx) error {
    return c.JSON(fiber.Map{"status": "healthy"})
})

app.Get("/ready", func(c *fiber.Ctx) error {
    if err := db.Ping(); err != nil {
        return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
            "status": "not ready",
        })
    }
    return c.JSON(fiber.Map{"status": "ready"})
})
```

## When NOT to Use This Skill

- **Gin projects** - Gin has different context API
- **Echo projects** - Echo has different middleware patterns
- **Chi projects** - Chi is stdlib-compatible
- **Standard net/http required** - Fiber uses fasthttp, not net/http
- **gRPC services** - Fiber doesn't support gRPC

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Not calling `c.Next()` in middleware | Breaks middleware chain | Always call `c.Next()` unless stopping |
| Using `c.Body()` multiple times | Body is consumed | Store body in variable first |
| Missing error handling | Silent failures | Check `BodyParser()` return value |
| Not setting Prefork carefully | May cause issues with state | Only use Prefork without shared state |
| No rate limiting | DDoS vulnerability | Use `limiter` middleware |

## Quick Troubleshooting

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| Route not found | Wrong method or path | Check exact route registration |
| Body parsing fails | Wrong content-type | Ensure `Content-Type` header is correct |
| CORS errors | Not configured | Use `cors.New()` middleware |
| Middleware not executing | Wrong order | Place before route handlers |
| Prefork issues | Shared state problems | Avoid shared mutable state with Prefork |

## Production Checklist

- [ ] Recovery middleware enabled
- [ ] CORS configured
- [ ] Rate limiting enabled
- [ ] Request body size limit set
- [ ] Timeouts configured
- [ ] Structured logging
- [ ] Health/readiness endpoints
- [ ] Graceful shutdown
- [ ] Input validation

## Reference Documentation

- [Routing](quick-ref/routing.md)
- [Context](quick-ref/context.md)
- [Middleware](quick-ref/middleware.md)
