# Go Advanced Patterns

## Concurrency Patterns

### Worker Pool

```go
func worker(id int, jobs <-chan Job, results chan<- Result) {
    for job := range jobs {
        result := process(job)
        results <- result
    }
}

func main() {
    jobs := make(chan Job, 100)
    results := make(chan Result, 100)

    // Start workers
    for w := 1; w <= 5; w++ {
        go worker(w, jobs, results)
    }

    // Send jobs
    for _, job := range allJobs {
        jobs <- job
    }
    close(jobs)

    // Collect results
    for range allJobs {
        <-results
    }
}
```

### Semaphore Pattern

```go
var sem = make(chan struct{}, MaxOutstanding)

func handle(r *Request) {
    sem <- struct{}{}  // Acquire
    defer func() { <-sem }()  // Release
    process(r)
}
```

### Fan-Out/Fan-In

```go
func fanOut(input <-chan int, workers int) []<-chan int {
    channels := make([]<-chan int, workers)
    for i := 0; i < workers; i++ {
        channels[i] = worker(input)
    }
    return channels
}

func fanIn(channels ...<-chan int) <-chan int {
    var wg sync.WaitGroup
    out := make(chan int)

    output := func(c <-chan int) {
        defer wg.Done()
        for n := range c {
            out <- n
        }
    }

    wg.Add(len(channels))
    for _, c := range channels {
        go output(c)
    }

    go func() {
        wg.Wait()
        close(out)
    }()

    return out
}
```

---

## Production Readiness

### Configuration

```go
type Config struct {
    Port        int    `env:"PORT" envDefault:"8080"`
    DatabaseURL string `env:"DATABASE_URL,required"`
    LogLevel    string `env:"LOG_LEVEL" envDefault:"info"`
}

func LoadConfig() (*Config, error) {
    cfg := &Config{}
    if err := env.Parse(cfg); err != nil {
        return nil, fmt.Errorf("parsing config: %w", err)
    }
    return cfg, nil
}
```

### Structured Logging

```go
import "log/slog"

func setupLogger() {
    handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
        Level: slog.LevelInfo,
    })
    slog.SetDefault(slog.New(handler))
}

func processRequest(ctx context.Context, id string) {
    slog.InfoContext(ctx, "processing request",
        slog.String("request_id", id),
        slog.Int("user_id", 42),
    )
}
```

### Graceful Shutdown

```go
func main() {
    ctx, stop := signal.NotifyContext(context.Background(),
        syscall.SIGINT, syscall.SIGTERM)
    defer stop()

    server := &http.Server{Addr: ":8080", Handler: router}

    go func() {
        if err := server.ListenAndServe(); err != http.ErrServerClosed {
            log.Fatal(err)
        }
    }()

    <-ctx.Done()
    log.Println("Shutting down...")

    shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := server.Shutdown(shutdownCtx); err != nil {
        log.Fatal(err)
    }
}
```

### Context Usage

```go
func handler(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()

    // Add timeout
    ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
    defer cancel()

    // Pass context to downstream calls
    result, err := service.Process(ctx, data)
    if err != nil {
        if errors.Is(err, context.DeadlineExceeded) {
            http.Error(w, "Request timeout", http.StatusGatewayTimeout)
            return
        }
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    json.NewEncoder(w).Encode(result)
}
```

### Health Checks

```go
func healthHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}

func readinessHandler(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
        defer cancel()

        if err := db.PingContext(ctx); err != nil {
            w.WriteHeader(http.StatusServiceUnavailable)
            json.NewEncoder(w).Encode(map[string]string{
                "status":   "not ready",
                "database": "disconnected",
            })
            return
        }

        json.NewEncoder(w).Encode(map[string]string{
            "status":   "ready",
            "database": "connected",
        })
    }
}
```

---

## Testing Patterns

### Table-Driven Tests

```go
func TestAdd(t *testing.T) {
    tests := []struct {
        name     string
        a, b     int
        expected int
    }{
        {"positive", 2, 3, 5},
        {"negative", -1, -1, -2},
        {"zero", 0, 0, 0},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := Add(tt.a, tt.b)
            if result != tt.expected {
                t.Errorf("Add(%d, %d) = %d; want %d", tt.a, tt.b, result, tt.expected)
            }
        })
    }
}
```

### Mocking with Interfaces

```go
type UserRepository interface {
    FindByID(ctx context.Context, id string) (*User, error)
    Save(ctx context.Context, user *User) error
}

// Mock implementation
type mockUserRepo struct {
    users map[string]*User
}

func (m *mockUserRepo) FindByID(ctx context.Context, id string) (*User, error) {
    user, ok := m.users[id]
    if !ok {
        return nil, ErrNotFound
    }
    return user, nil
}

func TestUserService_GetUser(t *testing.T) {
    repo := &mockUserRepo{
        users: map[string]*User{
            "1": {ID: "1", Name: "Alice"},
        },
    }
    service := NewUserService(repo)

    user, err := service.GetUser(context.Background(), "1")
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if user.Name != "Alice" {
        t.Errorf("expected Alice, got %s", user.Name)
    }
}
```

---

## HTTP Client Best Practices

```go
func NewHTTPClient() *http.Client {
    return &http.Client{
        Timeout: 30 * time.Second,
        Transport: &http.Transport{
            MaxIdleConns:        100,
            MaxIdleConnsPerHost: 10,
            IdleConnTimeout:     90 * time.Second,
        },
    }
}

func fetchWithRetry(ctx context.Context, client *http.Client, url string) (*http.Response, error) {
    var lastErr error
    for i := 0; i < 3; i++ {
        req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
        if err != nil {
            return nil, err
        }

        resp, err := client.Do(req)
        if err != nil {
            lastErr = err
            time.Sleep(time.Second * time.Duration(i+1))
            continue
        }

        if resp.StatusCode >= 500 {
            resp.Body.Close()
            lastErr = fmt.Errorf("server error: %d", resp.StatusCode)
            time.Sleep(time.Second * time.Duration(i+1))
            continue
        }

        return resp, nil
    }
    return nil, fmt.Errorf("failed after retries: %w", lastErr)
}
```

---

## Database Connection Pool

```go
func NewDB(dsn string) (*sql.DB, error) {
    db, err := sql.Open("postgres", dsn)
    if err != nil {
        return nil, err
    }

    // Configure connection pool
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(5)
    db.SetConnMaxLifetime(5 * time.Minute)
    db.SetConnMaxIdleTime(1 * time.Minute)

    // Verify connection
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    if err := db.PingContext(ctx); err != nil {
        return nil, fmt.Errorf("database ping failed: %w", err)
    }

    return db, nil
}
```
