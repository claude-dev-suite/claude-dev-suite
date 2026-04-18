---
name: langgraph-rag
description: |
  LangGraph state machines for RAG and agentic flows. Covers typed state,
  conditional edges for routing (answer/clarify/retrieve/rewrite),
  checkpointing with SqliteSaver/PostgresSaver, human-in-the-loop
  interrupts, multi-agent supervisor patterns, Self-RAG and CRAG as
  explicit graphs, combining with LangChain retrievers.

  USE WHEN: user mentions "LangGraph", "StateGraph", "agentic RAG",
  "conditional edges", "checkpointer", "human in the loop",
  "Self-RAG", "CRAG", "corrective RAG", "supervisor agent", "LangGraph RAG"

  DO NOT USE FOR: plain LangChain chains - use `langchain`;
  LlamaIndex workflows - use `llamaindex`;
  generic agentic RAG theory - use `agentic-rag`;
  DSPy programs - use `dspy`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# LangGraph for RAG

LangGraph models RAG as an explicit DAG/cyclic graph over a typed state. Unlike LCEL chains, it supports loops, branching, checkpointing, and HITL — exactly what agentic RAG needs.

## Installation

```bash
pip install langgraph langchain langchain-anthropic langchain-openai \
            langchain-community langgraph-checkpoint-sqlite \
            langgraph-checkpoint-postgres
```

## Typed State

```python
from typing import Annotated, Literal, TypedDict
from langgraph.graph.message import add_messages
from langchain_core.documents import Document
from langchain_core.messages import BaseMessage

class RagState(TypedDict):
    question: str
    rewritten_question: str
    documents: list[Document]
    grade: Literal["relevant", "irrelevant", "partial"]
    attempts: int
    answer: str
    messages: Annotated[list[BaseMessage], add_messages]
```

`Annotated[list, add_messages]` uses a reducer so each node can *append* messages without clobbering prior turns. Without a reducer, each node overwrites the slot.

## Minimal Agentic RAG Graph

```python
from langgraph.graph import StateGraph, START, END
from langchain_anthropic import ChatAnthropic
from langchain_community.vectorstores import Chroma
from langchain_openai import OpenAIEmbeddings

llm = ChatAnthropic(model="claude-sonnet-4-5", temperature=0)
vs = Chroma(persist_directory="./chroma", embedding_function=OpenAIEmbeddings())

def retrieve(state: RagState) -> dict:
    docs = vs.similarity_search(state["rewritten_question"] or state["question"], k=6)
    return {"documents": docs}

def grade(state: RagState) -> dict:
    prompt = f"Are the documents relevant to '{state['question']}'? Reply relevant|irrelevant|partial.\n\n" \
             + "\n---\n".join(d.page_content[:400] for d in state["documents"])
    verdict = llm.invoke(prompt).content.strip().lower()
    return {"grade": verdict if verdict in {"relevant","irrelevant","partial"} else "irrelevant"}

def rewrite(state: RagState) -> dict:
    new_q = llm.invoke(f"Rewrite for better retrieval: {state['question']}").content
    return {"rewritten_question": new_q, "attempts": state.get("attempts", 0) + 1}

def generate(state: RagState) -> dict:
    ctx = "\n\n".join(d.page_content for d in state["documents"])
    resp = llm.invoke(f"Answer using context.\n\nContext:\n{ctx}\n\nQ: {state['question']}")
    return {"answer": resp.content}

def route_after_grade(state: RagState) -> str:
    if state["grade"] == "relevant":
        return "generate"
    if state.get("attempts", 0) >= 2:
        return "generate"      # give up; best effort
    return "rewrite"

graph = StateGraph(RagState)
graph.add_node("retrieve", retrieve)
graph.add_node("grade", grade)
graph.add_node("rewrite", rewrite)
graph.add_node("generate", generate)

graph.add_edge(START, "retrieve")
graph.add_edge("retrieve", "grade")
graph.add_conditional_edges("grade", route_after_grade, {
    "rewrite": "rewrite", "generate": "generate",
})
graph.add_edge("rewrite", "retrieve")
graph.add_edge("generate", END)

app = graph.compile()
result = app.invoke({"question": "How do we rotate DB credentials?"})
```

## CRAG (Corrective RAG) as LangGraph

CRAG = retrieve → grade → if irrelevant, fall back to web search → generate.

```python
from langchain_community.tools.tavily_search import TavilySearchResults
web = TavilySearchResults(k=5)

def web_search(state: RagState) -> dict:
    hits = web.invoke(state["rewritten_question"] or state["question"])
    return {"documents": [Document(page_content=h["content"], metadata={"url": h["url"]}) for h in hits]}

def route_crag(state: RagState) -> str:
    return {"relevant": "generate", "partial": "generate",
            "irrelevant": "web_search"}[state["grade"]]

g = StateGraph(RagState)
g.add_node("retrieve", retrieve)
g.add_node("grade", grade)
g.add_node("web_search", web_search)
g.add_node("generate", generate)
g.add_edge(START, "retrieve")
g.add_edge("retrieve", "grade")
g.add_conditional_edges("grade", route_crag)
g.add_edge("web_search", "generate")
g.add_edge("generate", END)
crag_app = g.compile()
```

