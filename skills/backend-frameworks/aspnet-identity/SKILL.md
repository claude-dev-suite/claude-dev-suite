---
name: aspnet-identity
description: |
  ASP.NET Core Identity for authentication, roles, claims, and external providers.
  Covers Identity setup, customization, and token-based auth.

  USE WHEN: user mentions "ASP.NET Identity", "user authentication", ".NET auth",
  "roles and claims", "Identity scaffolding", "external login providers"

  DO NOT USE FOR: JWT-only auth without Identity,
  Spring Security - use `spring-security`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# ASP.NET Core Identity - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `aspnet-core` for Identity documentation.

## Setup

```csharp
// Program.cs
builder.Services.AddIdentity<ApplicationUser, IdentityRole>(options =>
{
    options.Password.RequireDigit = true;
    options.Password.RequiredLength = 12;
    options.Password.RequireNonAlphanumeric = true;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.User.RequireUniqueEmail = true;
})
.AddEntityFrameworkStores<AppDbContext>()
.AddDefaultTokenProviders();
```

## Custom User Entity

```csharp
public class ApplicationUser : IdentityUser
{
    public string FirstName { get; set; } = default!;
    public string LastName { get; set; } = default!;
    public DateTime CreatedAt { get; set; }
}
```

## Registration & Login

```csharp
public class AuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;

    public async Task<IdentityResult> RegisterAsync(RegisterRequest request)
    {
        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            FirstName = request.FirstName,
            LastName = request.LastName,
        };
        return await _userManager.CreateAsync(user, request.Password);
    }

    public async Task<SignInResult> LoginAsync(LoginRequest request)
    {
        return await _signInManager.PasswordSignInAsync(
            request.Email, request.Password, request.RememberMe, lockoutOnFailure: true);
    }
}
```

## Role-Based Authorization

```csharp
// Seed roles
using var scope = app.Services.CreateScope();
var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
foreach (var role in new[] { "Admin", "User", "Manager" })
{
    if (!await roleManager.RoleExistsAsync(role))
        await roleManager.CreateAsync(new IdentityRole(role));
}

// Assign role
await _userManager.AddToRoleAsync(user, "Admin");

// Controller
[Authorize(Roles = "Admin")]
public IActionResult AdminPanel() => Ok();

// Policy-based
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("RequireAdmin", policy => policy.RequireRole("Admin"));
    options.AddPolicy("MinAge", policy =>
        policy.RequireClaim("DateOfBirth")
              .RequireAssertion(ctx =>
              {
                  var dob = DateTime.Parse(ctx.User.FindFirst("DateOfBirth")!.Value);
                  return DateTime.Today.Year - dob.Year >= 18;
              }));
});
```

## External Login Providers

```csharp
builder.Services.AddAuthentication()
    .AddGoogle(options =>
    {
        options.ClientId = builder.Configuration["Auth:Google:ClientId"]!;
        options.ClientSecret = builder.Configuration["Auth:Google:ClientSecret"]!;
    })
    .AddMicrosoftAccount(options =>
    {
        options.ClientId = builder.Configuration["Auth:Microsoft:ClientId"]!;
        options.ClientSecret = builder.Configuration["Auth:Microsoft:ClientSecret"]!;
    });
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Custom password hashing | Insecure | Use Identity's `PasswordHasher<T>` |
| Storing plain-text passwords | Security risk | Identity hashes automatically |
| No account lockout | Brute-force vulnerable | Enable lockout options |
| Roles in JWT claims only | Not enforced server-side | Validate from store |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Login always fails | Wrong password config | Check `PasswordOptions` |
| User not found | Case sensitivity | Identity is case-insensitive by default |
| Token expired | Short token lifetime | Adjust `TokenLifespan` |
| External login redirect fails | Wrong callback URL | Check provider's redirect URIs |
