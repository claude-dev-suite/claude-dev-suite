---
name: ocr
description: |
  Optical Character Recognition for scanned documents and images. Covers Tesseract,
  EasyOCR, PaddleOCR, AWS Textract, Azure Document Intelligence, Google Document
  AI, and Anthropic Claude vision. Preprocessing (deskew, denoise, binarize).

  USE WHEN: user mentions "OCR", "scanned PDF", "Tesseract", "Textract",
  "EasyOCR", "PaddleOCR", "Document AI", "Claude vision OCR", "image to text"

  DO NOT USE FOR: born-digital PDFs with selectable text - use `pdf-extraction`;
  table-only extraction - use `table-extraction`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# OCR

## Engine Comparison

| Engine | Accuracy | Speed | Languages | Layout | Cost |
|--------|----------|-------|-----------|--------|------|
| Tesseract 5 | Good | Fast | 100+ | Basic (PSM) | Free |
| EasyOCR | Good | Medium | 80+ | Basic | Free |
| PaddleOCR | Very good | Medium | 80+ | PP-Structure | Free |
| AWS Textract | Excellent | Fast (API) | Many | Forms+tables+queries | Per-page |
| Azure Doc Intelligence | Excellent | Fast (API) | Many | Prebuilt + layout | Per-page |
| Google Document AI | Excellent | Fast (API) | Many | Processors | Per-page |
| Claude vision | Excellent | Medium | Many | Semantic | Per-token |

## Tesseract

```python
import pytesseract
from PIL import Image

# Basic
text = pytesseract.image_to_string(Image.open("scan.png"), lang="eng")

# Tuned: Page Segmentation Mode + OCR Engine Mode
config = r"--oem 3 --psm 6 -c preserve_interword_spaces=1"
text = pytesseract.image_to_string(Image.open("scan.png"), lang="eng+deu", config=config)

# Word-level boxes + confidences
data = pytesseract.image_to_data(
    Image.open("scan.png"),
    output_type=pytesseract.Output.DICT,
    config="--psm 6",
)
for i, word in enumerate(data["text"]):
    if word.strip() and int(data["conf"][i]) > 60:
        print(word, data["left"][i], data["top"][i], data["conf"][i])
```

### PSM Modes (Page Segmentation)

| PSM | Use |
|-----|-----|
| 3 | Default: auto page segmentation |
| 4 | Single column of text of variable sizes |
| 6 | Single uniform block of text (most common) |
| 7 | Single text line |
| 8 | Single word |
| 11 | Sparse text, find as much as possible |
| 12 | Sparse text with OSD |

## Image Preprocessing

```python
import cv2
import numpy as np

def preprocess(path: str) -> np.ndarray:
    img = cv2.imread(path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Denoise
    gray = cv2.fastNlMeansDenoising(gray, h=15)

    # Deskew
    coords = np.column_stack(np.where(gray < 200))
    angle = cv2.minAreaRect(coords)[-1]
    angle = -(90 + angle) if angle < -45 else -angle
    (h, w) = gray.shape
    M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    rotated = cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    # Binarize (Otsu + adaptive fallback)
    _, binary = cv2.threshold(rotated, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Morphological cleanup
    kernel = np.ones((1, 1), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    return binary
```

## EasyOCR

```python
import easyocr

reader = easyocr.Reader(["en", "es"], gpu=True)
results = reader.readtext("scan.jpg", detail=1, paragraph=False)
for bbox, text, conf in results:
    print(conf, text)

# Paragraph mode groups lines
paragraphs = reader.readtext("scan.jpg", paragraph=True)
```

## PaddleOCR

```python
from paddleocr import PaddleOCR

ocr = PaddleOCR(use_angle_cls=True, lang="en", use_gpu=True, show_log=False)
result = ocr.ocr("scan.jpg", cls=True)
for line in result[0]:
    bbox, (text, conf) = line
    print(conf, text)

# PP-Structure for tables + layout
from paddleocr import PPStructure
structure = PPStructure(table=True, ocr=True, show_log=False)
layout = structure("page.png")
for region in layout:
    print(region["type"], region["bbox"])
```

## AWS Textract (Sync + Async)

