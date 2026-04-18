---
name: conversational-rag
description: |
  Multi-turn RAG: chat history management, context window compaction (summarization,
  sliding window, vector memory), query rewriting with coreference resolution, follow-up
  vs new-query routing, LangChain ConversationalRetrievalChain, LlamaIndex ChatEngine,
  Redis/Postgres message history stores.

  USE WHEN: user mentions "conversational RAG", "multi-turn RAG", "chat history",
  "follow-up question", "chat memory", "ChatEngine", "ConversationalRetrievalChain",
  "coreference in RAG"

  DO NOT USE FOR: single-turn pipelines - use `rag-architecture`;
  query rewriting in isolation - use `query-transformations`;
  user-level long-term memory - use `personalization-rag`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Conversational RAG

## The Core Problem

A retriever only sees the current query. In multi-turn chat the query is ambiguous without prior context:

```
User: What was revenue in Q3?
Bot:  Revenue was $4.2M.
User: How did that compare to last year?   <- "that" = Q3 revenue
```

Retrieving on "How did that compare to last year?" matches nothing. The retriever must see a reformulated, self-contained query.

## Pipeline

```
[history + current_q] -> [condenser LLM] -> [standalone_q] -> [retriever] -> [answer LLM(history, standalone_q, docs)]
```

Two LLM calls per turn: one cheap (Haiku) for condensation, one standard for synthesis.

## Query Condensation (Haiku)

```python
from anthropic import Anthropic

client = Anthropic()

CONDENSE_PROMPT = """Given the conversation so far and the latest user message,
rewrite the latest message as a standalone question that can be understood without
the prior messages. Resolve pronouns and elliptical references. If the latest
message is already standalone, return it unchanged.

Conversation:
{history}

Latest message: {question}

Standalone question:"""

def condense(history: list[dict], question: str) -> str:
    hist_str = "\n".join(f"{m['role']}: {m['content']}" for m in history[-8:])
    msg = client.messages.create(
        model="claude-haiku-4-5-20250929",
        max_tokens=256,
        messages=[{"role": "user", "content": CONDENSE_PROMPT.format(
            history=hist_str, question=question)}],
    )
    return msg.content[0].text.strip()
```

Keep only the last 8 turns in the condenser prompt — older turns rarely affect coreference and inflate cost.

## Follow-up vs New Query Routing

Not every turn needs retrieval. Classify first, retrieve only when needed.

```python
from pydantic import BaseModel
from typing import Literal
from langchain_anthropic import ChatAnthropic

class TurnType(BaseModel):
    kind: Literal["follow_up", "new_query", "chit_chat", "meta"]
    needs_retrieval: bool

llm = ChatAnthropic(model="claude-haiku-4-5-20250929").with_structured_output(TurnType)

def classify(history, question) -> TurnType:
    return llm.invoke(
        f"Classify the latest message.\nHistory: {history[-4:]}\nLatest: {question}"
    )
```

`meta` (e.g. "summarize our conversation", "what did you say earlier") does not require retrieval. `chit_chat` ("thanks!") either.

## History Compaction Strategies

| Strategy | Keeps | Token Cost | Loses | Best For |
|---|---|---|---|---|
| Full transcript | Everything | Unbounded | Nothing | Short sessions |
| Sliding window | Last N turns | Bounded | Early context | Most chatbots |
| Summary buffer | Rolling summary + last N | Bounded | Detail in old turns | Long sessions with continuity |
| Vector memory | Retrieved past turns | Bounded | Linearity | Returning users |
| Hierarchical | Summary of summaries | Bounded | Recency | Very long sessions |

### Sliding Window

```python
def sliding_window(history: list[dict], n: int = 10) -> list[dict]:
    return history[-n:]
```

### Summary Buffer (LangChain 0.3+ via LangGraph)

```python
from langgraph.graph import MessagesState, StateGraph
from langchain_core.messages import RemoveMessage, SystemMessage

SUMMARY_AFTER = 20  # messages

def maybe_summarize(state: MessagesState):
    msgs = state["messages"]
    if len(msgs) <= SUMMARY_AFTER:
        return {}
    to_summarize = msgs[:-8]
    summary = llm.invoke(
        [SystemMessage("Summarize the prior conversation in <= 300 words."),
         *to_summarize]
    ).content
    removals = [RemoveMessage(id=m.id) for m in to_summarize]
    return {"messages": [SystemMessage(f"Summary so far: {summary}"), *removals]}
```

### Vector Memory (retrieve relevant past turns)

```python
from langchain_qdrant import QdrantVectorStore
from langchain_openai import OpenAIEmbeddings

mem_store = QdrantVectorStore.from_documents([], OpenAIEmbeddings(), collection_name="chat_mem")

def remember(session_id: str, turn: dict):
    mem_store.add_texts([turn["content"]], metadatas=[{"session_id": session_id, **turn}])

def recall(session_id: str, query: str, k: int = 3):
    return mem_store.similarity_search(query, k=k, filter={"session_id": session_id})
```

Best paired with a sliding window of the immediate turns — vector memory catches long-range callbacks while recency is handled verbatim.

## LangChain 0.3+ Conversational Retrieval (LCEL)

`ConversationalRetrievalChain` is deprecated. The idiomatic pattern uses `create_history_aware_retriever` + `create_retrieval_chain`.

