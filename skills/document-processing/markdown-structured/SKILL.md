---
name: markdown-structured
description: |
  Structured markup ingestion for RAG. Covers markdown (markdown-it, tree-sitter),
  AsciiDoc, reStructuredText, frontmatter (YAML/TOML), header-hierarchy metadata,
  code-block-aware chunking (never split fenced blocks), tables, internal link
  resolution, Obsidian/Dendron vaults, and MDX component stripping.

  USE WHEN: user mentions "markdown chunking", "header splitter", "frontmatter",
  "code-block chunking", "Obsidian vault", "Dendron", "MDX", "AsciiDoc",
  "reStructuredText", "markdown-it", "tree-sitter markdown",
  "MarkdownHeaderTextSplitter"

  DO NOT USE FOR: HTML from the web - use `web-scraping`;
  office docs - use `office-docs`;
  PDF-rendered markdown-looking content - use `pdf-extraction`;
  generic partitioning of mixed filetypes - use `unstructured-io`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Structured Markup for RAG

## Format Matrix

| Format | Parser | Frontmatter | Code Fences | Cross-Links |
|--------|--------|-------------|-------------|-------------|
| CommonMark / GFM | markdown-it-py, mistune, tree-sitter-markdown | Yes (YAML/TOML) | Triple-backtick | `[text](path)` |
| AsciiDoc | asciidoc3, asciidoctor (Ruby) | Attributes | `----` / `[source]` | `<<id>>`, xref |
| reStructuredText | docutils | Field lists | `::` literal blocks | `:ref:` |
| MDX | @mdx-js/mdx, unified/remark-mdx | Yes | Fences + JSX | JSX imports |
| Obsidian | custom parser + markdown-it | YAML | Triple-backtick | `[[wikilinks]]`, `![[embeds]]` |
| Dendron | Obsidian-compatible | YAML | Triple-backtick | `[[hierarchical.notes]]` |

## Frontmatter Extraction

```python
import frontmatter     # python-frontmatter

post = frontmatter.load("docs/guide.md")
print(post.metadata)   # dict: title, tags, date, ...
print(post.content)    # markdown body without frontmatter

# TOML frontmatter
from frontmatter.default_handlers import TOMLHandler
post = frontmatter.load("docs/guide.md", handler=TOMLHandler())
```

## Header-Aware Splitting (LangChain)

```python
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter

headers_to_split_on = [
    ("#",   "h1"),
    ("##",  "h2"),
    ("###", "h3"),
    ("####", "h4"),
]

header_splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=headers_to_split_on,
    strip_headers=False,
    return_each_line=False,
)
md_docs = header_splitter.split_text(markdown_text)

# Second pass: keep chunks within embedding window, never split code fences
char_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1200,
    chunk_overlap=150,
    separators=["\n## ", "\n### ", "\n\n", "\n", " "],
)
final_docs = []
for d in md_docs:
    for piece in char_splitter.split_text(d.page_content):
        final_docs.append({
            "text": piece,
            "heading_path": [d.metadata.get(h) for _, h in headers_to_split_on
                             if d.metadata.get(h)],
        })
```

## Code-Block-Aware Chunking

Splitting inside a ``` fence destroys syntax context and produces useless embeddings. Detect fences first and treat each fenced block as atomic.

```python
import re
from dataclasses import dataclass

FENCE_RE = re.compile(r"^(?P<fence>```+|~~~+)(?P<lang>[^\n]*)\n(?P<body>.*?)\n(?P=fence)$",
                       re.DOTALL | re.MULTILINE)

@dataclass
class Block:
    kind: str            # "code" | "prose"
    lang: str
    text: str

def parse_blocks(md: str) -> list[Block]:
    blocks: list[Block] = []
    i = 0
    for m in FENCE_RE.finditer(md):
        if m.start() > i:
            blocks.append(Block("prose", "", md[i:m.start()]))
        blocks.append(Block("code", m.group("lang").strip(), m.group("body")))
        i = m.end()
    if i < len(md):
        blocks.append(Block("prose", "", md[i:]))
    return blocks

def chunk_blocks(blocks: list[Block], max_chars: int = 1200) -> list[str]:
    out: list[str] = []
    buf = ""
    for b in blocks:
        rendered = (f"```{b.lang}\n{b.text}\n```" if b.kind == "code" else b.text)
        # Code block bigger than max_chars: emit as its own chunk (don't split)
        if b.kind == "code" and len(rendered) > max_chars:
            if buf.strip():
                out.append(buf)
                buf = ""
            out.append(rendered)
            continue
        if len(buf) + len(rendered) > max_chars and buf.strip():
            out.append(buf)
            buf = rendered
        else:
            buf += ("\n\n" if buf else "") + rendered
    if buf.strip():
        out.append(buf)
    return out
