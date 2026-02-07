---
name: aspnet-core
description: |
  ASP.NET Core 8+ with controllers, services, DI, configuration, and middleware pipeline.
  Covers Program.cs setup and enterprise patterns.

  USE WHEN: user mentions "ASP.NET Core", "Web API", ".NET controllers", "Program.cs",
  "dependency injection", ".NET DI", ".NET configuration", "appsettings"

  DO NOT USE FOR: Minimal APIs (use `aspnet-minimal-api`), Spring Boot (use `spring-boot`),
  NestJS (use `nestjs`), Express (use `express`)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# ASP.NET Core - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `aspnet-core` for comprehensive documentation.

## Program.cs Setup

```csharp
var builder = WebApplication.CreateBuilder(args);

// Services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

// Dependency injection
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IUserRepository, UserRepository>();

// Configuration
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));

var app = builder.Build();

// Middleware pipeline (order matters!)
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
```

## Controller Pattern

```csharp
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class UsersController : ControllerBase
{
    private readonly IUserService _userService;

    public UsersController(IUserService userService) => _userService = userService;

    [HttpGet]
    [ProducesResponseType<IEnumerable<UserResponse>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll([FromQuery] int page = 1, [FromQuery] int size = 10)
    {
        var users = await _userService.GetAllAsync(page, size);
        return Ok(users);
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType<UserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(int id)
    {
        var user = await _userService.GetByIdAsync(id);
        return user is null ? NotFound() : Ok(user);
    }

    [HttpPost]
    [ProducesResponseType<UserResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest request)
    {
        var user = await _userService.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = user.Id }, user);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateUserRequest request)
    {
        var result = await _userService.UpdateAsync(id, request);
        return result ? NoContent() : NotFound();
    }

    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(int id)
    {
        await _userService.DeleteAsync(id);
        return NoContent();
    }
}
```

## Service Layer

```csharp
public interface IUserService
{
    Task<UserResponse?> GetByIdAsync(int id);
    Task<IEnumerable<UserResponse>> GetAllAsync(int page, int size);
    Task<UserResponse> CreateAsync(CreateUserRequest request);
    Task<bool> UpdateAsync(int id, UpdateUserRequest request);
    Task DeleteAsync(int id);
}

public class UserService : IUserService
{
    private readonly IUserRepository _repository;
    private readonly ILogger<UserService> _logger;

    public UserService(IUserRepository repository, ILogger<UserService> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    public async Task<UserResponse?> GetByIdAsync(int id)
    {
        var user = await _repository.GetByIdAsync(id);
        return user is null ? null : MapToResponse(user);
    }

    public async Task<UserResponse> CreateAsync(CreateUserRequest request)
    {
        var user = new User { Name = request.Name, Email = request.Email };
        await _repository.AddAsync(user);
        _logger.LogInformation("User {UserId} created", user.Id);
        return MapToResponse(user);
    }

    private static UserResponse MapToResponse(User user)
        => new(user.Id, user.Name, user.Email, user.CreatedAt);
}
```

## DTOs with Records

```csharp
public record CreateUserRequest(string Name, string Email);
public record UpdateUserRequest(string Name, string Email);
public record UserResponse(int Id, string Name, string Email, DateTime CreatedAt);
```

## Dependency Injection Lifetimes

| Lifetime | Use For |
|----------|---------|
| `AddTransient<T>` | Lightweight, stateless services |
| `AddScoped<T>` | Per-request services (repositories, DbContext) |
| `AddSingleton<T>` | Shared state, caches, configuration |

## Configuration Binding

```csharp
// appsettings.json
// { "Jwt": { "Key": "...", "Issuer": "..." } }

public class JwtOptions
{
    public string Key { get; set; } = default!;
    public string Issuer { get; set; } = default!;
    public string Audience { get; set; } = default!;
    public int ExpiryMinutes { get; set; } = 60;
}

// Register
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));

// Use
public class AuthService
{
    private readonly JwtOptions _options;
    public AuthService(IOptions<JwtOptions> options) => _options = options.Value;
}
```

## Global Exception Handling

```csharp
app.UseExceptionHandler(app => app.Run(async context =>
{
    var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
    var response = exception switch
    {
        NotFoundException e => (StatusCodes.Status404NotFound, e.Message),
        ValidationException e => (StatusCodes.Status400BadRequest, e.Message),
        _ => (StatusCodes.Status500InternalServerError, "An unexpected error occurred"),
    };

    context.Response.StatusCode = response.Item1;
    await context.Response.WriteAsJsonAsync(new { error = response.Item2 });
}));
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Business logic in controllers | Violates SRP | Use service layer |
| `new` for dependencies | Not testable | Use constructor DI |
| Singleton DbContext | Thread-safety issues | Use Scoped lifetime |
| Catching all exceptions in controllers | Repetitive, inconsistent | Use global exception handler |
| Returning entities from APIs | Exposes internals | Use DTOs / records |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| DI resolution error | Missing registration | Register service in `Program.cs` |
| 404 on endpoint | Wrong route template | Check `[Route]` attribute |
| Model binding null | Wrong `[FromX]` attribute | Use `[FromBody]` for JSON |
| Config value null | Wrong section path | Check `GetSection()` path |
