---
name: code-chunking
description: |
  AST-aware chunking for source code RAG. Covers tree-sitter, LangChain Language
  splitter, LlamaIndex CodeSplitter, preserving function/class boundaries, keeping
  docstrings with implementations, and code-specific embeddings (voyage-code-2,
  CodeBERT).

  USE WHEN: user mentions "code chunking", "tree-sitter", "code splitter",
  "AST chunking", "code embedding", "voyage-code-2", "code RAG", "repo Q&A"

  DO NOT USE FOR: plain prose chunking - use `rag-patterns`;
  PDF extraction - use `pdf-extraction`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Code Chunking

## Why AST-Based Chunking

Character splitters can split a function mid-body, separating a signature from
its return statement. AST chunking respects function and class boundaries so
each chunk is a self-contained semantic unit - dramatically better retrieval
and generation quality for code.

## tree-sitter (Python bindings)

```python
from tree_sitter import Parser
from tree_sitter_languages import get_language

PY_LANG = get_language("python")
parser = Parser()
parser.set_language(PY_LANG)

source = open("app.py", "rb").read()
tree = parser.parse(source)

def walk(node, depth=0):
    if node.type in {"function_definition", "class_definition"}:
        start = node.start_byte
        end = node.end_byte
        name_node = node.child_by_field_name("name")
        name = source[name_node.start_byte:name_node.end_byte].decode() if name_node else "<anon>"
        yield {
            "type": node.type,
            "name": name,
            "start_line": node.start_point[0] + 1,
            "end_line": node.end_point[0] + 1,
            "text": source[start:end].decode(),
        }
    for child in node.children:
        yield from walk(child, depth + 1)

chunks = list(walk(tree.root_node))
```

### Preserving Imports and Module Context

```python
def extract_imports(tree, source: bytes) -> str:
    parts = []
    for child in tree.root_node.children:
        if child.type in {"import_statement", "import_from_statement"}:
            parts.append(source[child.start_byte:child.end_byte].decode())
    return "\n".join(parts)

imports = extract_imports(tree, source)
# Prepend imports to each chunk so the LLM has the full context
for c in chunks:
    c["text"] = f"{imports}\n\n{c['text']}" if imports else c["text"]
```

## LangChain Language Splitter

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter, Language

splitter = RecursiveCharacterTextSplitter.from_language(
    language=Language.PYTHON,
    chunk_size=1500,
    chunk_overlap=200,
)
chunks = splitter.create_documents([source.decode()])

# Supported languages include: PYTHON, JS, TS, JAVA, GO, RUST, CPP, CSHARP,
# RUBY, PHP, SCALA, SWIFT, KOTLIN, MARKDOWN, LATEX, HTML, SOL
```

The language-aware splitter uses language-specific separators (e.g., `\nclass `,
`\ndef `, `\n\tdef `) which beats generic character splitting but still does
not understand AST scope.

## LlamaIndex CodeSplitter

```python
from llama_index.core.node_parser import CodeSplitter
from llama_index.core import Document

splitter = CodeSplitter(
    language="python",           # tree-sitter language name
    chunk_lines=40,
    chunk_lines_overlap=10,
    max_chars=1500,
)

doc = Document(text=source.decode(), metadata={"path": "app.py"})
nodes = splitter.get_nodes_from_documents([doc])
for n in nodes:
    print(n.metadata, n.text[:80])
```

CodeSplitter wraps tree-sitter and respects function/class boundaries while
staying under `max_chars`.

## Docstring-Aware Chunking (keep docs with impl)

```python
def chunk_with_docstring(tree, source: bytes) -> list[dict]:
    out = []
    for node in tree.root_node.children:
        if node.type != "function_definition":
            continue
        # Include decorators (previous siblings) + docstring (first body stmt)
        start = node.start_byte
        # Walk back for decorators
        prev = node.prev_sibling
        while prev and prev.type == "decorator":
            start = prev.start_byte
            prev = prev.prev_sibling
        out.append({
            "text": source[start:node.end_byte].decode(),
            "start_line": node.start_point[0] + 1,
        })
    return out
