---
name: office-docs
description: |
  Office document ingestion for RAG: DOCX (python-docx, mammoth to markdown),
  PPTX (python-pptx with image extraction), XLSX (openpyxl, pandas, table-aware
  chunking), plus Notion/Confluence/Quip export to markdown. Preserves headings,
  lists, comments, and embedded images.

  USE WHEN: user mentions "DOCX", "Word document", "python-docx", "mammoth",
  "PPTX", "PowerPoint", "python-pptx", "XLSX", "Excel", "openpyxl", "spreadsheet",
  "Notion export", "Confluence export", "Quip export", "office documents"

  DO NOT USE FOR: generic multi-format partitioning - use `unstructured-io`;
  PDF exports of office docs - use `pdf-extraction`;
  structured markdown vaults - use `markdown-structured`;
  emails with office attachments (handle extraction here, ingestion via `email-ingestion`)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Office Documents for RAG

## Format Matrix

| Format | Library | Markdown Path | Tables | Images | Comments |
|--------|---------|---------------|--------|--------|----------|
| DOCX | python-docx | mammoth | Yes | python-docx `InlineShape` | python-docx |
| PPTX | python-pptx | custom | Limited | `shape.image.blob` | `slide.notes_slide` |
| XLSX | openpyxl / pandas | custom | Native | Embedded images | openpyxl |
| Notion | Notion API + notion-to-md | Native | Yes | Block downloads | Discussion blocks |
| Confluence | atlassian-python-api | html2md | Yes | Attachments endpoint | Inline comments API |
| Quip | Quip API | html2md | Yes | Blob endpoint | Section comments |

## DOCX — python-docx + mammoth

```python
# Structured extraction with python-docx
from docx import Document
from docx.oxml.ns import qn

def extract_docx(path: str) -> list[dict]:
    doc = Document(path)
    out = []
    heading_stack: list[str] = []
    for para in doc.paragraphs:
        style = (para.style.name or "").lower()
        text = para.text.strip()
        if not text:
            continue
        if style.startswith("heading"):
            try:
                level = int(style.split()[-1])
            except ValueError:
                level = 1
            heading_stack = heading_stack[: level - 1] + [text]
            out.append({"type": "heading", "level": level, "text": text,
                        "path": list(heading_stack)})
        elif style == "list paragraph":
            out.append({"type": "list_item", "text": text,
                        "path": list(heading_stack)})
        else:
            out.append({"type": "paragraph", "text": text,
                        "path": list(heading_stack)})
    # Tables
    for t_idx, table in enumerate(doc.tables):
        rows = [[cell.text.strip() for cell in row.cells] for row in table.rows]
        out.append({"type": "table", "index": t_idx, "rows": rows,
                    "path": list(heading_stack)})
    return out
```

### DOCX to Markdown with Mammoth

```python
import mammoth

with open("brief.docx", "rb") as f:
    result = mammoth.convert_to_markdown(
        f,
        style_map="""
          p[style-name='Heading 1'] => h1:fresh
          p[style-name='Heading 2'] => h2:fresh
          p[style-name='Quote'] => blockquote:fresh
          r[style-name='Code'] => code
        """,
        convert_image=mammoth.images.img_element(lambda img: {
            "src": save_image(img),
        }),
    )
markdown = result.value
for message in result.messages:
    print("mammoth:", message.type, message.message)
```

### Comments and Revisions

```python
from docx.oxml.ns import qn

def extract_comments(path: str) -> list[dict]:
    doc = Document(path)
    comments_part = doc.part.package.part_related_by_reltype(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments"
    )
    xml = comments_part.blob
    from lxml import etree
    tree = etree.fromstring(xml)
    out = []
    for c in tree.findall(qn("w:comment")):
        out.append({
            "id": c.get(qn("w:id")),
            "author": c.get(qn("w:author")),
            "date": c.get(qn("w:date")),
            "text": " ".join(t.text or "" for t in c.iter(qn("w:t"))),
        })
    return out

# Tracked changes: look for w:ins (insertion) and w:del (deletion) elements
```

