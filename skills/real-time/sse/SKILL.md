---
name: sse
description: |
  Server-Sent Events for real-time server-to-client streaming. Express, Fastify,
  FastAPI, Spring WebFlux SSE implementations. Event streams, reconnection,
  and EventSource API.

  USE WHEN: user mentions "SSE", "Server-Sent Events", "EventSource",
  "event stream", "text/event-stream", "live feed", "streaming updates"

  DO NOT USE FOR: bidirectional communication - use `socket-io`;
  WebRTC - use `webrtc`; LLM streaming - use AI SDK skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Server-Sent Events (SSE)

## Express Server

```typescript
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send initial data
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Named events
  function sendEvent(event: string, data: unknown) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // Keep-alive
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 30000);

  // Listen for updates
  const handler = (data: unknown) => sendEvent('update', data);
  eventEmitter.on('update', handler);

  req.on('close', () => {
    clearInterval(keepAlive);
    eventEmitter.off('update', handler);
  });
});
```

## FastAPI (Python)

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import asyncio, json

app = FastAPI()

@app.get("/api/events")
async def events():
    async def stream():
        while True:
            data = await get_next_update()
            yield f"event: update\ndata: {json.dumps(data)}\n\n"
            await asyncio.sleep(0.1)

    return StreamingResponse(stream(), media_type="text/event-stream")
```

## Spring WebFlux

```java
@GetMapping(path = "/api/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<ServerSentEvent<String>> events() {
    return Flux.interval(Duration.ofSeconds(1))
        .map(seq -> ServerSentEvent.<String>builder()
            .id(String.valueOf(seq))
            .event("update")
            .data("{\"count\":" + seq + "}")
            .build());
}
```

## Browser Client (EventSource)

```typescript
const source = new EventSource('/api/events');

source.onopen = () => console.log('Connected');

// Default "message" event
source.onmessage = (e) => console.log(JSON.parse(e.data));

// Named events
source.addEventListener('update', (e) => {
  const data = JSON.parse(e.data);
  updateUI(data);
});

source.onerror = (e) => {
  if (source.readyState === EventSource.CLOSED) {
    console.log('Connection closed');
  }
  // Browser auto-reconnects
};

// Cleanup
source.close();
```

### With Auth Headers (fetch-based)

```typescript
async function* sseStream(url: string, token: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop()!;
    for (const block of lines) {
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
      if (dataLine) yield JSON.parse(dataLine.slice(6));
    }
  }
}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| No keep-alive pings | Send comment (`: keep-alive`) every 30s |
| Missing cleanup on disconnect | Listen for `req.on('close')` and clean up |
| No event IDs for reconnection | Send `id:` field, use `Last-Event-ID` header |
| EventSource doesn't support auth headers | Use fetch-based SSE client for auth |
| No backpressure | Check `res.writableEnded` before writing |

## Production Checklist

- [ ] Keep-alive pings configured
- [ ] Cleanup on client disconnect
- [ ] Event IDs for reconnection support
- [ ] Connection limits per user
- [ ] Reverse proxy timeout configured (nginx: `proxy_read_timeout`)
- [ ] Load balancer sticky sessions or pub/sub for multi-server
