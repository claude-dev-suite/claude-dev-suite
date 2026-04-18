---
name: unstructured-io
description: |
  Unstructured.io library for partitioning documents by filetype (PDF, DOCX, HTML,
  EPUB, PPT, email). Covers partition strategies (fast, hi_res, ocr_only, auto),
  chunking by title, metadata extraction, and serverless API usage.

  USE WHEN: user mentions "unstructured.io", "unstructured library", "partition
  documents", "multi-format ingestion", "DOCX to chunks", "HTML to RAG",
  "EPUB parser", "PPT extraction"

  DO NOT USE FOR: PDF-specific layout - use `pdf-extraction`;
  pure OCR work - use `ocr`;
  table-specific extraction - use `table-extraction`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Unstructured.io

## Installation

```bash
# Minimal
pip install "unstructured[all-docs]"

# System deps (Linux)
apt-get install -y poppler-utils tesseract-ocr libmagic1

# hi_res with layout model (Linux recommended)
pip install "unstructured[all-docs]" "unstructured-inference" "detectron2@git+https://github.com/facebookresearch/detectron2.git"
```

## Auto Partition by Filetype

```python
from unstructured.partition.auto import partition

# Routes to the right partitioner based on filetype
elements = partition(filename="contract.pdf")
# Also works: .docx, .html, .eml, .epub, .pptx, .xlsx, .md, .csv, .txt, .rst

for el in elements:
    print(el.category, "|", el.text[:80])
    # Title, NarrativeText, ListItem, Table, Image, Header, Footer, ...
```

## Filetype-Specific Partitioners

```python
from unstructured.partition.pdf import partition_pdf
from unstructured.partition.docx import partition_docx
from unstructured.partition.html import partition_html
from unstructured.partition.pptx import partition_pptx
from unstructured.partition.epub import partition_epub
from unstructured.partition.email import partition_email

pdf_elements = partition_pdf(
    filename="report.pdf",
    strategy="hi_res",                 # fast | hi_res | ocr_only | auto
    extract_images_in_pdf=True,
    extract_image_block_types=["Image", "Table"],
    extract_image_block_to_payload=False,
    extract_image_block_output_dir="./images",
    infer_table_structure=True,
    languages=["eng"],
    hi_res_model_name="yolox",         # yolox | detectron2_onnx
)

docx_elements = partition_docx(filename="brief.docx", include_page_breaks=True)
html_elements = partition_html(url="https://example.com/article")
pptx_elements = partition_pptx(filename="deck.pptx")
epub_elements = partition_epub(filename="book.epub")
eml_elements = partition_email(filename="msg.eml", process_attachments=True)
```

## Strategies Compared

| Strategy | Speed | Quality | Use Case |
|----------|-------|---------|----------|
| `fast` | Very fast | Text-only, no layout | Born-digital PDFs, bulk ingestion |
| `hi_res` | Slow (GPU helps) | Layout-aware (tables, figures) | RAG, complex docs |
| `ocr_only` | Medium | OCR every page | Scanned PDFs |
| `auto` | Variable | Picks per-document | Mixed corpora |

## Chunking by Title

```python
from unstructured.chunking.title import chunk_by_title

elements = partition_pdf(filename="report.pdf", strategy="hi_res")

chunks = chunk_by_title(
    elements,
    max_characters=1500,
    new_after_n_chars=1200,
    combine_text_under_n_chars=500,
    overlap=200,
    multipage_sections=True,
)

for chunk in chunks:
    print(chunk.metadata.page_number, chunk.text[:120])
```

## Basic (Character) Chunking

```python
from unstructured.chunking.basic import chunk_elements

chunks = chunk_elements(
    elements,
    max_characters=1200,
    new_after_n_chars=1000,
    overlap=150,
)
```

## Metadata Extraction