### Embedded Images from DOCX

```python
from pathlib import Path

def extract_docx_images(path: str, out_dir: str):
    doc = Document(path)
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    for rel in doc.part.rels.values():
        if "image" in rel.reltype:
            blob = rel.target_part.blob
            ext = rel.target_part.partname.split(".")[-1]
            (Path(out_dir) / f"{rel.rId}.{ext}").write_bytes(blob)
```

## PPTX — Slide to Markdown

```python
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pathlib import Path

def pptx_to_markdown(path: str, image_dir: str) -> list[dict]:
    Path(image_dir).mkdir(parents=True, exist_ok=True)
    prs = Presentation(path)
    slides = []
    for i, slide in enumerate(prs.slides, start=1):
        parts: list[str] = []
        title = ""
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    txt = " ".join(run.text for run in para.runs).strip()
                    if not txt:
                        continue
                    if shape == slide.shapes.title and not title:
                        title = txt
                        parts.append(f"# {txt}")
                    else:
                        bullet = "- " if para.level > 0 else ""
                        parts.append(f"{'  ' * para.level}{bullet}{txt}")
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                img = shape.image
                name = f"slide{i}_{shape.shape_id}.{img.ext}"
                (Path(image_dir) / name).write_bytes(img.blob)
                parts.append(f"![{shape.name}]({image_dir}/{name})")
        notes = ""
        if slide.has_notes_slide:
            notes = slide.notes_slide.notes_text_frame.text.strip()
        slides.append({
            "slide": i,
            "title": title,
            "markdown": "\n\n".join(parts),
            "notes": notes,
        })
    return slides
```

## XLSX — Table-Aware Chunking

```python
import openpyxl
import pandas as pd
from dataclasses import dataclass

@dataclass
class SheetChunk:
    sheet: str
    range: str
    markdown: str
    row_start: int
    row_end: int

def xlsx_to_chunks(path: str, rows_per_chunk: int = 50) -> list[SheetChunk]:
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    out: list[SheetChunk] = []
    for sheet_name in wb.sheetnames:
        df = pd.read_excel(path, sheet_name=sheet_name, header=0)
        if df.empty:
            continue
        # Split by logical blocks of rows, keep header in each chunk
        for start in range(0, len(df), rows_per_chunk):
            end = min(start + rows_per_chunk, len(df))
            slice_df = df.iloc[start:end]
            md = slice_df.to_markdown(index=False)
            out.append(SheetChunk(
                sheet=sheet_name,
                range=f"{sheet_name}!A{start+2}:{end+1}",
                markdown=md,
                row_start=start + 2,
                row_end=end + 1,
            ))
    return out
```

### Cell Comments + Embedded Images

```python
import openpyxl

wb = openpyxl.load_workbook("data.xlsx")
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for cell in row:
            if cell.comment:
                print(ws.title, cell.coordinate,
                      cell.comment.author, cell.comment.text)
    for img in ws._images:  # openpyxl internal list
        print(ws.title, img.anchor._from.col, img.anchor._from.row, img.ref)
```

### Preserve Formulas and Formats

```python
wb_formulas = openpyxl.load_workbook("data.xlsx", data_only=False)
wb_values = openpyxl.load_workbook("data.xlsx", data_only=True)
for fsheet, vsheet in zip(wb_formulas.worksheets, wb_values.worksheets):
    for fcell, vcell in zip(fsheet["A1:D10"], vsheet["A1:D10"]):
        for fc, vc in zip(fcell, vcell):
            if fc.data_type == "f":
                print(fc.coordinate, "formula:", fc.value, "value:", vc.value)
```

## Notion Export to Markdown

```python
import os
from notion_client import Client
from notion_to_md import NotionToMarkdown  # notion-to-md-py

notion = Client(auth=os.environ["NOTION_TOKEN"])
n2m = NotionToMarkdown(notion_client=notion)

def export_page(page_id: str) -> str:
    blocks = n2m.page_to_markdown(page_id)
    return n2m.to_markdown_string(blocks)["parent"]

# Walk a database
db = notion.databases.query(database_id=os.environ["NOTION_DB"])
for page in db["results"]:
    md = export_page(page["id"])
    save_chunk(page["id"], md)
```

