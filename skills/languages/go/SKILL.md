---
name: go
description: |
  Go programming language. Covers goroutines, channels, interfaces, error handling,
  and modules. Use for building concurrent, high-performance backend services.

  USE WHEN: user mentions "go", "golang", "goroutines", "channels", asks about
  "concurrency", "select statement", "interfaces", "error handling", "go modules"

  DO NOT USE FOR: Gin/Fiber/Echo frameworks - use framework-specific skills
  DO NOT USE FOR: GORM - use ORM-specific skill
  DO NOT USE FOR: gRPC - use API design skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Go Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for concurrency patterns (worker pool, semaphore, fan-out/fan-in), production readiness, structured logging, graceful shutdown, context usage, health checks, testing patterns, HTTP client best practices, and database connection pooling.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `go` for comprehensive documentation.

## Goroutines and Concurrency

### Basic Goroutine

```go
func sayHello(name string) {
    fmt.Printf("Hello, %s!\n", name)
}

func main() {
    go sayHello("World")  // Run concurrently
    time.Sleep(100 * time.Millisecond)
}
```

### Core Principle

> "Do not communicate by sharing memory; instead, share memory by communicating."

---

## Channels

### Unbuffered Channel

```go
c := make(chan int)  // Unbuffered channel

go func() {
    result := compute()
    c <- result  // Send - blocks until received
}()

value := <-c  // Receive - blocks until sent
```

### Buffered Channel

```go
ch := make(chan int, 10)  // Buffer size 10

ch <- 1  // Non-blocking (if buffer not full)
ch <- 2

value := <-ch
```

### Channel Direction

```go
func send(ch chan<- int, value int) { ch <- value }   // Send-only
func receive(ch <-chan int) int { return <-ch }       // Receive-only
```

### Select Statement

```go
select {
case msg := <-ch1:
    fmt.Println("Received from ch1:", msg)
case ch2 <- value:
    fmt.Println("Sent to ch2")
case <-time.After(5 * time.Second):
    fmt.Println("Timeout")
default:
    fmt.Println("No communication ready")
}
```

---

## Interfaces

### Interface Definition

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

// Embedded interfaces
type ReadWriter interface {
    Reader
    Writer
}
```

### Implicit Implementation

```go
type MyReader struct {
    data []byte
    pos  int
}

// No "implements" keyword needed
func (r *MyReader) Read(p []byte) (n int, err error) {
    if r.pos >= len(r.data) {
        return 0, io.EOF
    }
    n = copy(p, r.data[r.pos:])
    r.pos += n
    return n, nil
}
```

### Type Assertion and Switch

```go
// Safe check
str, ok := value.(string)
if ok {
    fmt.Printf("string value: %q\n", str)
}

// Type switch
switch v := value.(type) {
case bool:
    fmt.Printf("boolean %t\n", v)
case int:
    fmt.Printf("integer %d\n", v)
default:
    fmt.Printf("unexpected type %T\n", v)
}
```

---

## Error Handling

### Standard Pattern

```go
func doSomething() error {
    if err := step1(); err != nil {
        return fmt.Errorf("step1 failed: %w", err)
    }
    return nil
}
```

### Custom Error Types

```go
type PathError struct {
    Op   string
    Path string
    Err  error
}

func (e *PathError) Error() string {
    return e.Op + " " + e.Path + ": " + e.Err.Error()
}

func (e *PathError) Unwrap() error {
    return e.Err
}
```

### Error Wrapping (Go 1.13+)

```go
// Wrap error with context
return fmt.Errorf("failed to open config: %w", err)

// Check wrapped errors
if errors.Is(err, os.ErrNotExist) {
    // Handle file not found
}

// Get underlying error type
var pathErr *os.PathError
if errors.As(err, &pathErr) {
    fmt.Println("Path:", pathErr.Path)
}
```

---

## Structs and Methods

```go
type User struct {
    ID    int64  `json:"id"`
    Name  string `json:"name"`
    Email string `json:"email"`
}

// Value receiver - cannot modify original
func (u User) FullName() string { return u.Name }

// Pointer receiver - can modify original
func (u *User) SetName(name string) { u.Name = name }

// Constructor pattern
func NewUser(name, email string) *User {
    return &User{
        ID:    generateID(),
        Name:  name,
        Email: email,
    }
}
```

---

## Generics (Go 1.18+)

```go
func Map[T, U any](slice []T, fn func(T) U) []U {
    result := make([]U, len(slice))
    for i, v := range slice {
        result[i] = fn(v)
    }
    return result
}

type Stack[T any] struct {
    items []T
}

func (s *Stack[T]) Push(item T) {
    s.items = append(s.items, item)
}

// Type constraints
type Number interface {
    ~int | ~int32 | ~int64 | ~float32 | ~float64
}

func Sum[T Number](numbers []T) T {
    var sum T
    for _, n := range numbers {
        sum += n
    }
    return sum
}
```

---

## Modules

### go.mod

```go
module github.com/user/myproject

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
)
```

### Common Commands

```bash
go mod init github.com/user/project  # Initialize module
go mod tidy                          # Add missing, remove unused
go get package@version               # Add/update dependency
go list -m all                       # List all dependencies
```

---

## Project Structure

```
myproject/
├── cmd/
│   └── server/
│       └── main.go        # Entry point
├── internal/              # Private packages
│   ├── handler/
│   ├── service/
│   └── repository/
├── pkg/                   # Public packages
├── go.mod
└── Makefile
```

---

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Gin/Fiber/Echo specifics | Framework-specific skills |
| GORM operations | ORM-specific skill |
| gRPC service definition | `api-design-grpc` skill |
| Testing specifics | `testing-go` skill |

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Not closing channels | Goroutine leaks | Always close when done |
| Ignoring errors | Silent failures | Check every error |
| Goroutine without context | Can't cancel | Pass context.Context |
| Not using defer for cleanup | Resource leaks | Always defer cleanup |
| Panic in production | Process crashes | Return errors |
| Empty interface everywhere | Loses type safety | Use generics (1.18+) |
| Copying mutexes | Undefined behavior | Pass by pointer |

---

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "all goroutines are asleep - deadlock!" | Channel deadlock | Check send/receive balance |
| "close of closed channel" | Closing twice | Use sync.Once |
| "concurrent map writes" | Race condition | Use sync.Map or mutex |
| "context deadline exceeded" | Timeout reached | Increase timeout or optimize |
| "assignment to entry in nil map" | Map not initialized | Initialize with make() |
| "nil pointer dereference" | Accessing nil | Check for nil before use |

---

## Reference Documentation

- [Concurrency](quick-ref/concurrency.md)
- [Interfaces](quick-ref/interfaces.md)
- [Error Handling](quick-ref/errors.md)
