---
name: dspy
description: |
  DSPy 2.5+ for programming (not prompting) LMs. Covers Signatures, Modules
  (Predict, ChainOfThought, ReAct, Retrieve), compilers/optimizers (BootstrapFewShot,
  MIPROv2, BootstrapFinetune), retrievers, evaluation, and production deployment
  of compiled programs.

  USE WHEN: user mentions "DSPy", "dspy.Module", "dspy.Signature", "MIPROv2",
  "BootstrapFewShot", "ChainOfThought optimization", "program > prompt"

  DO NOT USE FOR: manual prompt templates - use `langchain`;
  LlamaIndex query engines - use `llamaindex`;
  generic RAG architecture - use `rag-patterns`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# DSPy

## Philosophy

DSPy treats LLM programs like neural networks: you declare the computation
(Modules + Signatures) and a compiler optimizes the prompts (few-shot demos,
instructions, even weights) against a metric. You never write brittle prompt
strings - you declare the I/O contract and let the optimizer tune it.

## Installation

```bash
pip install -U dspy
```

## Configure LM and Retriever

```python
import dspy

lm = dspy.LM("anthropic/claude-sonnet-4-20250514", api_key=ANTHROPIC_API_KEY, max_tokens=2048)
dspy.configure(lm=lm)

# Optional: OpenAI, Azure, Ollama, HuggingFace TGI, vLLM, Databricks...
# dspy.LM("openai/gpt-4o")
# dspy.LM("ollama/llama3.1:8b", api_base="http://localhost:11434")
```

## Signatures

```python
# Inline
qa = dspy.Predict("question -> answer")

# Class-based with descriptions + types
class GenerateAnswer(dspy.Signature):
    """Answer questions using the provided context."""
    context: list[str] = dspy.InputField(desc="retrieved passages")
    question: str = dspy.InputField()
    answer: str = dspy.OutputField(desc="concise answer with citations")

pred = dspy.Predict(GenerateAnswer)
out = pred(context=["Paris is the capital of France."], question="What is France's capital?")
print(out.answer)
```

## Modules

```python
# Predict - single-shot
predict = dspy.Predict(GenerateAnswer)

# ChainOfThought - adds a reasoning field
cot = dspy.ChainOfThought(GenerateAnswer)

# ProgramOfThought - code reasoning
pot = dspy.ProgramOfThought("question -> answer")

# ReAct - tool use
def search_web(query: str) -> str:
    """Search the web."""
    return "..."
react = dspy.ReAct("question -> answer", tools=[search_web])

# MultiChainComparison - sample N chains, pick best
compare = dspy.MultiChainComparison(GenerateAnswer, M=5)
```

## RAG Module (custom)

```python
class RAG(dspy.Module):
    def __init__(self, num_passages: int = 5):
        super().__init__()
        self.retrieve = dspy.Retrieve(k=num_passages)
        self.generate = dspy.ChainOfThought(GenerateAnswer)

    def forward(self, question: str):
        passages = self.retrieve(question).passages
        return self.generate(context=passages, question=question)

rag = RAG(num_passages=5)
result = rag("Who wrote the Python language?")
print(result.answer)
```

## Retrievers

```python
# ColBERTv2 (hosted example from DSPy docs)
colbert = dspy.ColBERTv2(url="http://20.102.90.50:2017/wiki17_abstracts")
dspy.configure(rm=colbert)

# Chroma
from dspy.retrieve.chromadb_rm import ChromadbRM
chroma = ChromadbRM(collection_name="docs", persist_directory="./chroma", k=5)

# Qdrant
from dspy.retrieve.qdrant_rm import QdrantRM
qdrant = QdrantRM(qdrant_collection_name="docs", qdrant_client=client, k=5)

# Pinecone, Weaviate, Milvus, FAISS - similar adapters under dspy.retrieve
```

## Compilation (Optimization)

### BootstrapFewShot

```python
from dspy.teleprompt import BootstrapFewShot

trainset = [
    dspy.Example(question="What is 2+2?", answer="4").with_inputs("question"),
    dspy.Example(question="Capital of Spain?", answer="Madrid").with_inputs("question"),
    # ... ~20-200 examples
]

def em_metric(example, pred, trace=None) -> bool:
    return pred.answer.strip().lower() == example.answer.strip().lower()

optimizer = BootstrapFewShot(metric=em_metric, max_bootstrapped_demos=4, max_labeled_demos=8)
compiled_rag = optimizer.compile(RAG(), trainset=trainset)
```

### MIPROv2 (joint instruction + few-shot optimization)

