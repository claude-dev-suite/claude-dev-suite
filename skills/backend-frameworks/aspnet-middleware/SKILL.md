---
name: aspnet-middleware
description: |
  ASP.NET Core custom middleware, pipeline order, exception handling middleware,
  and request/response manipulation.

  USE WHEN: user mentions "middleware", "request pipeline", "exception middleware",
  "ASP.NET middleware", "UseMiddleware", "pipeline order"

  DO NOT USE FOR: Express middleware - use `express`,
  NestJS middleware - use `nestjs`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# ASP.NET Core Middleware - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `aspnet-core`, topic: `middleware` for comprehensive documentation.

## Pipeline Order

```
Request → Exception Handler → HSTS → HTTPS Redirect → Static Files
→ CORS → Authentication → Authorization → Custom Middleware → Endpoint
```

```csharp
var app = builder.Build();

// 1. Exception handling (first to catch all)
app.UseExceptionHandler("/error");
app.UseHsts();

// 2. HTTPS and static files
app.UseHttpsRedirection();
app.UseStaticFiles();

// 3. Routing
app.UseRouting();

// 4. CORS (before auth)
app.UseCors();

// 5. Auth
app.UseAuthentication();
app.UseAuthorization();

// 6. Custom middleware
app.UseMiddleware<RequestLoggingMiddleware>();

// 7. Endpoints
app.MapControllers();
```

## Custom Middleware (Convention-based)

```csharp
public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var sw = Stopwatch.StartNew();

        _logger.LogInformation("Request {Method} {Path}", context.Request.Method, context.Request.Path);

        await _next(context);

        sw.Stop();
        _logger.LogInformation("Response {StatusCode} in {Elapsed}ms",
            context.Response.StatusCode, sw.ElapsedMilliseconds);
    }
}

// Register
app.UseMiddleware<RequestLoggingMiddleware>();
```

## Exception Handling Middleware

```csharp
public class ExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionMiddleware> _logger;

    public ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (NotFoundException ex)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            await context.Response.WriteAsJsonAsync(new { error = ex.Message });
        }
        catch (ValidationException ex)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new { errors = ex.Errors });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception");
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new { error = "An unexpected error occurred" });
        }
    }
}
```

## Inline Middleware

```csharp
// Simple Use
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Request-Id", Guid.NewGuid().ToString());
    await next(context);
});

// Terminal middleware (does not call next)
app.Map("/health", app => app.Run(async context =>
{
    await context.Response.WriteAsync("OK");
}));
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Wrong middleware order | Auth bypassed, CORS fails | Follow documented order |
| Exception handler not first | Misses early errors | Place at start of pipeline |
| Reading body without buffering | Stream consumed once | Enable `EnableBuffering()` |
| Blocking calls in middleware | Thread starvation | Use `async Task InvokeAsync` |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| CORS not working | Wrong order | Place `UseCors()` before `UseAuth` |
| Middleware not executing | Registered after endpoints | Register before `MapControllers()` |
| Body empty in middleware | Already read by binding | Use `EnableBuffering()` |
| Static files not served | Wrong order | Place `UseStaticFiles()` early |
