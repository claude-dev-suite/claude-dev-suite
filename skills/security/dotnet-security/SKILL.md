---
name: dotnet-security
description: |
  .NET and ASP.NET Core security patterns. Covers Identity, authentication,
  dependency auditing, secure coding practices, and OWASP for .NET ecosystem.

  USE WHEN: user works with "C#", ".NET", "ASP.NET Core", "Entity Framework", asks about ".NET vulnerabilities", "NuGet security", ".NET authentication", "Blazor security"

  DO NOT USE FOR: general OWASP concepts - use `owasp` or `owasp-top-10` instead, Java/Python security - use language-specific skills
allowed-tools: Read, Grep, Glob, Bash
---
# .NET Security - Quick Reference

## When NOT to Use This Skill
- **General OWASP concepts** - Use `owasp` or `owasp-top-10` skill
- **Java security** - Use `java-security` skill
- **Python security** - Use `python-security` skill
- **Secrets management** - Use `secrets-management` skill

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `dotnet` for ASP.NET Core security documentation.

## Dependency Auditing

```bash
# .NET built-in audit
dotnet list package --vulnerable

# Detailed audit with transitive dependencies
dotnet list package --vulnerable --include-transitive

# Check outdated packages
dotnet list package --outdated

# Snyk for .NET
snyk test
```

### CI/CD Integration

```yaml
# GitHub Actions
- name: Security audit
  run: |
    dotnet list package --vulnerable --include-transitive
    dotnet tool install -g snyk
    snyk test
```

### NuGet.config Security

```xml
<configuration>
  <packageSources>
    <!-- Use only trusted sources -->
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
  <packageSourceCredentials>
    <!-- Use environment variables for private feeds -->
  </packageSourceCredentials>
</configuration>
```

## ASP.NET Core Security Configuration

### Program.cs Security Setup

```csharp
var builder = WebApplication.CreateBuilder(args);

// Security headers
builder.Services.AddHsts(options =>
{
    options.MaxAge = TimeSpan.FromDays(365);
    options.IncludeSubDomains = true;
    options.Preload = true;
});

// CORS configuration
builder.Services.AddCors(options =>
{
    options.AddPolicy("Production", policy =>
    {
        policy.WithOrigins("https://myapp.com")
              .AllowCredentials()
              .WithMethods("GET", "POST", "PUT", "DELETE")
              .WithHeaders("Authorization", "Content-Type");
    });
});

// Authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
        };
    });

// Rate limiting (.NET 7+)
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("login", limiter =>
    {
        limiter.Window = TimeSpan.FromMinutes(15);
        limiter.PermitLimit = 5;
        limiter.QueueLimit = 0;
    });
});

var app = builder.Build();

// Security middleware order matters
app.UseHsts();
app.UseHttpsRedirection();
app.UseCors("Production");
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
```

### Security Headers Middleware

```csharp
app.Use(async (context, next) =>
{
    context.Response.Headers.Add("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Add("X-Frame-Options", "DENY");
    context.Response.Headers.Add("X-XSS-Protection", "0"); // Use CSP instead
    context.Response.Headers.Add("Referrer-Policy", "strict-origin-when-cross-origin");
    context.Response.Headers.Add("Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");

    await next();
});
```

## SQL Injection Prevention

### Entity Framework Core - Safe

```csharp
// SAFE - LINQ queries
var user = await context.Users
    .FirstOrDefaultAsync(u => u.Email == email);

// SAFE - Parameterized raw SQL
var users = await context.Users
    .FromSqlRaw("SELECT * FROM Users WHERE Email = {0}", email)
    .ToListAsync();

// SAFE - Interpolated (converted to parameters)
var users = await context.Users
    .FromSqlInterpolated($"SELECT * FROM Users WHERE Email = {email}")
    .ToListAsync();
```

### Entity Framework Core - UNSAFE

```csharp
// UNSAFE - String concatenation
var query = $"SELECT * FROM Users WHERE Email = '{email}'";  // NEVER!
var users = await context.Users.FromSqlRaw(query).ToListAsync();

// UNSAFE - FormattableString with raw
var users = await context.Users
    .FromSqlRaw($"SELECT * FROM Users WHERE Email = '{email}'")  // NEVER!
    .ToListAsync();
```

