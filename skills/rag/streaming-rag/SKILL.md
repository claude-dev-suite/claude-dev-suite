---
name: streaming-rag
description: |
  Streaming LLM responses with inline citations. Token-level source attribution,
  SSE vs WebSocket, TTFT optimization, progressive disclosure (retrieval status
  then tokens), Python async generators, Vercel AI SDK streaming with sources,
  LangChain streaming callbacks, client-side citation rendering.

  USE WHEN: user mentions "streaming RAG", "streaming citations", "SSE RAG",
  "TTFT", "progressive disclosure", "AI SDK streaming", "token streaming",
  "inline citations"

  DO NOT USE FOR: generic RAG pipelines - use `rag-architecture`;
  citation correctness evaluation - use `rag-evaluation`;
  conversational memory - use `conversational-rag`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Streaming RAG

## Why Streaming Matters for RAG

RAG end-to-end latency is typically 1.5-4s. Non-streaming feels broken; streaming cuts perceived latency by 5-10x because users start reading within ~200ms of generation start.

Budget target:
- First retrieval status: < 100ms (from request)
- Retrieval done: < 800ms
- First token: < 1000ms (TTFT)
- Full answer: < 3500ms

## Three Streaming Phases

```
[request] --100ms--> status: "retrieving..."
         --800ms--> status: "reading 5 sources"
         --1000ms--> first answer token
         --3500ms--> done + citations
```

Keep the user informed in phase 1-2 so they do not bail on the request.

## Server-Side: Python Async Generator (FastAPI + SSE)

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from anthropic import AsyncAnthropic
import asyncio
import json

app = FastAPI()
client = AsyncAnthropic()

async def rag_stream(question: str):
    yield sse({"type": "status", "message": "retrieving"})

    docs = await retriever.ainvoke(question)
    yield sse({"type": "status", "message": f"reading {len(docs)} sources"})
    yield sse({"type": "sources", "sources": [
        {"id": d.metadata["id"], "title": d.metadata["title"], "url": d.metadata["url"]}
        for d in docs
    ]})

    context = "\n\n".join(
        f"[{d.metadata['id']}] {d.page_content}" for d in docs
    )
    prompt = (
        f"Answer using context. Cite sources inline as [id]. If unknown, say so.\n\n"
        f"Context:\n{context}\n\nQuestion: {question}"
    )

    async with client.messages.stream(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield sse({"type": "token", "text": text})

        final = await stream.get_final_message()
        yield sse({"type": "done",
                   "usage": {"input": final.usage.input_tokens,
                             "output": final.usage.output_tokens}})

def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"

@app.post("/rag/stream")
async def rag_endpoint(body: dict):
    return StreamingResponse(rag_stream(body["question"]), media_type="text/event-stream")
```

Six event types over the wire: `status`, `sources`, `token`, `done`, `error`, `heartbeat`.

## Heartbeats (required for long retrievals behind proxies)

Nginx/Cloudflare terminate idle connections at 30-60s. Emit a heartbeat every 15s during retrieval.

```python
async def with_heartbeat(gen, interval: float = 15.0):
    q: asyncio.Queue = asyncio.Queue()
    async def pump():
        async for item in gen:
            await q.put(("item", item))
        await q.put(("end", None))

    task = asyncio.create_task(pump())
    while True:
        try:
            kind, item = await asyncio.wait_for(q.get(), timeout=interval)
            if kind == "end": break
            yield item
        except asyncio.TimeoutError:
            yield sse({"type": "heartbeat"})
    await task
```

## Inline Citations via Anthropic Citations API

Claude supports native citations that bind token spans to source documents. Cleaner than manual [id] instructions.

```python
async def rag_with_native_citations(question: str, docs):
    blocks = [
        {
            "type": "document",
            "source": {"type": "text", "media_type": "text/plain", "data": d.page_content},
            "title": d.metadata.get("title", "source"),
            "citations": {"enabled": True},
        }
        for d in docs
    ]

    async with client.messages.stream(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [*blocks, {"type": "text", "text": question}],
        }],
    ) as stream:
        async for event in stream:
            if event.type == "content_block_delta":
                delta = event.delta
                if delta.type == "text_delta":
                    yield sse({"type": "token", "text": delta.text})
                elif delta.type == "citations_delta":
                    yield sse({"type": "citation",
                               "citation": delta.citation.model_dump()})
```

Client renders the citation as a hoverable footnote anchored to the adjacent token.

## LangChain Streaming with Callbacks (LCEL 0.3+)

```python
from langchain.chains import create_retrieval_chain
from langchain_core.runnables import RunnableConfig

async def stream(question: str):
    yield sse({"type": "status", "message": "retrieving"})

    async for event in rag_chain.astream_events(
        {"input": question},
        version="v2",
        config=RunnableConfig(tags=["rag"]),
    ):
        kind = event["event"]
        if kind == "on_retriever_end":
            docs = event["data"]["output"]
            yield sse({"type": "sources", "sources": [
                {"id": d.metadata["id"], "title": d.metadata["title"]} for d in docs
            ]})
        elif kind == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            if chunk.content:
                yield sse({"type": "token", "text": chunk.content})
        elif kind == "on_chain_end" and event["name"] == "retrieval_chain":
            yield sse({"type": "done"})