```python
from dspy.teleprompt import MIPROv2

miprov2 = MIPROv2(
    metric=em_metric,
    auto="medium",                 # light | medium | heavy
    num_threads=16,
)

compiled_rag = miprov2.compile(
    RAG(),
    trainset=trainset,
    valset=valset,
    max_bootstrapped_demos=4,
    max_labeled_demos=4,
    requires_permission_to_run=False,
)
```

### BootstrapFinetune (weights, not prompts)

```python
from dspy.teleprompt import BootstrapFinetune

finetuner = BootstrapFinetune(metric=em_metric)
finetuned = finetuner.compile(RAG(), trainset=trainset, target="meta-llama/Llama-3.1-8B-Instruct")
```

## Evaluation

```python
from dspy.evaluate import Evaluate

evaluate = Evaluate(
    devset=devset,
    num_threads=8,
    display_progress=True,
    display_table=5,
)

def f1_metric(example, pred, trace=None) -> float:
    gold = set(example.answer.lower().split())
    got = set(pred.answer.lower().split())
    if not gold or not got:
        return 0.0
    precision = len(gold & got) / len(got)
    recall = len(gold & got) / len(gold)
    return 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

score = evaluate(compiled_rag, metric=f1_metric)
print("F1:", score)
```

## Multi-Stage Program (Query Rewrite + Retrieve + Answer)

```python
class RewriteQuery(dspy.Signature):
    """Rewrite the user question to maximize retrieval recall."""
    question: str = dspy.InputField()
    rewritten: str = dspy.OutputField(desc="expanded query with synonyms")

class MultiStageRAG(dspy.Module):
    def __init__(self, k: int = 5):
        super().__init__()
        self.rewrite = dspy.ChainOfThought(RewriteQuery)
        self.retrieve = dspy.Retrieve(k=k)
        self.generate = dspy.ChainOfThought(GenerateAnswer)

    def forward(self, question: str):
        rw = self.rewrite(question=question).rewritten
        passages = self.retrieve(rw).passages
        return self.generate(context=passages, question=question)
```

## Assertions and Suggestions

```python
import dspy

class AnswerWithCitations(dspy.Module):
    def __init__(self):
        super().__init__()
        self.qa = dspy.ChainOfThought("context, question -> answer")

    def forward(self, context, question):
        pred = self.qa(context=context, question=question)
        dspy.Suggest(
            "[Source:" in pred.answer,
            "Include at least one [Source: ...] citation in the answer.",
        )
        dspy.Suggest(
            len(pred.answer.split()) < 200,
            "Keep the answer under 200 words.",
        )
        return pred
```

Wrap the module with `dspy.assert_transform_module` and a backtrack handler
to retry with feedback when suggestions fail.

## Save and Load Compiled Programs

```python
compiled_rag.save("rag_v1.json")

loaded = RAG()
loaded.load("rag_v1.json")
answer = loaded("What is DSPy?")
```

## Observability

```python
dspy.configure(track_usage=True)
pred = rag("What is DSPy?")
print(pred.get_lm_usage())       # {'anthropic/claude-...': {'prompt_tokens': ..., 'completion_tokens': ...}}

# History inspection
dspy.inspect_history(n=3)
```

### MLflow / Phoenix tracing

```python
import mlflow
mlflow.dspy.autolog()
# Or: from phoenix.otel import register; register(project_name="dspy-rag")
```

## Async Execution

```python
async def amain():
    async_rag = dspy.asyncify(compiled_rag)
    result = await async_rag("Explain RAG in one sentence.")
    print(result.answer)
```

## Deployment

```python
import json
from fastapi import FastAPI

app = FastAPI()
program = RAG()
program.load("rag_v1.json")

@app.post("/ask")
async def ask(payload: dict):
    pred = program(question=payload["question"])
    return {"answer": pred.answer, "reasoning": getattr(pred, "reasoning", None)}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Writing prompt strings by hand | Declare a Signature, let the compiler write prompts |
| Skipping compilation | Uncompiled programs are baselines - always compile |
| No dev/val split | Split `trainset` / `valset` / `devset` - optimizers need them |
| Metric that only returns 0/1 on hard tasks | Use graded metrics (F1, BLEU, LLM judge) |
| Saving uncompiled module | Save with `.save()` after compilation; reload matches signatures |
| Running optimizer without a metric | Every teleprompter requires a callable metric |

## Production Checklist

- [ ] Signatures have typed inputs/outputs and field descriptions
- [ ] Program compiled with MIPROv2 (or BootstrapFewShot for small data)
- [ ] Metric validated on a held-out devset
- [ ] Compiled JSON saved and version-controlled
- [ ] Token usage tracking (`track_usage=True`) wired to telemetry
- [ ] Tracing (MLflow or Phoenix) enabled in staging
- [ ] Async wrapping for concurrent request handling
- [ ] Fallback to a non-compiled baseline on optimizer failure
