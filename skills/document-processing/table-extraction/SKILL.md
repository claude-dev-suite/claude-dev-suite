---
name: table-extraction
description: |
  Table extraction from PDFs and images for RAG. Covers Camelot, Tabula,
  pdfplumber, TableTransformer (DETR), Amazon Textract Tables, Azure Document
  Intelligence. Conversion to markdown/CSV/JSON, merged-cell handling.

  USE WHEN: user mentions "table extraction", "PDF tables", "Camelot", "Tabula",
  "TableTransformer", "Textract tables", "Azure form recognizer tables",
  "markdown table for LLM"

  DO NOT USE FOR: general PDF text - use `pdf-extraction`;
  full OCR pipelines - use `ocr`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Table Extraction

## Tool Comparison

| Tool | Input | Ruled Tables | Borderless | Merged Cells | Cost |
|------|-------|--------------|------------|--------------|------|
| Camelot (lattice) | Digital PDF | Excellent | Poor | Partial | Free |
| Camelot (stream) | Digital PDF | OK | OK | Poor | Free |
| Tabula | Digital PDF | Excellent | OK | Poor | Free |
| pdfplumber | Digital PDF | Very good | Good | Partial | Free |
| TableTransformer | Image/PDF | Excellent | Excellent | Good | GPU time |
| AWS Textract Tables | PDF/image | Excellent | Excellent | Yes | Per-page |
| Azure Doc Intelligence | PDF/image | Excellent | Excellent | Yes | Per-page |

## Camelot

```python
import camelot

# Lattice: ruled tables
tables = camelot.read_pdf(
    "report.pdf",
    pages="1-end",
    flavor="lattice",
    line_scale=40,
)

# Stream: whitespace-delimited
tables_stream = camelot.read_pdf(
    "report.pdf",
    pages="1-end",
    flavor="stream",
    edge_tol=500,
    row_tol=10,
)

print(f"Found {tables.n} tables")
for i, t in enumerate(tables):
    print(t.parsing_report)        # accuracy, whitespace, order
    df = t.df                      # pandas DataFrame
    df.to_csv(f"table_{i}.csv", index=False)
```

## Tabula-py

```python
import tabula

dfs = tabula.read_pdf(
    "report.pdf",
    pages="all",
    multiple_tables=True,
    lattice=True,
    pandas_options={"header": 0},
)

tabula.convert_into("report.pdf", "tables.csv", output_format="csv", pages="all")
```

## pdfplumber Tables

```python
import pdfplumber

with pdfplumber.open("report.pdf") as pdf:
    for page_num, page in enumerate(pdf.pages):
        settings = {
            "vertical_strategy": "lines",
            "horizontal_strategy": "lines",
            "snap_tolerance": 3,
            "join_tolerance": 3,
        }
        for table in page.extract_tables(table_settings=settings):
            # table is list[list[str|None]]
            cleaned = [[c or "" for c in row] for row in table]
            print(f"Page {page_num+1}:", cleaned[0])
```

## TableTransformer (Microsoft, DETR-based)

```python
from transformers import AutoImageProcessor, TableTransformerForObjectDetection
from PIL import Image
import torch

processor = AutoImageProcessor.from_pretrained("microsoft/table-transformer-detection")
detector = TableTransformerForObjectDetection.from_pretrained("microsoft/table-transformer-detection")

structure = TableTransformerForObjectDetection.from_pretrained(
    "microsoft/table-transformer-structure-recognition-v1.1-all"
)

image = Image.open("page.png").convert("RGB")
inputs = processor(images=image, return_tensors="pt")

with torch.no_grad():
    outputs = detector(**inputs)

target_sizes = torch.tensor([image.size[::-1]])
results = processor.post_process_object_detection(outputs, threshold=0.9, target_sizes=target_sizes)[0]

for score, label, box in zip(results["scores"], results["labels"], results["boxes"]):
    print(detector.config.id2label[label.item()], score.item(), box.tolist())

# Crop detected table and run structure model
x0, y0, x1, y1 = results["boxes"][0].tolist()
table_img = image.crop((x0, y0, x1, y1))
structure_inputs = processor(images=table_img, return_tensors="pt")
with torch.no_grad():
    structure_out = structure(**structure_inputs)
```

## AWS Textract — Tables + Queries