```

Tree-sitter naturally includes the docstring as the first statement of the
function body, so extracting the whole function node preserves it.

## Splitting by Scope (for very large classes)

```python
def split_class(class_node, source: bytes, max_chars: int = 1500) -> list[str]:
    header_end = class_node.child_by_field_name("body").start_byte
    header = source[class_node.start_byte:header_end].decode()
    methods = [
        c for c in class_node.child_by_field_name("body").children
        if c.type == "function_definition"
    ]
    chunks, buf = [], header
    for m in methods:
        method_src = source[m.start_byte:m.end_byte].decode()
        if len(buf) + len(method_src) > max_chars:
            chunks.append(buf)
            buf = header + "\n    " + method_src
        else:
            buf += "\n\n    " + method_src
    if buf:
        chunks.append(buf)
    return chunks
```

## Code Embeddings

| Model | Provider | Dim | Strength |
|-------|----------|-----|----------|
| voyage-code-3 | Voyage AI | 1024 | Best code retrieval accuracy |
| voyage-code-2 | Voyage AI | 1536 | Previous-gen, widely used |
| text-embedding-3-large | OpenAI | 3072 | General, decent on code |
| jina-embeddings-v2-base-code | Jina | 768 | Open source, runs locally |
| CodeBERT | Microsoft | 768 | Classic, needs fine-tune |

### Voyage Code Embeddings

```python
import voyageai
client = voyageai.Client()

code_chunks = [c["text"] for c in chunks]
result = client.embed(
    code_chunks,
    model="voyage-code-3",
    input_type="document",
)
vectors = result.embeddings

# At query time use input_type="query"
q = client.embed(["how is auth implemented?"], model="voyage-code-3", input_type="query")
```

### Local CodeBERT

```python
from transformers import AutoTokenizer, AutoModel
import torch

tokenizer = AutoTokenizer.from_pretrained("microsoft/codebert-base")
model = AutoModel.from_pretrained("microsoft/codebert-base")

def embed(text: str) -> list[float]:
    tokens = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    with torch.no_grad():
        out = model(**tokens)
    return out.last_hidden_state.mean(dim=1).squeeze().tolist()
```

## Metadata for Code Chunks

```python
metadata = {
    "path": "src/auth/login.py",
    "repo": "acme/backend",
    "language": "python",
    "symbol": "def authenticate",
    "symbol_kind": "function",            # function | class | method | module
    "start_line": 42,
    "end_line": 78,
    "imports": ["jwt", "bcrypt"],
    "commit_sha": "abc123",
}
```

## Full Pipeline: Repo -> Chunks -> Vectorstore

```python
from pathlib import Path
from tree_sitter_languages import get_language, get_parser

EXT_TO_LANG = {".py": "python", ".ts": "typescript", ".tsx": "tsx",
               ".js": "javascript", ".go": "go", ".rs": "rust", ".java": "java"}

def chunk_repo(repo_path: str, max_chars: int = 1500) -> list[dict]:
    all_chunks = []
    for path in Path(repo_path).rglob("*"):
        if not path.is_file():
            continue
        lang = EXT_TO_LANG.get(path.suffix)
        if not lang:
            continue
        parser = get_parser(lang)
        source = path.read_bytes()
        tree = parser.parse(source)
        for node in tree.root_node.children:
            if node.type not in {"function_definition", "class_definition",
                                 "function_declaration", "method_definition"}:
                continue
            text = source[node.start_byte:node.end_byte].decode(errors="replace")
            if len(text) > max_chars:
                # Further split large classes - omitted for brevity
                pass
            all_chunks.append({
                "text": text,
                "metadata": {
                    "path": str(path.relative_to(repo_path)),
                    "language": lang,
                    "start_line": node.start_point[0] + 1,
                    "end_line": node.end_point[0] + 1,
                }
            })
    return all_chunks
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Character splitter on code | Use tree-sitter or LangChain Language splitter |
| Stripping docstrings before embed | Keep docstring with function body |
| Dropping imports from chunks | Prepend module imports to each chunk |
| Using generic embeddings for code | Use voyage-code-3 or jina-code |
| Chunking by file (whole-file) | Chunk by function/class for better retrieval |
| Ignoring path hierarchy | Include `path`, `symbol`, `repo` in metadata |

## Production Checklist

- [ ] Tree-sitter grammars installed for all target languages
- [ ] Imports preserved per-chunk or stored as separate context
- [ ] Code-specific embedding model (voyage-code-3, jina-code)
- [ ] Metadata: path, symbol, kind, line range, commit SHA
- [ ] Very-large functions split by scope (not blindly)
- [ ] Incremental indexing on git diff (only changed files)
- [ ] Hybrid retrieval: symbol name BM25 + semantic vector
- [ ] Handle non-code files (README, Markdown) with separate splitter