## Self-RAG as LangGraph

Self-RAG adds reflection tokens: `Retrieve?`, `IsRel`, `IsSup`, `IsUse`. Each becomes a node.

```python
def decide_retrieve(state) -> str:
    v = llm.invoke(f"Does this need retrieval? yes/no. Q: {state['question']}").content.lower()
    return "retrieve" if "yes" in v else "direct_answer"

def check_support(state) -> dict:
    prompt = f"Is the draft supported by the docs? supported|partial|unsupported.\n\nDraft:{state['answer']}"
    return {"grade": llm.invoke(prompt).content.strip().lower()}

# Wire: START -> decide_retrieve -> retrieve -> grade -> generate -> check_support -> (regenerate | END)
```

## Checkpointing (durable state + resumability)

```python
from langgraph.checkpoint.sqlite import SqliteSaver
checkpointer = SqliteSaver.from_conn_string("./lg_state.sqlite")
app = graph.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "user-42"}}
app.invoke({"question": "..."}, config=config)
# Later, resume mid-graph:
state = app.get_state(config)
print(state.next, state.values)
```

Postgres for multi-worker:

```python
from langgraph.checkpoint.postgres import PostgresSaver
checkpointer = PostgresSaver.from_conn_string("postgresql://user:pw@host/db")
checkpointer.setup()
```

## Human-in-the-Loop (interrupts)

```python
from langgraph.types import interrupt, Command

def confirm_cypher(state):
    decision = interrupt({"cypher": state["generated_cypher"], "ask": "Run this query?"})
    return {"approved": decision == "yes"}

graph.add_node("confirm_cypher", confirm_cypher)
# Client-side:
# app.invoke(inputs, config)   # pauses at interrupt
# app.invoke(Command(resume="yes"), config)   # continue
```

Use for: destructive actions, costly tool calls, schema changes, low-confidence answers.

## Multi-Agent Supervisor Pattern

```python
from langgraph.prebuilt import create_react_agent

retriever_agent = create_react_agent(llm, tools=[retrieval_tool], prompt="Retrieval specialist.")
sql_agent       = create_react_agent(llm, tools=[sql_tool],       prompt="SQL specialist.")
graph_agent     = create_react_agent(llm, tools=[cypher_tool],    prompt="Graph DB specialist.")

def supervisor(state):
    route = llm.invoke(f"Route to retriever|sql|graph|finish: {state['question']}").content.strip()
    return {"route": route}

def pick(state) -> str:
    return state["route"]

super_g = StateGraph(RagState)
super_g.add_node("supervisor", supervisor)
super_g.add_node("retriever", retriever_agent)
super_g.add_node("sql", sql_agent)
super_g.add_node("graph", graph_agent)
super_g.add_edge(START, "supervisor")
super_g.add_conditional_edges("supervisor", pick,
    {"retriever": "retriever", "sql": "sql", "graph": "graph", "finish": END})
for n in ("retriever", "sql", "graph"):
    super_g.add_edge(n, "supervisor")     # return to supervisor
```

## Streaming

```python
async for event in app.astream_events({"question": "..."}, version="v2"):
    if event["event"] == "on_chat_model_stream":
        print(event["data"]["chunk"].content, end="")
```

`stream_mode="values"` emits full state snapshots; `"updates"` emits per-node deltas; `"messages"` emits token chunks.

## Combining with LangChain Retrievers

Any LangChain retriever drops straight into a node:

```python
from langchain.retrievers import EnsembleRetriever, BM25Retriever
retriever = EnsembleRetriever(
    retrievers=[vs.as_retriever(search_kwargs={"k": 8}), BM25Retriever.from_documents(docs)],
    weights=[0.6, 0.4],
)
def retrieve(state): return {"documents": retriever.invoke(state["question"])}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| One giant node that does retrieve + rewrite + generate | Split per responsibility; enables partial reruns |
| Unbounded rewrite loop | Cap via `attempts` counter in state + `add_conditional_edges` guard |
| Forgetting message reducer | `Annotated[list, add_messages]` so appends compose |
| In-memory checkpointer in prod | Use `PostgresSaver` or `SqliteSaver` on durable volume |
| LLM-generated Cypher without HITL | Gate with `interrupt()` before execution |
| Sharing `thread_id` across users | Namespace per user/session to avoid state bleed |
| No timeout on tool nodes | Wrap with `asyncio.wait_for` or LangGraph `RunnableConfig` timeout |

## Production Checklist

- [ ] Typed `TypedDict` state with explicit reducers
- [ ] Durable checkpointer (Postgres) with `thread_id` per user/session
- [ ] Retry/timeout wrappers on external tool nodes
- [ ] Max-iteration guards on all cyclic edges
- [ ] HITL interrupt for destructive or high-cost actions
- [ ] Tracing to LangSmith (`LANGCHAIN_TRACING_V2=true`)
- [ ] Stream tokens via `astream_events` for UX
- [ ] Unit tests per node + integration test over full graph
- [ ] Golden-set eval on end-to-end trajectory, not just final answer
