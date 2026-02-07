---
name: aspnet-minimal-api
description: |
  ASP.NET Core Minimal API endpoints, route groups, filters, and typed results.
  Covers modern .NET 8+ endpoint patterns.

  USE WHEN: user mentions "Minimal API", "MapGet", "MapPost", "route groups",
  "endpoint filters", ".NET minimal", "lambda endpoints"

  DO NOT USE FOR: Controller-based APIs (use `aspnet-core`),
  Express.js (use `express`), FastAPI (use `fastapi`)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# ASP.NET Minimal API - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `aspnet-core`, topic: `minimal-api` for comprehensive documentation.

## Basic Endpoints

```csharp
var app = WebApplication.Create(args);

app.MapGet("/api/users", async (IUserService service) =>
    Results.Ok(await service.GetAllAsync()));

app.MapGet("/api/users/{id:int}", async (int id, IUserService service) =>
    await service.GetByIdAsync(id) is { } user
        ? Results.Ok(user)
        : Results.NotFound());

app.MapPost("/api/users", async (CreateUserRequest request, IUserService service) =>
{
    var user = await service.CreateAsync(request);
    return Results.Created($"/api/users/{user.Id}", user);
});

app.MapPut("/api/users/{id:int}", async (int id, UpdateUserRequest request, IUserService service) =>
    await service.UpdateAsync(id, request) ? Results.NoContent() : Results.NotFound());

app.MapDelete("/api/users/{id:int}", async (int id, IUserService service) =>
{
    await service.DeleteAsync(id);
    return Results.NoContent();
});

app.Run();
```

## Route Groups

```csharp
var users = app.MapGroup("/api/users")
    .WithTags("Users")
    .RequireAuthorization();

users.MapGet("/", GetAll);
users.MapGet("/{id:int}", GetById);
users.MapPost("/", Create);

// Nested groups
var admin = app.MapGroup("/api/admin")
    .RequireAuthorization("AdminOnly");

admin.MapGroup("/users").MapGet("/", GetAllUsers);
```

## Endpoint Filters

```csharp
// Validation filter
public class ValidationFilter<T> : IEndpointFilter where T : class
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context,
        EndpointFilterDelegate next)
    {
        var argument = context.Arguments.OfType<T>().FirstOrDefault();
        if (argument is null)
            return Results.BadRequest("Invalid request body");

        var validator = context.HttpContext.RequestServices.GetService<IValidator<T>>();
        if (validator is not null)
        {
            var result = await validator.ValidateAsync(argument);
            if (!result.IsValid)
                return Results.ValidationProblem(result.ToDictionary());
        }

        return await next(context);
    }
}

// Apply filter
users.MapPost("/", Create).AddEndpointFilter<ValidationFilter<CreateUserRequest>>();
```

## TypedResults (.NET 7+)

```csharp
app.MapGet("/api/users/{id:int}", async Task<Results<Ok<UserResponse>, NotFound>> (int id, IUserService service) =>
    await service.GetByIdAsync(id) is { } user
        ? TypedResults.Ok(user)
        : TypedResults.NotFound());
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| All endpoints in Program.cs | Hard to maintain | Use route groups and extension methods |
| No validation | Accepts bad input | Use endpoint filters |
| Inline business logic | Not testable | Inject services |
| Not using TypedResults | No OpenAPI metadata | Use `TypedResults` for typed responses |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Parameter not bound | Wrong type or name | Use explicit `[FromRoute]` / `[FromQuery]` |
| Filter not executing | Not registered | Add with `AddEndpointFilter<T>()` |
| OpenAPI missing types | Using `Results.Ok()` | Use `TypedResults.Ok()` |
| Route conflicts | Ambiguous routes | Add route constraints like `{id:int}` |
