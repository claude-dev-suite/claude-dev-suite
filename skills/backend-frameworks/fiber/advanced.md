# Fiber Advanced Patterns

## Validation with go-playground/validator

```go
import "github.com/go-playground/validator/v10"

var validate = validator.New()

type CreateUserRequest struct {
    Name  string `json:"name" validate:"required,min=3,max=100"`
    Email string `json:"email" validate:"required,email"`
    Age   int    `json:"age" validate:"gte=0,lte=130"`
}

app.Post("/users", func(c *fiber.Ctx) error {
    var req CreateUserRequest
    if err := c.BodyParser(&req); err != nil {
        return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
            "error": "invalid JSON",
        })
    }

    if err := validate.Struct(req); err != nil {
        return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
            "error":   "validation failed",
            "details": err.Error(),
        })
    }

    return c.Status(fiber.StatusCreated).JSON(req)
})
```

## WebSocket

```go
import "github.com/gofiber/websocket/v2"

app.Use("/ws", func(c *fiber.Ctx) error {
    if websocket.IsWebSocketUpgrade(c) {
        c.Locals("allowed", true)
        return c.Next()
    }
    return fiber.ErrUpgradeRequired
})

app.Get("/ws/:id", websocket.New(func(c *websocket.Conn) {
    id := c.Params("id")
    log.Printf("Client %s connected", id)

    for {
        mt, msg, err := c.ReadMessage()
        if err != nil {
            log.Println("read:", err)
            break
        }

        log.Printf("recv: %s", msg)

        if err := c.WriteMessage(mt, msg); err != nil {
            log.Println("write:", err)
            break
        }
    }
}))
```

## Custom Error Handling

```go
type AppError struct {
    Code    int    `json:"code"`
    Message string `json:"message"`
}

func (e *AppError) Error() string {
    return e.Message
}

func customErrorHandler(c *fiber.Ctx, err error) error {
    code := fiber.StatusInternalServerError
    message := "Internal Server Error"

    if e, ok := err.(*fiber.Error); ok {
        code = e.Code
        message = e.Message
    }

    if e, ok := err.(*AppError); ok {
        code = e.Code
        message = e.Message
    }

    return c.Status(code).JSON(fiber.Map{
        "error": message,
    })
}

app := fiber.New(fiber.Config{
    ErrorHandler: customErrorHandler,
})

// Usage
app.Get("/users/:id", func(c *fiber.Ctx) error {
    user, err := findUser(c.Params("id"))
    if err != nil {
        return &AppError{
            Code:    fiber.StatusNotFound,
            Message: "user not found",
        }
    }
    return c.JSON(user)
})
```

## Prefork Mode

```go
app := fiber.New(fiber.Config{
    Prefork: true,
})

// Check if running in prefork child
if fiber.IsChild() {
    log.Printf("Worker %d started", os.Getpid())
}

app.Listen(":8080")
```

## Authentication Middleware

```go
func AuthMiddleware(c *fiber.Ctx) error {
    auth := c.Get("Authorization")

    if auth == "" {
        return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
            "error": "missing authorization header",
        })
    }

    if !strings.HasPrefix(auth, "Bearer ") {
        return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
            "error": "invalid authorization format",
        })
    }

    token := auth[7:]
    user, err := validateToken(token)
    if err != nil {
        return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
            "error": "invalid token",
        })
    }

    c.Locals("user", user)
    return c.Next()
}

// Apply to group
protected := app.Group("/api", AuthMiddleware)
protected.Get("/me", getMe)

// Access user in handler
func getMe(c *fiber.Ctx) error {
    user := c.Locals("user").(*User)
    return c.JSON(user)
}
```

## Graceful Shutdown

```go
func main() {
    app := fiber.New()

    app.Get("/", func(c *fiber.Ctx) error {
        return c.SendString("Hello")
    })

    go func() {
        if err := app.Listen(":8080"); err != nil {
            log.Panic(err)
        }
    }()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    log.Println("Shutting down...")

    if err := app.ShutdownWithTimeout(30 * time.Second); err != nil {
        log.Fatal("Server forced to shutdown:", err)
    }

    log.Println("Server exited")
}
```

## Production Readiness

### Health Checks
```go
app.Get("/health", func(c *fiber.Ctx) error {
    return c.JSON(fiber.Map{"status": "healthy"})
})

app.Get("/ready", func(c *fiber.Ctx) error {
    ctx, cancel := context.WithTimeout(c.Context(), 2*time.Second)
    defer cancel()

    if err := db.PingContext(ctx); err != nil {
        return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
            "status":   "not ready",
            "database": "disconnected",
        })
    }

    return c.JSON(fiber.Map{
        "status":   "ready",
        "database": "connected",
    })
})
```

### Structured Logging
```go
app.Use(logger.New(logger.Config{
    Format:     `{"time":"${time}","status":${status},"latency":"${latency}","ip":"${ip}","method":"${method}","path":"${path}"}` + "\n",
    TimeFormat: time.RFC3339,
    Output:     os.Stdout,
}))
```

### Built-in Middleware
```go
import (
    "github.com/gofiber/fiber/v2/middleware/logger"
    "github.com/gofiber/fiber/v2/middleware/recover"
    "github.com/gofiber/fiber/v2/middleware/cors"
    "github.com/gofiber/fiber/v2/middleware/compress"
    "github.com/gofiber/fiber/v2/middleware/limiter"
)

app.Use(recover.New())
app.Use(logger.New())
app.Use(compress.New())

app.Use(cors.New(cors.Config{
    AllowOrigins: "https://example.com",
    AllowMethods: "GET,POST,PUT,DELETE",
    AllowHeaders: "Origin,Content-Type,Authorization",
}))

app.Use(limiter.New(limiter.Config{
    Max:        100,
    Expiration: 1 * time.Minute,
}))
```

### Custom Timing Middleware
```go
func TimingMiddleware(c *fiber.Ctx) error {
    start := time.Now()

    err := c.Next()

    duration := time.Since(start)
    c.Set("X-Response-Time", duration.String())

    return err
}

app.Use(TimingMiddleware)
```

### Query Parsing
```go
type ListUsersQuery struct {
    Page    int    `query:"page"`
    PerPage int    `query:"per_page"`
    Sort    string `query:"sort"`
}

app.Get("/users", func(c *fiber.Ctx) error {
    var query ListUsersQuery
    if err := c.QueryParser(&query); err != nil {
        return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
            "error": err.Error(),
        })
    }

    if query.Page == 0 {
        query.Page = 1
    }
    if query.PerPage == 0 {
        query.PerPage = 20
    }

    return c.JSON(fiber.Map{
        "page":     query.Page,
        "per_page": query.PerPage,
    })
})
```
