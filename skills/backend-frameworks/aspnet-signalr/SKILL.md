---
name: aspnet-signalr
description: |
  ASP.NET Core SignalR for real-time hubs, clients, groups, and streaming.
  Covers strongly-typed hubs and hub filters.

  USE WHEN: user mentions "SignalR", "real-time", "WebSocket", "hubs",
  "real-time notifications", ".NET WebSocket", "push notifications"

  DO NOT USE FOR: Spring WebSocket - use `spring-websocket`,
  Socket.IO - use Angular/React WebSocket patterns
allowed-tools: Read, Grep, Glob, Write, Edit
---
# ASP.NET Core SignalR - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `signalr` for comprehensive documentation.

## Hub Setup

```csharp
// Program.cs
builder.Services.AddSignalR();
app.MapHub<ChatHub>("/hubs/chat");
```

## Strongly-Typed Hub

```csharp
public interface IChatClient
{
    Task ReceiveMessage(string user, string message);
    Task UserJoined(string user);
    Task UserLeft(string user);
}

public class ChatHub : Hub<IChatClient>
{
    public async Task SendMessage(string user, string message)
    {
        await Clients.All.ReceiveMessage(user, message);
    }

    public async Task JoinRoom(string room)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, room);
        await Clients.Group(room).UserJoined(Context.User?.Identity?.Name ?? "Anonymous");
    }

    public async Task LeaveRoom(string room)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, room);
        await Clients.Group(room).UserLeft(Context.User?.Identity?.Name ?? "Anonymous");
    }

    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await base.OnDisconnectedAsync(exception);
    }
}
```

## Sending from Outside Hub

```csharp
public class NotificationService
{
    private readonly IHubContext<ChatHub, IChatClient> _hubContext;

    public NotificationService(IHubContext<ChatHub, IChatClient> hubContext)
        => _hubContext = hubContext;

    public async Task NotifyUser(string userId, string message)
    {
        await _hubContext.Clients.User(userId).ReceiveMessage("System", message);
    }

    public async Task NotifyGroup(string group, string message)
    {
        await _hubContext.Clients.Group(group).ReceiveMessage("System", message);
    }
}
```

## Streaming

```csharp
public class StreamHub : Hub
{
    // Server to client streaming
    public async IAsyncEnumerable<int> Counter(int count, int delay,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        for (var i = 0; i < count; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            yield return i;
            await Task.Delay(delay, cancellationToken);
        }
    }

    // Client to server streaming
    public async Task UploadStream(IAsyncEnumerable<string> stream)
    {
        await foreach (var item in stream)
        {
            // Process each item
        }
    }
}
```

## Authentication

```csharp
// Require auth on hub
[Authorize]
public class SecureHub : Hub<IChatClient>
{
    [Authorize(Roles = "Admin")]
    public async Task AdminAction() { }
}

// Access user info
public class ChatHub : Hub
{
    public async Task Send(string message)
    {
        var userId = Context.UserIdentifier; // From ClaimTypes.NameIdentifier
        var name = Context.User?.Identity?.Name;
    }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Storing state in Hub | Hub is transient | Use external storage or groups |
| Not using strongly-typed hubs | No compile-time safety | Use `Hub<TClient>` |
| Long-running hub methods | Blocks connection | Use background services |
| Not handling disconnection | Resource leaks | Override `OnDisconnectedAsync` |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Connection refused | Hub not mapped | Check `app.MapHub<T>()` |
| Auth not working | Token not sent | Pass token in query string for WebSocket |
| Messages not received | Wrong client method name | Match interface method names exactly |
| Scaling issues | No backplane | Use Redis or Azure SignalR |
