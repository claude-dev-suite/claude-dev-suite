---
name: agentic-rag
description: |
  Agent-driven RAG patterns. Self-RAG, Corrective RAG (CRAG) with web fallback,
  Adaptive RAG with routing classifier, ReAct with retrieval tool, multi-hop
  retrieval, plan-and-execute, LangGraph state machines for RAG.

  USE WHEN: user mentions "agentic RAG", "Self-RAG", "Corrective RAG", "CRAG",
  "Adaptive RAG", "multi-hop retrieval", "LangGraph RAG", "ReAct RAG",
  "plan and execute RAG"

  DO NOT USE FOR: static retrieval pipelines - use `rag-architecture`;
  query rewriting only - use `query-transformations`; evaluation - use `rag-evaluation`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Agentic RAG

## When to Go Agentic

| Signal | Static RAG | Agentic RAG |
|---|---|---|
| Known single-hop questions | Yes | No |
| Unknown retrieval depth | No | Yes |
| Multi-source (docs + web + DB) | No | Yes |
| Need to detect retrieval failure and recover | No | Yes |
| Latency budget < 2s | Yes | No |
| Audit trail / explainability | Harder | Natural |

Agentic adds latency and cost; use when static cannot recover from retrieval failure or needs multiple steps.

## ReAct with Retrieval Tool

```python
from langchain_core.tools import tool
from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

@tool
def search_kb(query: str) -> str:
    """Search the internal knowledge base. Returns top passages."""
    docs = retriever.invoke(query)
    return "\n\n".join(f"[{d.metadata['id']}] {d.page_content}" for d in docs[:5])

@tool
def search_web(query: str) -> str:
    """Search the open web. Use for recent events or things not in the KB."""
    return tavily_client.search(query, max_results=5)

llm = ChatAnthropic(model="claude-sonnet-4-5-20250929")
agent = create_react_agent(llm, tools=[search_kb, search_web])

result = agent.invoke({"messages": [("human", "What changed in our refund policy since the 2024 update?")]})
```

Agent decides when and what to search; handles multi-hop automatically via tool-loop.

## Self-RAG (self-reflection tokens)

Generate, self-critique retrieval, critique answer, regenerate if needed.

```python
from typing import Literal
from pydantic import BaseModel, Field

class RetrievalDecision(BaseModel):
    needs_retrieval: Literal["yes", "no"]
    reason: str

class Grade(BaseModel):
    score: Literal["relevant", "irrelevant"]
    reason: str

class Support(BaseModel):
    support: Literal["fully_supported", "partially_supported", "not_supported"]
    reason: str

decider = llm.with_structured_output(RetrievalDecision)
grader = llm.with_structured_output(Grade)
supporter = llm.with_structured_output(Support)

def self_rag(question: str, max_retries: int = 2):
    decision = decider.invoke(f"Does answering '{question}' require retrieval from the KB?")
    if decision.needs_retrieval == "no":
        return llm.invoke(question).content

    for attempt in range(max_retries + 1):
        docs = retriever.invoke(question)
        relevant = [d for d in docs
                    if grader.invoke(f"Q: {question}\nPassage: {d.page_content}").score == "relevant"]
        if not relevant and attempt < max_retries:
            question = rewrite(question)  # query rewrite
            continue
        answer = generate_answer(question, relevant)
        sup = supporter.invoke(f"Answer: {answer}\nContext: {[d.page_content for d in relevant]}")
        if sup.support == "fully_supported":
            return answer
        if attempt == max_retries:
            return answer + "\n\n(Partial support only.)"
    return "I could not find enough information."
```

Paper: Asai et al., 2023. The structured critics are the core contribution.

## Corrective RAG (CRAG)

Grade retrieval confidence; on low confidence, rewrite the query and fall back to web search.

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict

class CRAGState(TypedDict):
    question: str
    docs: list
    web_docs: list
    grade: str
    answer: str

def retrieve_node(s: CRAGState) -> CRAGState:
    s["docs"] = retriever.invoke(s["question"])
    return s

def grade_node(s: CRAGState) -> CRAGState:
    grades = [grader.invoke(f"Q:{s['question']}\nPassage:{d.page_content}").score for d in s["docs"]]
    relevant = sum(1 for g in grades if g == "relevant")
    if relevant >= 2:
        s["grade"] = "correct"
    elif relevant >= 1:
        s["grade"] = "ambiguous"
    else:
        s["grade"] = "incorrect"
    s["docs"] = [d for d, g in zip(s["docs"], grades) if g == "relevant"]
    return s

def web_fallback_node(s: CRAGState) -> CRAGState:
    rewritten = rewrite(s["question"])
    s["web_docs"] = tavily_client.search(rewritten, max_results=5)
    return s

def generate_node(s: CRAGState) -> CRAGState:
    ctx = s["docs"] + s.get("web_docs", [])
    s["answer"] = generate_answer(s["question"], ctx)
    return s

def route_after_grade(s: CRAGState) -> str:
    return "generate" if s["grade"] == "correct" else "web_fallback"

g = StateGraph(CRAGState)
g.add_node("retrieve", retrieve_node)
g.add_node("grade", grade_node)
g.add_node("web_fallback", web_fallback_node)
g.add_node("generate", generate_node)
g.set_entry_point("retrieve")
g.add_edge("retrieve", "grade")
g.add_conditional_edges("grade", route_after_grade,
                        {"generate": "generate", "web_fallback": "web_fallback"})