```

`astream_events` gives a single unified stream of retrieval + generation events — avoids threading two streams manually.

## TypeScript: Vercel AI SDK with Sources

The AI SDK's `streamText` natively supports `sources` stream parts and client hooks.

```ts
import { streamText, convertToCoreMessages, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const q = messages[messages.length - 1].content;

  const docs = await retriever.search(q, 5);

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    messages: convertToCoreMessages(messages),
    system: `Answer using the provided sources. Cite inline as [id].`,
    experimental_providerMetadata: {
      anthropic: {
        cacheControl: { type: 'ephemeral' },
      },
    },
    experimental_attachments: docs.map((d) => ({
      name: d.title,
      contentType: 'text/plain',
      url: `data:text/plain;base64,${Buffer.from(d.text).toString('base64')}`,
    })),
    onFinish: async ({ usage, text }) => {
      await logUsage(usage, text);
    },
  });

  return result.toDataStreamResponse({
    sendSources: true,
    getErrorMessage: (err) => 'Stream error; please retry.',
  });
}
```

Client with `useChat`:

```tsx
'use client';
import { useChat } from 'ai/react';

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, data } = useChat();

  return (
    <>
      {messages.map((m) => (
        <div key={m.id}>
          <p>{m.content}</p>
          {m.experimental_attachments?.map((a, i) => (
            <a key={i} href={a.url}>{a.name}</a>
          ))}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
      </form>
    </>
  );
}
```

## Client-Side Citation Rendering

Regex `\[(\w+)\]` tokens and replace at stream-end (not per-token — regex on a partial token can mis-match).

```tsx
import { useMemo } from 'react';

function CitedAnswer({ text, sources }: { text: string; sources: Source[] }) {
  const rendered = useMemo(() => {
    const parts = text.split(/(\[[\w-]+\])/g);
    return parts.map((p, i) => {
      const m = p.match(/^\[([\w-]+)\]$/);
      if (!m) return <span key={i}>{p}</span>;
      const s = sources.find((x) => x.id === m[1]);
      if (!s) return <span key={i}>{p}</span>;
      return (
        <a key={i} href={s.url} title={s.title} className="citation">
          [{sources.indexOf(s) + 1}]
        </a>
      );
    });
  }, [text, sources]);
  return <p>{rendered}</p>;
}
```

Do not regex-replace on every token — a `[` streamed before `]` would render as literal. Rewrite on stream-end or on stable boundaries.

## SSE vs WebSocket

| Dimension | SSE | WebSocket |
|---|---|---|
| Direction | Server -> client only | Bidirectional |
| Auto-reconnect | Yes (browser) | Manual |
| HTTP-friendly (proxies, CDN) | Yes | Often blocked |
| Backpressure | Poor | Explicit |
| Browser support | Universal | Universal |

Default to SSE for chat-style RAG. Switch to WebSocket only if the user needs to interrupt mid-stream or the frontend is long-lived with many channels.

## Interrupting Mid-Stream

```python
from contextlib import suppress

async def interruptible_stream(question: str, cancel_token: asyncio.Event):
    async with client.messages.stream(...) as stream:
        async for text in stream.text_stream:
            if cancel_token.is_set():
                with suppress(Exception):
                    await stream.close()
                yield sse({"type": "cancelled"})
                return
            yield sse({"type": "token", "text": text})
```

WebSocket gives a natural cancellation channel; with SSE, track the cancel token server-side by session/request ID and poll `request.is_disconnected()`.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Waiting for retrieval to finish before streaming anything | Emit status events immediately |
| No heartbeat on long-running streams | 15s heartbeat; most proxies kill at 30-60s idle |
| Rendering citation regex per token | Wait for stable boundaries or end-of-stream |
| Buffering full response server-side | Break the point of streaming; flush tokens as they arrive |
| Streaming without `Cache-Control: no-transform` | Intermediaries can buffer; set the header |
| Mixing citation formats (`[1]` and `[id]`) | Pick one; prefer native Citations API |
| No TTFT metric | Track TTFT P50/P95; it dominates user perception |
| Ignoring token usage events | Emit final usage for cost tracking |
| Silent retrieval errors | Emit `error` event with a user-friendly message |
| Retrying a stream on network blip | Resume from last-received token index |

## Production Checklist

- [ ] TTFT P95 < 1000ms
- [ ] Status events (`retrieving`, `reading N sources`) before first token
- [ ] Sources event fires after retrieval, before generation
- [ ] Heartbeat every 15s
- [ ] Native Citations API preferred over `[id]` convention
- [ ] Cancellation path tested (client disconnect, explicit stop)
- [ ] `Cache-Control: no-transform` on SSE responses
- [ ] Error events formatted for client display
- [ ] Final usage event for billing / cost tracking
- [ ] Client renders tokens as they arrive, citations on stable boundaries
- [ ] Fallback to non-streaming endpoint if SSE blocked by corporate proxy
- [ ] OpenTelemetry spans across retrieval + generation; TTFT recorded as a span event