```

## markdown-it-py AST Walk

```python
from markdown_it import MarkdownIt
from markdown_it.tree import SyntaxTreeNode

md_parser = MarkdownIt("gfm-like")
tokens = md_parser.parse(markdown_text)
tree = SyntaxTreeNode(tokens)

heading_stack: list[tuple[int, str]] = []
chunks: list[dict] = []

for node in tree.walk(include_self=False):
    if node.type == "heading":
        level = int(node.tag[1])
        text = "".join(c.content for c in node.children if c.type == "text")
        heading_stack = [(l, t) for l, t in heading_stack if l < level]
        heading_stack.append((level, text))
    elif node.type == "fence":
        chunks.append({
            "type": "code",
            "lang": node.info,
            "text": node.content,
            "headings": [t for _, t in heading_stack],
        })
    elif node.type == "paragraph":
        chunks.append({
            "type": "prose",
            "text": node.content if hasattr(node, "content") else
                    "".join(c.content for c in node.children if c.type == "text"),
            "headings": [t for _, t in heading_stack],
        })
```

## tree-sitter-markdown (Incremental Parsing)

```python
from tree_sitter_languages import get_parser

parser = get_parser("markdown")
tree = parser.parse(markdown_text.encode("utf-8"))

def walk(node, depth=0):
    if node.type in ("atx_heading", "setext_heading"):
        yield node
    for child in node.children:
        yield from walk(child, depth + 1)

for h in walk(tree.root_node):
    print(h.type, h.start_point, h.end_point)
```

Use tree-sitter when you need incremental reparse on edit (indexing a live repo).

## Tables

```python
# GFM tables survive as pipe-delimited text - keep them atomic
TABLE_RE = re.compile(r"(^\|.+\|\n\|[-: |]+\|\n(?:\|.+\|\n?)+)", re.MULTILINE)

def split_off_tables(md: str) -> list[dict]:
    out, idx = [], 0
    for m in TABLE_RE.finditer(md):
        if m.start() > idx:
            out.append({"type": "prose", "text": md[idx:m.start()]})
        out.append({"type": "table", "text": m.group(1)})
        idx = m.end()
    if idx < len(md):
        out.append({"type": "prose", "text": md[idx:]})
    return out
```

## Internal Link Resolution

```python
from pathlib import Path
import re

LINK_RE = re.compile(r"\[(?P<text>[^\]]+)\]\((?P<href>[^)\s]+)(?:\s+\"[^\"]*\")?\)")

def resolve_links(md: str, file_path: Path, root: Path) -> list[dict]:
    links = []
    for m in LINK_RE.finditer(md):
        href = m.group("href")
        if href.startswith(("http://", "https://", "#")):
            continue
        target = (file_path.parent / href).resolve()
        try:
            rel = target.relative_to(root)
            links.append({"text": m.group("text"), "target": str(rel)})
        except ValueError:
            pass
    return links
```

## Obsidian / Dendron Vaults

```python
import re
from pathlib import Path

WIKILINK = re.compile(r"!?\[\[(?P<target>[^\]|#]+)(?:#(?P<anchor>[^\]|]+))?"
                      r"(?:\|(?P<alias>[^\]]+))?\]\]")

def index_vault(root: Path) -> dict[str, Path]:
    # Obsidian resolves by basename (or by path when ambiguous)
    by_name: dict[str, Path] = {}
    for p in root.rglob("*.md"):
        by_name.setdefault(p.stem.lower(), p)
        by_name[str(p.relative_to(root).with_suffix("")).lower()] = p
    return by_name

def expand_wikilinks(md: str, vault_index: dict[str, Path]) -> list[dict]:
    refs = []
    for m in WIKILINK.finditer(md):
        target = m.group("target").strip().lower()
        path = vault_index.get(target)
        refs.append({
            "target": target,
            "anchor": m.group("anchor"),
            "alias": m.group("alias"),
            "resolved": str(path) if path else None,
            "embed": m.group(0).startswith("!"),
        })
    return refs