### Dapper - Safe

```csharp
// SAFE - Anonymous parameters
var user = await connection.QueryFirstOrDefaultAsync<User>(
    "SELECT * FROM Users WHERE Email = @Email",
    new { Email = email }
);

// SAFE - DynamicParameters
var parameters = new DynamicParameters();
parameters.Add("Email", email);
var user = await connection.QueryFirstOrDefaultAsync<User>(
    "SELECT * FROM Users WHERE Email = @Email",
    parameters
);
```

## XSS Prevention

### Razor Pages (Auto-encoding)

```html
<!-- SAFE - Auto-encoded -->
<p>@Model.UserInput</p>

<!-- UNSAFE - Raw HTML -->
<p>@Html.Raw(Model.UserInput)</p>  <!-- Avoid if possible -->
```

### Manual Sanitization

```csharp
using Ganss.Xss;

var sanitizer = new HtmlSanitizer();
sanitizer.AllowedTags.Add("p");
sanitizer.AllowedTags.Add("b");
sanitizer.AllowedTags.Add("i");

string safeHtml = sanitizer.Sanitize(userInput);
```

### API Response Encoding

```csharp
using System.Text.Encodings.Web;

var encoder = HtmlEncoder.Default;
var safeString = encoder.Encode(userInput);
```

## Authentication & Authorization

### JWT Token Generation

```csharp
public class JwtService
{
    private readonly IConfiguration _config;

    public JwtService(IConfiguration config) => _config = config;

    public string GenerateToken(User user)
    {
        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role)
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
```

### Password Hashing with Identity

```csharp
// Use ASP.NET Core Identity's PasswordHasher
var hasher = new PasswordHasher<User>();

// Hash password
string hashed = hasher.HashPassword(user, password);

// Verify password
var result = hasher.VerifyHashedPassword(user, hashed, password);
if (result == PasswordVerificationResult.Success)
{
    // Password matches
}
```

### Authorization Policies

```csharp
// Program.cs
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy =>
        policy.RequireRole("Admin"));

    options.AddPolicy("ResourceOwner", policy =>
        policy.Requirements.Add(new ResourceOwnerRequirement()));
});

// Custom requirement handler
public class ResourceOwnerHandler : AuthorizationHandler<ResourceOwnerRequirement, Resource>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ResourceOwnerRequirement requirement,
        Resource resource)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (resource.OwnerId == userId)
        {
            context.Succeed(requirement);
        }
        return Task.CompletedTask;
    }
}

// Controller usage
[Authorize(Policy = "AdminOnly")]
public IActionResult AdminDashboard() => View();
```

## Input Validation

### Data Annotations

```csharp
public class CreateUserRequest
{
    [Required]
    [EmailAddress]
    [StringLength(255)]
    public string Email { get; set; } = default!;

    [Required]
    [StringLength(128, MinimumLength = 12)]
    [RegularExpression(@"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$",
        ErrorMessage = "Password must contain uppercase, lowercase, number and special character")]
    public string Password { get; set; } = default!;

    [Required]
    [StringLength(100, MinimumLength = 2)]
    [RegularExpression(@"^[a-zA-Z\s\-']+$")]
    public string Name { get; set; } = default!;
}

[HttpPost]
public IActionResult CreateUser([FromBody] CreateUserRequest request)
{
    if (!ModelState.IsValid)
        return BadRequest(ModelState);

    // request is validated
}
```

### FluentValidation

```csharp
public class CreateUserValidator : AbstractValidator<CreateUserRequest>
{
    public CreateUserValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(255);

        RuleFor(x => x.Password)
            .NotEmpty()
            .MinimumLength(12)
            .MaximumLength(128)
            .Matches(@"[A-Z]").WithMessage("Must contain uppercase")
            .Matches(@"[a-z]").WithMessage("Must contain lowercase")
            .Matches(@"\d").WithMessage("Must contain digit")
            .Matches(@"[@$!%*?&]").WithMessage("Must contain special character");

        RuleFor(x => x.Name)
            .NotEmpty()
            .Length(2, 100)
            .Matches(@"^[a-zA-Z\s\-']+$");
    }
}
```

## Secure File Upload

