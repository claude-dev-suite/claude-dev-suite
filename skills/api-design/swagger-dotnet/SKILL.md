---
name: swagger-dotnet
description: |
  Swashbuckle and NSwag for ASP.NET Core API documentation.
  Covers XML comments, operation filters, and OpenAPI customization.

  USE WHEN: user mentions "Swagger", "Swashbuckle", "NSwag", ".NET OpenAPI",
  "API documentation", "Swagger UI", ".NET API docs"

  DO NOT USE FOR: Springdoc OpenAPI - use `springdoc-openapi`,
  generic OpenAPI spec - use `openapi`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Swagger for .NET - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `aspnet-core` for OpenAPI documentation.

## Swashbuckle Setup

```csharp
// Program.cs
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "My API",
        Version = "v1",
        Description = "API for managing users and orders",
    });

    // XML comments
    var xmlFile = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
    options.IncludeXmlComments(xmlPath);

    // JWT auth in Swagger UI
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        In = ParameterLocation.Header,
        Description = "Enter JWT token",
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        BearerFormat = "JWT",
        Scheme = "bearer",
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer",
                }
            },
            Array.Empty<string>()
        }
    });
});

// Enable XML docs in .csproj
// <GenerateDocumentationFile>true</GenerateDocumentationFile>
```

## Controller Annotations

```csharp
/// <summary>
/// Manages user resources
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
[Tags("Users")]
public class UsersController : ControllerBase
{
    /// <summary>
    /// Get user by ID
    /// </summary>
    /// <param name="id">The user ID</param>
    /// <returns>The user details</returns>
    /// <response code="200">Returns the user</response>
    /// <response code="404">User not found</response>
    [HttpGet("{id:int}")]
    [ProducesResponseType<UserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(int id) { }

    /// <summary>
    /// Create a new user
    /// </summary>
    [HttpPost]
    [ProducesResponseType<UserResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest request) { }
}
```

## Operation Filters

```csharp
public class AddCorrelationIdHeader : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        operation.Parameters ??= new List<OpenApiParameter>();
        operation.Parameters.Add(new OpenApiParameter
        {
            Name = "X-Correlation-Id",
            In = ParameterLocation.Header,
            Required = false,
            Schema = new OpenApiSchema { Type = "string" },
        });
    }
}

// Register
options.OperationFilter<AddCorrelationIdHeader>();
```

## NSwag Alternative

```csharp
// Install: dotnet add package NSwag.AspNetCore
builder.Services.AddOpenApiDocument(config =>
{
    config.Title = "My API";
    config.Version = "v1";
    config.AddSecurity("Bearer", new NSwag.OpenApiSecurityScheme
    {
        Type = NSwag.OpenApiSecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
    });
});

app.UseOpenApi();
app.UseSwaggerUi();
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| No response type annotations | Incomplete docs | Use `[ProducesResponseType]` |
| Missing XML comments | No descriptions | Enable and write XML docs |
| Swagger in production | Security risk | Conditionally enable for dev |
| No auth scheme in docs | Can't test auth endpoints | Add security definition |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| No XML comments | Not enabled | Add `<GenerateDocumentationFile>` |
| Missing endpoint | Wrong route | Check `[Route]` attributes |
| Auth not working in UI | Missing security definition | Add `AddSecurityDefinition` |
| Schema conflicts | Duplicate type names | Use `SchemaId` configuration |
