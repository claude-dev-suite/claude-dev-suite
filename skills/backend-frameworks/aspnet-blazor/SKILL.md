---
name: aspnet-blazor
description: |
  Blazor Server, WebAssembly, and United (Auto) with components, interop, and render modes.
  Covers .NET 8+ Blazor patterns.

  USE WHEN: user mentions "Blazor", "Blazor Server", "Blazor WASM", "Blazor WebAssembly",
  "Blazor components", "render modes", "Blazor interop"

  DO NOT USE FOR: Angular components - use `angular`,
  React components - use `react`, Svelte - use `svelte`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# ASP.NET Blazor - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `blazor` for comprehensive documentation.

## Render Modes (.NET 8+)

| Mode | Description | Use For |
|------|-------------|---------|
| `InteractiveServer` | Server-side via SignalR | Internal apps, real-time |
| `InteractiveWebAssembly` | Client-side WASM | Offline, no server dependency |
| `InteractiveAuto` | Server first, then WASM | Best of both worlds |
| Static SSR (default) | No interactivity | Content pages, SEO |

```razor
@* Page-level render mode *@
@rendermode InteractiveServer

@* Component-level *@
<Counter @rendermode="InteractiveWebAssembly" />
```

## Component Pattern

```razor
@* Counter.razor *@
<h3>Counter</h3>
<p>Count: @count</p>
<button @onclick="Increment">Click me</button>

@code {
    private int count = 0;

    [Parameter]
    public int InitialCount { get; set; } = 0;

    [Parameter]
    public EventCallback<int> OnCountChanged { get; set; }

    protected override void OnInitialized()
    {
        count = InitialCount;
    }

    private async Task Increment()
    {
        count++;
        await OnCountChanged.InvokeAsync(count);
    }
}
```

## Forms with Validation

```razor
<EditForm Model="user" OnValidSubmit="HandleSubmit" FormName="UserForm">
    <DataAnnotationsValidator />
    <ValidationSummary />

    <InputText @bind-Value="user.Name" class="form-control" />
    <ValidationMessage For="@(() => user.Name)" />

    <InputText @bind-Value="user.Email" class="form-control" />
    <ValidationMessage For="@(() => user.Email)" />

    <button type="submit">Save</button>
</EditForm>

@code {
    [SupplyParameterFromForm]
    private UserModel user { get; set; } = new();

    private async Task HandleSubmit()
    {
        await UserService.CreateAsync(user);
        Navigation.NavigateTo("/users");
    }
}
```

## JavaScript Interop

```razor
@inject IJSRuntime JS

@code {
    private async Task ShowAlert()
    {
        await JS.InvokeVoidAsync("alert", "Hello from Blazor!");
    }

    private async Task<string> GetValue()
    {
        return await JS.InvokeAsync<string>("localStorage.getItem", "key");
    }
}
```

## Dependency Injection

```razor
@inject IUserService UserService
@inject NavigationManager Navigation
@inject ILogger<UserList> Logger
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| InteractiveServer for public sites | Latency, scaling | Use Auto or WASM |
| Large WASM downloads | Slow initial load | Use Auto mode |
| Direct DOM manipulation | Breaks diffing | Use Blazor bindings |
| Not disposing JS interop | Memory leaks | Implement `IAsyncDisposable` |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Component not interactive | Missing render mode | Add `@rendermode` directive |
| JS interop fails | WASM restriction | Use `IJSRuntime` correctly |
| State lost on navigation | No state container | Use cascading parameters or DI |
| Pre-rendering flicker | Async data on init | Use `OnInitializedAsync` with loading state |