```python
for el in elements:
    m = el.metadata
    print({
        "filename": m.filename,
        "filetype": m.filetype,
        "page": m.page_number,
        "coordinates": m.coordinates.to_dict() if m.coordinates else None,
        "parent_id": m.parent_id,
        "languages": m.languages,
        "emphasized_texts": m.emphasized_text_contents,
        "link_urls": m.link_urls,
    })
```

## Convert to LangChain / LlamaIndex Documents

```python
from langchain_core.documents import Document as LCDocument

lc_docs = [
    LCDocument(
        page_content=chunk.text,
        metadata={
            "source": chunk.metadata.filename,
            "page": chunk.metadata.page_number,
            "category": chunk.category,
        },
    )
    for chunk in chunks
]

# LlamaIndex
from llama_index.core import Document as LIDocument

li_docs = [
    LIDocument(text=chunk.text, metadata={
        "page": chunk.metadata.page_number,
        "source": chunk.metadata.filename,
    })
    for chunk in chunks
]
```

## Serverless API (Unstructured Platform)

```python
import os
from unstructured_client import UnstructuredClient
from unstructured_client.models import operations, shared

client = UnstructuredClient(
    api_key_auth=os.environ["UNSTRUCTURED_API_KEY"],
    server_url=os.environ["UNSTRUCTURED_API_URL"],  # e.g., https://api.unstructuredapp.io
)

with open("contract.pdf", "rb") as f:
    files = shared.Files(content=f.read(), file_name="contract.pdf")

req = operations.PartitionRequest(
    partition_parameters=shared.PartitionParameters(
        files=files,
        strategy=shared.Strategy.HI_RES,
        chunking_strategy="by_title",
        max_characters=1500,
        overlap=200,
        split_pdf_page=True,
        split_pdf_concurrency_level=8,
    )
)

response = client.general.partition(request=req)
for element in response.elements:
    print(element["type"], element["text"][:100])
```

## Async Batch Ingestion

```python
import asyncio
from pathlib import Path
from unstructured.partition.auto import partition

async def process(path: Path):
    return await asyncio.to_thread(partition, filename=str(path), strategy="fast")

async def ingest_dir(root: str):
    paths = list(Path(root).rglob("*"))
    paths = [p for p in paths if p.suffix.lower() in {".pdf", ".docx", ".html", ".epub"}]
    results = await asyncio.gather(*(process(p) for p in paths))
    return dict(zip(paths, results))

asyncio.run(ingest_dir("./corpus"))
```

## Element Categories

Common `el.category` values: `Title`, `NarrativeText`, `ListItem`, `Table`, `Image`, `FigureCaption`, `Header`, `Footer`, `Address`, `EmailAddress`, `PageBreak`, `CodeSnippet`, `Formula`, `UncategorizedText`.

Filter out boilerplate before chunking:

```python
drop = {"Header", "Footer", "PageBreak", "UncategorizedText"}
cleaned = [el for el in elements if el.category not in drop]
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Using `hi_res` on 10k simple PDFs | Start with `fast`, upgrade only when needed |
| Ignoring `parent_id` hierarchy | Preserve it so chunks know their section |
| Running `detectron2` without GPU | Use `yolox` model or run in serverless API |
| Treating Tables as NarrativeText | Convert Table elements to markdown separately |
| Skipping `combine_text_under_n_chars` | Tiny chunks hurt retrieval - combine them |
| Re-partitioning on every query | Persist elements as JSON and reload |

## Production Checklist

- [ ] Strategy chosen per document type (fast vs hi_res vs ocr_only)
- [ ] System deps installed (poppler, tesseract, libmagic)
- [ ] Chunked with `chunk_by_title` for structured docs
- [ ] Metadata preserved end-to-end (page, coordinates, parent_id)
- [ ] Boilerplate categories filtered before indexing
- [ ] Serverless API used for heavy `hi_res` workloads if no GPU
- [ ] `split_pdf_page=True` for large PDFs on the API
- [ ] Elements cached as JSON keyed by file hash
