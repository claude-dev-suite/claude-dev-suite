---
name: pdf-extraction
description: |
  PDF text, layout, and figure extraction for RAG pipelines. Covers PyMuPDF (fitz),
  pdfplumber, Docling (IBM layout-aware), LlamaParse (LLM-based), Marker (markdown
  conversion). Page metadata, heading heuristics, figure/image extraction.

  USE WHEN: user mentions "PDF extraction", "parse PDF", "PyMuPDF", "fitz",
  "pdfplumber", "Docling", "LlamaParse", "Marker", "PDF to markdown"

  DO NOT USE FOR: scanned PDFs requiring OCR - use `ocr`;
  table-only extraction - use `table-extraction`;
  general filetype partitioning - use `unstructured-io`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# PDF Extraction

## Tool Comparison

| Tool | Speed | Layout Quality | Tables | Images | Best For |
|------|-------|----------------|--------|--------|----------|
| PyMuPDF (fitz) | Very fast | Good | Basic | Yes | Bulk text extraction |
| pdfplumber | Slow | Excellent | Very good | Yes | Tables + coordinates |
| Docling | Medium | Excellent (layout model) | Excellent | Yes | Structured docs, RAG |
| LlamaParse | Slow (API) | Excellent (LLM) | Excellent | Yes | Complex layouts, forms |
| Marker | Medium (GPU) | Excellent | Very good | Yes | PDF to markdown |
| pypdf | Fast | Poor | No | No | Simple linear text only |

## PyMuPDF (fitz) — Fast Text + Metadata

```python
import fitz  # PyMuPDF

def extract_pdf_pymupdf(path: str) -> list[dict]:
    doc = fitz.open(path)
    pages = []
    for page_num, page in enumerate(doc):
        text = page.get_text("text")
        blocks = page.get_text("dict")["blocks"]
        pages.append({
            "page": page_num + 1,
            "text": text,
            "blocks": blocks,
            "width": page.rect.width,
            "height": page.rect.height,
        })
    doc.close()
    return pages
```

### Heading Detection via Font Size

```python
def detect_headings(path: str) -> list[dict]:
    doc = fitz.open(path)
    # Collect font size distribution
    sizes = []
    for page in doc:
        for block in page.get_text("dict")["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    sizes.append(span["size"])
    body_size = max(set(sizes), key=sizes.count)  # mode = body text

    headings = []
    for page_num, page in enumerate(doc):
        for block in page.get_text("dict")["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    if span["size"] > body_size * 1.2:
                        level = 1 if span["size"] > body_size * 1.8 else 2
                        headings.append({
                            "page": page_num + 1,
                            "text": span["text"].strip(),
                            "size": span["size"],
                            "level": level,
                            "bold": bool(span["flags"] & 2**4),
                        })
    doc.close()
    return headings
```

### Extract Images and Figures

```python
def extract_images(path: str, out_dir: str):
    doc = fitz.open(path)
    for page_num, page in enumerate(doc):
        for img_index, img in enumerate(page.get_images(full=True)):
            xref = img[0]
            pix = fitz.Pixmap(doc, xref)
            if pix.n - pix.alpha > 3:  # CMYK
                pix = fitz.Pixmap(fitz.csRGB, pix)
            pix.save(f"{out_dir}/p{page_num+1}_img{img_index}.png")
            pix = None
    doc.close()
```

## pdfplumber — Tables and Coordinates

```python
import pdfplumber

with pdfplumber.open("report.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        tables = page.extract_tables()
        for table in tables:
            # table is list[list[str]]
            for row in table:
                print(row)
        # Word-level coordinates for custom layout
        words = page.extract_words(keep_blank_chars=False)
        for w in words:
            print(w["text"], w["x0"], w["top"], w["fontname"], w["size"])
```

## Docling — IBM Layout-Aware Parser

```python
from docling.document_converter import DocumentConverter
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.datamodel.base_models import InputFormat
from docling.document_converter import PdfFormatOption

pipeline_options = PdfPipelineOptions()
pipeline_options.do_ocr = True
pipeline_options.do_table_structure = True
pipeline_options.table_structure_options.do_cell_matching = True

converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
    }
)

result = converter.convert("paper.pdf")
markdown = result.document.export_to_markdown()
doc_json = result.document.export_to_dict()

# Iterate structured items with page + bbox
for item, level in result.document.iterate_items():
    print(item.label, item.text[:80] if hasattr(item, "text") else "")
```

## LlamaParse — LLM-Based Parsing

```python
from llama_parse import LlamaParse
import os

parser = LlamaParse(
    api_key=os.environ["LLAMA_CLOUD_API_KEY"],
    result_type="markdown",        # or "text", "json"
    parsing_instruction=(
        "This is a financial report. Preserve tables as markdown "
        "and keep section numbering."
    ),
    premium_mode=True,             # best quality, slower + costly
    verbose=True,
)

documents = parser.load_data("10k.pdf")
for doc in documents:
    print(doc.metadata["page"], doc.text[:200])
```

## Marker — PDF to Markdown

```python
from marker.converters.pdf import PdfConverter
from marker.models import create_model_dict
from marker.output import text_from_rendered

converter = PdfConverter(artifact_dict=create_model_dict())
rendered = converter("paper.pdf")
markdown, metadata, images = text_from_rendered(rendered)

# Save
with open("paper.md", "w", encoding="utf-8") as f:
    f.write(markdown)
for name, img in images.items():
    img.save(f"out/{name}.png")
```

## RAG-Ready Extraction Pipeline

```python
import fitz
from dataclasses import dataclass

@dataclass
class PageChunk:
    text: str
    page: int
    source: str
    headings: list[str]
    bbox: tuple | None = None

def extract_for_rag(path: str) -> list[PageChunk]:
    doc = fitz.open(path)
    current_headings: list[str] = []
    chunks: list[PageChunk] = []

    for page_num, page in enumerate(doc):
        blocks = page.get_text("dict")["blocks"]
        for block in blocks:
            if block.get("type") != 0:
                continue
            block_text = "\n".join(
                "".join(span["text"] for span in line["spans"])
                for line in block["lines"]
            ).strip()
            if not block_text:
                continue
            # Track headings by font size
            first_span = block["lines"][0]["spans"][0]
            if first_span["size"] > 14 and first_span["flags"] & 2**4:
                current_headings = [block_text]
                continue
            chunks.append(PageChunk(
                text=block_text,
                page=page_num + 1,
                source=path,
                headings=list(current_headings),
                bbox=block["bbox"],
            ))
    doc.close()
    return chunks
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Using `pypdf` for layout-sensitive docs | Use PyMuPDF or Docling |
| Ignoring page numbers in chunk metadata | Always store `page` + `source` |
| Single giant text blob per PDF | Chunk by page or block with heading context |
| Running LlamaParse on every PDF | Use PyMuPDF first, fall back to LlamaParse for failures |
| Losing tables by extracting only text | Use pdfplumber or Docling for tables |
| Re-extracting unchanged PDFs | Cache by file hash + mtime |

## Production Checklist

- [ ] Hash-based cache keyed on file content
- [ ] Fallback chain: PyMuPDF -> Docling -> LlamaParse
- [ ] Page number, source, heading path in chunk metadata
- [ ] Image/figure extraction stored with bbox for citation
- [ ] Encrypted/password-protected PDFs handled gracefully
- [ ] Corrupt PDF detection (`fitz.open` inside try/except)
- [ ] Memory limits for 1000+ page documents (process page-by-page)
- [ ] Parallel extraction across files with a process pool