## Confluence Export

```python
from atlassian import Confluence
from markdownify import markdownify as html2md

c = Confluence(
    url="https://yourorg.atlassian.net/wiki",
    username=os.environ["CONFLUENCE_USER"],
    password=os.environ["CONFLUENCE_TOKEN"],
    cloud=True,
)

pages = c.get_all_pages_from_space("DOCS", start=0, limit=500, expand="body.storage,version")
for p in pages:
    html = p["body"]["storage"]["value"]
    md = html2md(html, heading_style="ATX", code_language_callback=lambda el: "python")
    save_chunk(p["id"], f"# {p['title']}\n\n{md}")
```

## Quip Export

```python
import quip  # pip install quip

client = quip.QuipClient(access_token=os.environ["QUIP_TOKEN"])
folder = client.get_folder(os.environ["QUIP_FOLDER_ID"])
for child in folder["children"]:
    if "thread_id" in child:
        thread = client.get_thread(child["thread_id"])
        html = thread["html"]
        md = html2md(html, heading_style="ATX")
        save_chunk(thread["thread"]["id"], md)
```

## RAG-Ready Chunking

```python
from dataclasses import dataclass

@dataclass
class OfficeChunk:
    text: str
    source: str
    format: str              # docx | pptx | xlsx | notion | confluence
    location: str            # page/slide/cell-range/block-id
    heading_path: list[str]

def docx_to_chunks(path: str, max_chars: int = 1200) -> list[OfficeChunk]:
    items = extract_docx(path)
    chunks: list[OfficeChunk] = []
    buffer: list[str] = []
    current_path: list[str] = []
    for it in items:
        if it["type"] == "heading":
            if buffer:
                chunks.append(OfficeChunk(
                    text="\n".join(buffer), source=path, format="docx",
                    location="paragraph", heading_path=current_path))
                buffer = []
            current_path = it["path"]
        elif it["type"] == "table":
            table_md = "\n".join("| " + " | ".join(r) + " |" for r in it["rows"])
            chunks.append(OfficeChunk(text=table_md, source=path, format="docx",
                                      location=f"table:{it['index']}",
                                      heading_path=current_path))
        else:
            buffer.append(it["text"])
            if sum(len(s) for s in buffer) > max_chars:
                chunks.append(OfficeChunk(
                    text="\n".join(buffer), source=path, format="docx",
                    location="paragraph", heading_path=current_path))
                buffer = []
    if buffer:
        chunks.append(OfficeChunk(text="\n".join(buffer), source=path,
                                  format="docx", location="paragraph",
                                  heading_path=current_path))
    return chunks
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Flattening DOCX to plain text | Preserve heading hierarchy in metadata |
| Loading a 500MB XLSX into memory | `openpyxl.load_workbook(..., read_only=True)` |
| Ignoring `data_only=True` for XLSX | Stored formula strings pollute embeddings |
| Chunking whole spreadsheets as one blob | Split per sheet and per N rows with repeated header |
| Dropping slide speaker notes | Notes often carry the real narrative |
| Scraping rendered HTML from Notion | Use the API + notion-to-md for structure |
| Ignoring tracked changes | Either accept them or extract as separate revision chunks |
| Skipping embedded images | Extract and OCR when needed |

## Production Checklist

- [ ] Heading path stored as metadata for every chunk
- [ ] Tables converted to markdown, not flattened prose
- [ ] XLSX chunked per-sheet with header repeated per chunk
- [ ] Comments / tracked changes extracted as distinct annotation chunks
- [ ] Embedded images saved and OCR-queued when text-bearing
- [ ] PPTX slide notes included alongside slide content
- [ ] Style map for mammoth aligned with organization's document template
- [ ] Notion/Confluence export runs incrementally by `last_edited_time`
- [ ] Large workbooks processed with `read_only=True` + iterators