```python
import boto3

client = boto3.client("textract", region_name="us-east-1")

with open("form.pdf", "rb") as f:
    response = client.analyze_document(
        Document={"Bytes": f.read()},
        FeatureTypes=["TABLES", "FORMS"],
    )

# Build cell grid
blocks = {b["Id"]: b for b in response["Blocks"]}
tables = [b for b in response["Blocks"] if b["BlockType"] == "TABLE"]

def cell_text(cell_block):
    out = []
    for rel in cell_block.get("Relationships", []):
        if rel["Type"] == "CHILD":
            for child_id in rel["Ids"]:
                word = blocks[child_id]
                if word["BlockType"] == "WORD":
                    out.append(word["Text"])
    return " ".join(out)

for table in tables:
    cells = []
    for rel in table.get("Relationships", []):
        if rel["Type"] == "CHILD":
            for cid in rel["Ids"]:
                cb = blocks[cid]
                if cb["BlockType"] == "CELL":
                    cells.append({
                        "row": cb["RowIndex"],
                        "col": cb["ColumnIndex"],
                        "row_span": cb.get("RowSpan", 1),
                        "col_span": cb.get("ColumnSpan", 1),
                        "text": cell_text(cb),
                    })
    print(cells[:5])
```

### Textract Queries (ask targeted questions)

```python
response = client.analyze_document(
    Document={"Bytes": pdf_bytes},
    FeatureTypes=["QUERIES"],
    QueriesConfig={"Queries": [
        {"Text": "What is the invoice total?", "Alias": "TOTAL"},
        {"Text": "What is the due date?", "Alias": "DUE_DATE"},
    ]},
)
```

## Azure AI Document Intelligence

```python
from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.core.credentials import AzureKeyCredential
import os

client = DocumentIntelligenceClient(
    endpoint=os.environ["AZURE_DOC_INTEL_ENDPOINT"],
    credential=AzureKeyCredential(os.environ["AZURE_DOC_INTEL_KEY"]),
)

with open("report.pdf", "rb") as f:
    poller = client.begin_analyze_document(
        model_id="prebuilt-layout",
        body=f,
        output_content_format="markdown",
    )
result = poller.result()

for table in result.tables:
    print(f"Rows: {table.row_count}, Cols: {table.column_count}")
    for cell in table.cells:
        print(cell.row_index, cell.column_index, cell.content,
              "span=", cell.row_span, cell.column_span)
```

## Convert Table to Markdown (for LLM Context)

```python
import pandas as pd

def df_to_markdown(df: pd.DataFrame, caption: str | None = None) -> str:
    df = df.fillna("").astype(str)
    header = "| " + " | ".join(df.columns) + " |"
    sep    = "|" + "|".join(["---"] * len(df.columns)) + "|"
    rows   = ["| " + " | ".join(row) + " |" for row in df.values]
    md = "\n".join([header, sep, *rows])
    return f"**{caption}**\n\n{md}" if caption else md
```

### Handling Merged Cells (from grid with row/col span)

```python
def cells_to_markdown(cells: list[dict]) -> str:
    rows = max(c["row"] for c in cells)
    cols = max(c["col"] for c in cells)
    grid = [["" for _ in range(cols)] for _ in range(rows)]
    for c in cells:
        for dr in range(c["row_span"]):
            for dc in range(c["col_span"]):
                r = c["row"] - 1 + dr
                col = c["col"] - 1 + dc
                if 0 <= r < rows and 0 <= col < cols and not grid[r][col]:
                    grid[r][col] = c["text"]
    header = "| " + " | ".join(grid[0]) + " |"
    sep    = "|" + "|".join(["---"] * cols) + "|"
    body   = ["| " + " | ".join(r) + " |" for r in grid[1:]]
    return "\n".join([header, sep, *body])
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Passing raw CSV text to LLM | Convert to markdown; LLMs parse it better |
| Using Camelot on scanned PDFs | Scanned requires OCR + TableTransformer or Textract |
| Ignoring merged cells | Expand spans when building grid |
| Single flavor for all PDFs | Try `lattice` then fall back to `stream` |
| No accuracy check | Use `tables.parsing_report` and re-extract low-confidence |
| Losing table context | Prepend caption and page number to markdown |

## Production Checklist

- [ ] Fallback chain: pdfplumber -> Camelot lattice -> Camelot stream -> Textract
- [ ] Tables serialized as markdown with caption + page metadata
- [ ] Merged cells handled (row_span, col_span)
- [ ] Low-confidence tables flagged for human review
- [ ] Page images cached for image-based re-extraction
- [ ] Output schema validated (row/col counts non-zero)
- [ ] Rate limits + retries for Textract/Azure
- [ ] Cost tracking per-page for cloud OCR services