```python
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_anthropic import ChatAnthropic

llm = ChatAnthropic(model="claude-sonnet-4-5-20250929")

condense_prompt = ChatPromptTemplate.from_messages([
    ("system", "Given the chat history and latest question, rewrite it as standalone."),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
])
history_aware_retriever = create_history_aware_retriever(llm, retriever, condense_prompt)

qa_prompt = ChatPromptTemplate.from_messages([
    ("system", "Answer using the context. Cite [source_id].\n\nContext:\n{context}"),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
])
qa_chain = create_stuff_documents_chain(llm, qa_prompt)

rag_chain = create_retrieval_chain(history_aware_retriever, qa_chain)

result = rag_chain.invoke({"input": "How did that compare to last year?",
                           "chat_history": prior_messages})
```

## LlamaIndex ChatEngine

```python
from llama_index.core.chat_engine import CondensePlusContextChatEngine
from llama_index.core.memory import ChatMemoryBuffer
from llama_index.llms.anthropic import Anthropic

memory = ChatMemoryBuffer.from_defaults(token_limit=4000)

chat_engine = CondensePlusContextChatEngine.from_defaults(
    retriever=index.as_retriever(similarity_top_k=5),
    llm=Anthropic(model="claude-sonnet-4-5-20250929"),
    memory=memory,
    context_prompt=(
        "Context:\n{context_str}\n\n"
        "Answer using context; cite [id]. If insufficient, say so."
    ),
)
response = chat_engine.chat("How did that compare to last year?")
```

Modes:
- `condense_plus_context` — condense + retrieve + answer (best default).
- `context` — retrieve on raw query only (misses coreference).
- `condense_question` — condense + retrieve, no chat history in answer prompt.
- `react` — ReAct with retrieval as a tool; handles multi-hop follow-ups.

## Message History Stores

### Redis (production default)

```python
from langchain_community.chat_message_histories import RedisChatMessageHistory

def get_history(session_id: str):
    return RedisChatMessageHistory(
        session_id=session_id,
        url="redis://localhost:6379/0",
        ttl=60 * 60 * 24 * 7,  # 7 day TTL
    )
```

Set a TTL. Chat history is PII — expire it.

### Postgres

```python
from langchain_postgres import PostgresChatMessageHistory
import psycopg

conn = psycopg.connect("postgresql://...")
PostgresChatMessageHistory.create_tables(conn, "chat_history")

def get_history(session_id: str):
    return PostgresChatMessageHistory("chat_history", session_id, sync_connection=conn)
```

Use Postgres when you need to query history (analytics, audit, compliance).

### LangGraph Checkpointer (state + history together)

```python
from langgraph.checkpoint.postgres import PostgresSaver

checkpointer = PostgresSaver.from_conn_string("postgresql://...")
checkpointer.setup()
app = graph.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": session_id}}
app.invoke({"messages": [("human", question)]}, config=config)
```

Preferred for agentic conversational RAG — state survives restarts and can be replayed.

## TypeScript (Vercel AI SDK)

```ts
import { streamText, convertToCoreMessages } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  const standalone = await condense(messages);
  const docs = await retriever.search(standalone, 5);

  const result = await streamText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    system: `Answer using context. Cite [id].\n\nContext:\n${docs.map(d => `[${d.id}] ${d.text}`).join('\n\n')}`,
    messages: convertToCoreMessages(messages),
  });
  return result.toDataStreamResponse();
}
```

## Prompt Caching for History

History repeats token-for-token on every turn. Cache it.

```python
client.messages.create(
    model="claude-sonnet-4-5-20250929",
    system=[
        {"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}},
    ],
    messages=[
        *history,
        {"role": "user", "content": [
            {"type": "text", "text": f"Context:\n{ctx}\n\nQ: {question}"},
        ]},
    ],
    max_tokens=1024,
)
```

Cache hits on the system prompt save ~90% on input tokens; effective for long system instructions or large persona blocks.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Retrieving on the raw latest message | Condense first with history-aware rewriter |
| Passing full history to the retriever as the query string | Use standalone condensed query; keep history for answer LLM only |
| Unbounded chat history | Sliding window + summary buffer |
| Sonnet/Opus for condensation | Haiku is enough; condensation is straightforward |
| No session isolation in vector memory | Filter by `session_id` / `user_id` on every recall |
| In-memory `ChatMessageHistory` in production | Redis or Postgres with TTL |
| Re-running retrieval for chit-chat | Classify turn first |
| No coreference handling | "it", "that", "last one" silently kill recall |
| History PII stored forever | TTL + right-to-erase handling |
| Retrieval context dumped verbatim every turn | Only include retrieved docs for the current turn |

## Production Checklist

- [ ] Turn classifier routes follow-up, new query, chit-chat, meta
- [ ] History-aware retriever condenses before retrieval
- [ ] History compaction strategy chosen (sliding window default)
- [ ] Summary buffer triggers above N messages
- [ ] Session-scoped vector memory if sessions are long-running
- [ ] Redis or Postgres message store with TTL
- [ ] LangGraph checkpointer for agentic conversational flows
- [ ] Haiku for condensation, Sonnet for synthesis
- [ ] Prompt caching enabled on system + persona
- [ ] PII expiration + right-to-erase endpoint
- [ ] Tracing per turn (LangSmith/LangFuse) with condensed query logged
- [ ] Token budget monitored per turn; alert above threshold