g.add_edge("web_fallback", "generate")
g.add_edge("generate", END)
crag = g.compile()

result = crag.invoke({"question": "What is our refund window for enterprise contracts?"})
```

Web search is the correction leg; works when the KB is narrower than user demand.

## Adaptive RAG

Classifier decides retrieval path up front — skip retrieval for chit-chat, single-hop for factual, multi-hop for research.

```python
from typing import Literal
from pydantic import BaseModel

class RouteDecision(BaseModel):
    path: Literal["no_retrieval", "single_hop", "multi_hop", "web"]
    reason: str

router = llm.with_structured_output(RouteDecision)

def adaptive_rag(q: str):
    d = router.invoke(f"Classify: no_retrieval | single_hop | multi_hop | web\n\nQuery: {q}")
    if d.path == "no_retrieval": return llm.invoke(q).content
    docs = (tavily_client.search(q, max_results=5) if d.path == "web"
            else retriever.invoke(q) if d.path == "single_hop"
            else multi_hop_retrieve(q, hops=3))
    return generate_answer(q, docs)
```

## Multi-Hop Retrieval

Iteratively retrieve, synthesize a sub-question, retrieve again. Cap hops (3-5) to bound cost; stop on explicit DONE, query repetition, or hop limit.

```python
def multi_hop_retrieve(q: str, hops: int = 3) -> list:
    accumulated, current_q = [], q
    for _ in range(hops):
        docs = retriever.invoke(current_q)
        accumulated.extend(docs)
        ctx = "\n\n".join(d.page_content for d in docs)
        follow_up = llm.invoke(
            f"Given partial context, what sub-question refines '{q}'? Reply 'DONE' if sufficient.\n\n{ctx}"
        ).content.strip()
        if follow_up == "DONE" or follow_up == current_q:
            break
        current_q = follow_up
    seen, out = set(), []
    for d in accumulated:
        key = d.metadata.get("id") or hash(d.page_content)
        if key not in seen: seen.add(key); out.append(d)
    return out
```

## Plan-and-Execute RAG

Make the plan once up front, execute steps, synthesize. Lower latency variance than ReAct loops but worse recovery from surprises.

```python
from pydantic import BaseModel
from typing import Literal

class Step(BaseModel):
    action: Literal["retrieve", "compute", "answer"]
    input: str

class Plan(BaseModel):
    steps: list[Step]

planner = llm.with_structured_output(Plan)

def plan_and_execute(q: str):
    plan = planner.invoke(f"Break into 2-5 steps (retrieve/compute/answer): {q}")
    scratch = []
    for step in plan.steps:
        if step.action == "retrieve":
            docs = retriever.invoke(step.input)
            scratch.append({"q": step.input, "r": [d.page_content for d in docs[:3]]})
        elif step.action == "compute":
            scratch.append({"q": step.input, "r": llm.invoke(
                f"Compute: {step.input}\nCtx: {scratch}").content})
    return llm.invoke(f"Using this scratchpad, answer: {q}\n\n{scratch}").content
```

## Guardrails on Agent Loops

Every agentic flow must bound tool calls, tokens, and wall-clock time. LangGraph's `recursion_limit` caps graph iterations; combine with `asyncio.wait_for`.

```python
import asyncio

MAX_TOOL_CALLS = 8
HARD_TIMEOUT_S = 30

async def bounded_invoke(app, inputs):
    try:
        return await asyncio.wait_for(
            app.ainvoke(inputs, config={"recursion_limit": MAX_TOOL_CALLS}),
            timeout=HARD_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        return {"answer": "Timed out; returning partial context.", "partial": True}
```

LangGraph additionally provides checkpointing (`MemorySaver`, Postgres), streaming events, and human-in-the-loop pauses — use a persistent checkpointer in production so you can replay agent traces.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Agentic RAG for simple FAQ | Use static — the loop adds latency and cost for nothing |
| No step cap | Always set `recursion_limit` and a wall-clock timeout |
| Agent decides between 20 tools | Group tools; router picks a subset first |
| Opus for every node | Haiku for classifiers/graders, Sonnet for synthesis |
| No streaming from graph | Stream events; users see progress on multi-step flows |
| Graders and answerer use same model+prompt | Separate roles; use structured output for graders |
| No checkpointing | Use `MemorySaver` / Postgres checkpointer for recovery |
| Web fallback always on | Trigger only when KB grade is low (CRAG pattern) |
| Multi-hop with unbounded hops | Hard cap at 3-5; add stop criterion |
| No observability | Use LangSmith or OpenTelemetry; agent loops are opaque otherwise |

## Production Checklist

- [ ] Routing classifier decides retrieval path (adaptive RAG)
- [ ] Grader on retrieval confidence (CRAG)
- [ ] Web fallback wired behind low-confidence branch
- [ ] Hop / recursion limits enforced
- [ ] Hard wall-clock timeout per request
- [ ] Haiku for graders/routers, Sonnet for synthesis
- [ ] Structured output for every graded decision (Pydantic schemas)
- [ ] LangGraph checkpointer persistent (Postgres/Redis) in production
- [ ] LangSmith or OpenTelemetry tracing on every node
- [ ] Streaming of intermediate events to UI
- [ ] Fallback to static RAG on agent error
- [ ] Cost per query dashboarded — agentic paths cost 3-10x static
