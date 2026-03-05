---
name: langchain
description: |
  LangChain framework for LLM application development. Covers chains, agents,
  tools, RAG pipelines, vector stores, memory, and LangChain Expression
  Language (LCEL). Python and TypeScript/JavaScript.

  USE WHEN: user mentions "langchain", "LLM chain", "AI agent", "LCEL",
  "retrieval chain", "LangChain tools", "LangSmith", "LangGraph"

  DO NOT USE FOR: direct API calls without framework - use Claude/OpenAI SDK;
  vector database specifics - use `vector-databases`;
  RAG architecture patterns - use `rag-patterns`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# LangChain

## LCEL (LangChain Expression Language — recommended)

```python
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

model = ChatAnthropic(model="claude-sonnet-4-20250514")
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant specialized in {topic}."),
    ("human", "{question}"),
])

# Pipe syntax
chain = prompt | model | StrOutputParser()
result = chain.invoke({"topic": "Python", "question": "Explain decorators"})

# Streaming
async for chunk in chain.astream({"topic": "Python", "question": "Explain decorators"}):
    print(chunk, end="")
```

### TypeScript
```typescript
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a helpful assistant specialized in {topic}.'],
  ['human', '{question}'],
]);

const chain = prompt.pipe(model).pipe(new StringOutputParser());
const result = await chain.invoke({ topic: 'TypeScript', question: 'Explain generics' });
```

## RAG Chain

```python
from langchain_community.vectorstores import Chroma
from langchain_anthropic import ChatAnthropic
from langchain_openai import OpenAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough

# Setup
embeddings = OpenAIEmbeddings()
vectorstore = Chroma(persist_directory="./chroma_db", embedding_function=embeddings)
retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

prompt = ChatPromptTemplate.from_template("""
Answer based on the context. If unsure, say so.

Context: {context}
Question: {question}
""")

chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | ChatAnthropic(model="claude-sonnet-4-20250514")
    | StrOutputParser()
)

answer = chain.invoke("How does authentication work?")
```

## Tools and Agents

```python
from langchain_core.tools import tool
from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

@tool
def search_database(query: str) -> str:
    """Search the product database by query."""
    results = db.search(query)
    return json.dumps(results)

@tool
def calculate_price(product_id: str, quantity: int) -> float:
    """Calculate total price for a product and quantity."""
    product = db.get_product(product_id)
    return product.price * quantity

model = ChatAnthropic(model="claude-sonnet-4-20250514")
agent = create_react_agent(model, [search_database, calculate_price])

result = agent.invoke({"messages": [("human", "Find laptop prices and calculate cost for 5 units")]})
```

## Structured Output

```python
from pydantic import BaseModel, Field

class ExtractedInfo(BaseModel):
    name: str = Field(description="Person's name")
    email: str = Field(description="Email address")
    sentiment: str = Field(description="positive, negative, or neutral")

structured_model = model.with_structured_output(ExtractedInfo)
result = structured_model.invoke("John (john@example.com) loves the product!")
# ExtractedInfo(name='John', email='john@example.com', sentiment='positive')
```

## Document Loading and Splitting

```python
from langchain_community.document_loaders import PyPDFLoader, WebBaseLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Load
docs = PyPDFLoader("document.pdf").load()

# Split
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_documents(docs)

# Store in vectorstore
vectorstore = Chroma.from_documents(chunks, embeddings, persist_directory="./db")
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Legacy `LLMChain` API | Use LCEL pipe syntax |
| No streaming for user-facing | Always stream with `astream` |
| Huge chunks in RAG | Use 500-1000 char chunks with 200 overlap |
| No retrieval evaluation | Track retrieval quality with LangSmith |
| Agent without tool descriptions | Write clear docstrings — LLM uses them |
| Embedding model mismatch | Same embedding model for indexing and querying |

## Production Checklist

- [ ] LCEL syntax (not legacy chains)
- [ ] Streaming enabled for user-facing responses
- [ ] LangSmith tracing for debugging/evaluation
- [ ] Structured output with Pydantic models
- [ ] Proper chunk size and overlap for RAG
- [ ] Error handling and fallbacks in chains
- [ ] Rate limiting on external tool calls