```csharp
[HttpPost("upload")]
[RequestSizeLimit(10 * 1024 * 1024)] // 10 MB
public async Task<IActionResult> Upload(IFormFile file)
{
    // Validate content type
    var allowedTypes = new[] { "image/jpeg", "image/png", "application/pdf" };
    if (!allowedTypes.Contains(file.ContentType))
        return BadRequest("File type not allowed");

    // Validate file extension
    var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".pdf" };
    var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
    if (!allowedExtensions.Contains(extension))
        return BadRequest("File extension not allowed");

    // Generate safe filename
    var safeName = $"{Guid.NewGuid()}{extension}";
    var uploadPath = Path.Combine(_uploadDirectory, safeName);

    // Save file
    await using var stream = new FileStream(uploadPath, FileMode.Create);
    await file.CopyToAsync(stream);

    return Ok(new { filename = safeName });
}
```

## Secrets Management

### User Secrets (Development)

```bash
# Initialize user secrets
dotnet user-secrets init

# Set secrets
dotnet user-secrets set "Jwt:Key" "your-secret-key"
dotnet user-secrets set "ConnectionStrings:Default" "your-connection-string"
```

### appsettings.json (DO NOT store secrets)

```json
{
  "Jwt": {
    "Issuer": "https://myapp.com",
    "Audience": "https://myapp.com"
    // Key should come from environment or secrets manager
  }
}
```

### Environment Variables

```csharp
// Program.cs - Load from environment
builder.Configuration.AddEnvironmentVariables();

// Access
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("JWT Key not configured");
```

### Azure Key Vault Integration

```csharp
builder.Configuration.AddAzureKeyVault(
    new Uri($"https://{vaultName}.vault.azure.net/"),
    new DefaultAzureCredential()
);
```

## Logging Security Events

```csharp
public class SecurityLogger
{
    private readonly ILogger<SecurityLogger> _logger;

    public SecurityLogger(ILogger<SecurityLogger> logger) => _logger = logger;

    public void LogLoginAttempt(string username, bool success, string ipAddress)
    {
        _logger.LogInformation(
            "Login attempt: User={Username}, Success={Success}, IP={IpAddress}",
            username, success, ipAddress
        );
    }

    public void LogAccessDenied(string userId, string resource, string ipAddress)
    {
        _logger.LogWarning(
            "Access denied: User={UserId}, Resource={Resource}, IP={IpAddress}",
            userId, resource, ipAddress
        );
    }

    // NEVER log sensitive data
    // _logger.LogInformation("Password: {Password}", password);  // NEVER!
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| String interpolation in SQL | SQL injection | Use parameterized queries |
| `Html.Raw(userInput)` | XSS vulnerability | Use default encoding |
| Storing secrets in appsettings | Secret exposure | Use User Secrets/Key Vault |
| `[AllowAnonymous]` everywhere | No authentication | Apply selectively |
| Disabling HTTPS redirection | Man-in-the-middle | Keep HTTPS enabled |
| Custom crypto implementation | Weak encryption | Use built-in libraries |
| Catching all exceptions | Hides security issues | Log and handle specifically |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| 401 Unauthorized | JWT validation failed | Check issuer, audience, key |
| CORS error | Origin not allowed | Add origin to CORS policy |
| Rate limit triggered | Too many requests | Adjust rate limiter settings |
| Password validation fails | Policy requirements | Check Identity password options |
| NuGet vulnerability | Outdated package | Update to patched version |
| User Secrets not loading | Not in Development | Check `ASPNETCORE_ENVIRONMENT` |

## Security Scanning Commands

```bash
# Dependency audit
dotnet list package --vulnerable --include-transitive

# Security analyzers (add NuGet packages)
# Microsoft.CodeAnalysis.NetAnalyzers
# SecurityCodeScan.VS2019

# Snyk
snyk test

# Check for secrets
gitleaks detect
trufflehog git file://.

# SAST with Semgrep
semgrep --config=p/csharp .
```

## Related Skills
- [OWASP Top 10:2025](../owasp-top-10/SKILL.md)
- [OWASP General](../owasp/SKILL.md)
- [Secrets Management](../secrets-management/SKILL.md)
- [Supply Chain Security](../supply-chain/SKILL.md)