def ingest_vault(root: str) -> list[dict]:
    root_path = Path(root)
    index = index_vault(root_path)
    chunks = []
    for p in root_path.rglob("*.md"):
        post = frontmatter.load(p)
        blocks = parse_blocks(post.content)
        for chunk in chunk_blocks(blocks):
            chunks.append({
                "text": chunk,
                "source": str(p.relative_to(root_path)),
                "frontmatter": post.metadata,
                "links": expand_wikilinks(chunk, index),
            })
    return chunks
```

Dendron notes use dotted hierarchy in filenames (`proj.area.topic.md`). Treat dots as heading path for metadata even when the file has no H1.

## MDX — Strip React Components

```python
import re

# Strip import/export statements
IMPORT_RE = re.compile(r"^(import|export)\s+.+$", re.MULTILINE)
# Strip JSX blocks (naive; handles the common self-closing and open/close cases)
JSX_BLOCK_RE = re.compile(r"<([A-Z][A-Za-z0-9]*)\b[^>]*?(/>|>.*?</\1>)", re.DOTALL)

def mdx_to_md(mdx: str) -> str:
    out = IMPORT_RE.sub("", mdx)
    out = JSX_BLOCK_RE.sub("", out)
    # Strip inline JSX expressions like {foo}
    out = re.sub(r"\{[^{}\n]+\}", "", out)
    return out.strip()
```

For robustness, use the JS ecosystem's `unified` + `remark-mdx` via a small Node script piped from Python, or `mdx-bundler`'s compiler output.

## AsciiDoc

```python
# asciidoc3 (Python) or subprocess call to `asciidoctor -b docbook -o - file.adoc`
import subprocess

def asciidoc_to_html(path: str) -> str:
    return subprocess.check_output(
        ["asciidoctor", "-b", "html5", "-o", "-", path],
        text=True,
    )

# Then convert HTML -> markdown with markdownify, and feed through the markdown pipeline
from markdownify import markdownify as html2md

markdown = html2md(asciidoc_to_html("manual.adoc"), heading_style="ATX")
```

AsciiDoc attributes (`= Title`, `:author: Foo`) act like frontmatter -- extract them before HTML conversion if you need them as metadata.

## reStructuredText

```python
from docutils.core import publish_doctree

doctree = publish_doctree("manual.rst")
for section in doctree.traverse(condition=lambda n: n.tagname == "section"):
    title = section.next_node(condition=lambda n: n.tagname == "title")
    print(title.astext() if title else "(no title)")
```

Pandoc is a robust alternative for both AsciiDoc and RST:

```bash
pandoc -f rst -t gfm manual.rst -o manual.md
pandoc -f asciidoc -t gfm manual.adoc -o manual.md
```

## RAG-Ready Schema

```python
from dataclasses import dataclass, field

@dataclass
class MarkdownChunk:
    text: str
    source: str
    heading_path: list[str]
    frontmatter: dict
    kind: str                  # prose | code | table
    lang: str = ""             # for code
    links: list[dict] = field(default_factory=list)
    anchor_id: str | None = None   # slugified first heading in chunk
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Splitting by N chars ignoring headers | Use `MarkdownHeaderTextSplitter` first |
| Splitting inside a code fence | Parse fences atomically; emit oversize blocks whole |
| Dropping frontmatter | Index tags/title/date as filterable metadata |
| Flattening `[[wikilinks]]` to their label | Resolve to vault paths and store as graph metadata |
| Rendering MDX to HTML and scraping | Strip JSX deterministically from source |
| Ignoring header hierarchy in metadata | Store `heading_path` on every chunk for context |
| Treating AsciiDoc attributes as body text | Extract them as frontmatter-equivalent metadata |
| Re-indexing untouched files | Key cache on `(path, mtime, content_hash)` |
| Mixing prose and code in the same embedding without labeling | Tag `kind=code` + `lang` so retrievers can filter |

## Production Checklist

- [ ] Frontmatter parsed (YAML and TOML) and indexed as metadata
- [ ] `heading_path` recorded per chunk for breadcrumb-style citations
- [ ] Code fences never split; oversize fences emitted as standalone chunks
- [ ] Tables kept atomic (not chunked mid-row)
- [ ] Internal links / wikilinks resolved to canonical paths
- [ ] MDX stripped deterministically before chunking
- [ ] AsciiDoc / RST converted through pandoc or native parser, not regex
- [ ] Chunk cache keyed on content hash + path
- [ ] `kind` (prose/code/table) and `lang` stored for retrieval filters
- [ ] Vault-wide link graph persisted for reranking (document-level authority)