```python
import boto3

textract = boto3.client("textract", region_name="us-east-1")

# Sync - single page image/PDF <= 5MB
with open("scan.png", "rb") as f:
    resp = textract.detect_document_text(Document={"Bytes": f.read()})
lines = [b["Text"] for b in resp["Blocks"] if b["BlockType"] == "LINE"]

# Async - multi-page PDFs in S3
start = textract.start_document_analysis(
    DocumentLocation={"S3Object": {"Bucket": "docs", "Name": "big.pdf"}},
    FeatureTypes=["TABLES", "FORMS"],
)
job_id = start["JobId"]

import time
while True:
    status = textract.get_document_analysis(JobId=job_id)
    if status["JobStatus"] in ("SUCCEEDED", "FAILED"):
        break
    time.sleep(5)
```

## Azure Document Intelligence

```python
from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.core.credentials import AzureKeyCredential
import os

client = DocumentIntelligenceClient(
    endpoint=os.environ["AZURE_DOC_INTEL_ENDPOINT"],
    credential=AzureKeyCredential(os.environ["AZURE_DOC_INTEL_KEY"]),
)

with open("invoice.pdf", "rb") as f:
    poller = client.begin_analyze_document(
        model_id="prebuilt-read",   # or prebuilt-layout, prebuilt-invoice, ...
        body=f,
    )
result = poller.result()
for page in result.pages:
    for line in page.lines:
        print(line.content)
```

## Google Document AI

```python
from google.cloud import documentai_v1 as documentai

client = documentai.DocumentProcessorServiceClient()
name = "projects/my-proj/locations/us/processors/abc123"

with open("scan.pdf", "rb") as f:
    raw = documentai.RawDocument(content=f.read(), mime_type="application/pdf")

request = documentai.ProcessRequest(name=name, raw_document=raw)
result = client.process_document(request=request)
doc = result.document
print(doc.text[:500])
for page in doc.pages:
    for paragraph in page.paragraphs:
        segment = paragraph.layout.text_anchor.text_segments[0]
        print(doc.text[int(segment.start_index):int(segment.end_index)])
```

## Anthropic Claude Vision for OCR

```python
import anthropic
import base64
from pathlib import Path

client = anthropic.Anthropic()

def claude_ocr(image_path: str) -> str:
    data = base64.standard_b64encode(Path(image_path).read_bytes()).decode()
    media_type = "image/png" if image_path.endswith(".png") else "image/jpeg"
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {
                    "type": "base64", "media_type": media_type, "data": data,
                }},
                {"type": "text", "text": (
                    "Transcribe all text from this image exactly as it appears. "
                    "Preserve line breaks, tables as markdown, and mark unreadable "
                    "text as [UNCLEAR]. Do not summarize or paraphrase."
                )},
            ],
        }],
    )
    return response.content[0].text
```

Strengths: excellent on messy handwriting, tables, mixed layouts. Weaknesses: slower, token cost, occasional hallucination (mitigate with strict prompt).

## Hybrid Pipeline (fast + accurate fallback)

```python
def ocr_with_fallback(image_path: str, conf_threshold: int = 70) -> str:
    data = pytesseract.image_to_data(Image.open(image_path),
                                     output_type=pytesseract.Output.DICT)
    confs = [int(c) for c in data["conf"] if c != "-1"]
    avg = sum(confs) / max(len(confs), 1)
    if avg < conf_threshold:
        return claude_ocr(image_path)
    return pytesseract.image_to_string(Image.open(image_path))
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| OCR on born-digital PDFs | Try text extraction first, OCR only on failure |
| Tesseract on unpreprocessed scans | Deskew, denoise, binarize before OCR |
| Default PSM 3 for forms | Use PSM 6 or 11 depending on layout |
| Ignoring confidence scores | Flag low-conf pages for human or LLM re-OCR |
| No language pack specified | Pass `lang="eng+fra"` for multilingual docs |
| Using vision LLM for all pages | Use it only as fallback - it is expensive |

## Production Checklist

- [ ] Language packs installed for target locales
- [ ] Preprocessing pipeline (deskew, denoise, binarize)
- [ ] Confidence threshold triggers fallback to cloud/LLM OCR
- [ ] Async API used for multi-page documents
- [ ] Cost monitoring per page (Textract, Azure, Claude)
- [ ] PII detection after OCR (SSN, credit cards, etc.)
- [ ] Page-level caching keyed by image hash
- [ ] Dead-letter queue for OCR failures
