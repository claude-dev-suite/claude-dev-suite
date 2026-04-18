---
name: multimodal-rag
description: |
  Retrieval over images, PDFs with figures and tables, audio, and video.
  Vision-language embeddings (CLIP, SigLIP, ImageBind, VoyageAI multimodal,
  BGE-M3), vision-model ingestion (Claude Vision, GPT-4o Vision), table-aware
  retrieval, Whisper-based audio RAG, keyframe + transcript video RAG.

  USE WHEN: user mentions "multimodal RAG", "image search", "PDF with figures",
  "table extraction", "audio RAG", "video RAG", "CLIP", "SigLIP", "VoyageAI multimodal",
  "BGE-M3", "Claude Vision RAG", "GPT-4o Vision"

  DO NOT USE FOR: pure text RAG - use `rag-patterns`;
  graph reasoning - use `graph-rag`;
  grounding/citation enforcement - use `rag-guardrails`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Multimodal RAG

## Embedding Model Matrix

| Model | Modalities | Dim | Notes |
|---|---|---|---|
| CLIP ViT-L/14 (OpenAI) | image + text | 768 | Classic baseline, weak on OCR |
| SigLIP 2 (Google) | image + text | 768/1152 | Stronger zero-shot than CLIP |
| ImageBind (Meta) | image, text, audio, video, depth, IMU | 1024 | Only choice for 6-modality joint space |
| VoyageAI `voyage-multimodal-3` | image + text (interleaved) | 1024 | SOTA for PDF pages with mixed layout |
| Cohere `embed-english-v4` | image + text | 1536 | Competitive, enterprise SLAs |
| BGE-M3 (BAAI) | text (dense + sparse + colbert) | 1024 | Text-only but multi-vector; great for reranking |
| Jina CLIP v2 | image + text (89 langs) | 1024 | Multilingual multimodal |

Rule: for **document pages** use `voyage-multimodal-3`; for **natural images** CLIP/SigLIP; for **audio joint search** ImageBind.

## VoyageAI Multimodal Embeddings

```python
import voyageai, base64

vo = voyageai.Client()

def load_image_b64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

# Interleave text and images in a single input
inputs = [
    [{"type": "text", "text": "Figure 3 of the Q4 earnings report"},
     {"type": "image_base64", "image_base64": load_image_b64("page12.png")}],
    [{"type": "text", "text": "Revenue breakdown by segment"}],
]

result = vo.multimodal_embed(
    inputs=inputs,
    model="voyage-multimodal-3",
    input_type="document",  # "query" for search-time
)
embeddings = result.embeddings  # list[list[float]], 1024-dim
```

At query time call the same model with `input_type="query"` and search the same index.

## PDF Ingestion with Vision Models

For PDFs containing figures, tables, and charts, text-only extraction loses critical signal. Render each page to an image and embed it directly.

```python
# pip install pdf2image pymupdf anthropic voyageai
import fitz  # pymupdf
import base64, io
from PIL import Image
import anthropic

claude = anthropic.Anthropic()

def page_to_png(doc_path: str, page_idx: int, dpi: int = 200) -> bytes:
    doc = fitz.open(doc_path)
    pix = doc[page_idx].get_pixmap(dpi=dpi)
    return pix.tobytes("png")

def describe_page(png: bytes) -> str:
    """Use Claude Vision to generate a rich caption the retriever can index."""
    b64 = base64.b64encode(png).decode()
    msg = claude.messages.create(
        model="claude-opus-4-5",
        max_tokens=800,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64",
                    "media_type": "image/png", "data": b64}},
                {"type": "text", "text":
                    "Produce a dense, searchable summary of this page. "
                    "Include: section headers, all numbers from tables, "
                    "chart axes and trends, figure captions. No prose fluff."},
            ],
        }],
    )
    return msg.content[0].text
```

Index both the **page image embedding** (visual layout) and the **caption text embedding** (searchable semantics). At retrieval time, query both and merge.

## Table-Aware Retrieval

Tables break chunking. Extract them as structured records and attach to their surrounding text.

```python
# pip install unstructured[pdf]
from unstructured.partition.pdf import partition_pdf

elements = partition_pdf(
    filename="report.pdf",
    strategy="hi_res",             # runs layout model
    infer_table_structure=True,    # produces HTML tables
    extract_images_in_pdf=True,
)

for el in elements:
    if el.category == "Table":
        # Store HTML for display, plus a markdown + row-wise text for embedding
        table_md = html_table_to_markdown(el.metadata.text_as_html)
        rows_text = "\n".join(row_text for row_text in iter_rows(el))
        yield {
            "type": "table",
            "page": el.metadata.page_number,
            "html": el.metadata.text_as_html,
            "embed_text": f"{table_md}\n\n{rows_text}",
        }
```

For complex tables (merged cells, spanning headers), prefer **image embeddings of the table region** via VoyageAI multimodal. Serialize to markdown only for final LLM answer synthesis.

## Audio RAG (Whisper + Embed)

```python
# pip install openai-whisper openai
import whisper, openai

model = whisper.load_model("large-v3")
result = model.transcribe("meeting.mp3", word_timestamps=True)

# Chunk by sentence with timestamps preserved
chunks = []
for seg in result["segments"]:
    chunks.append({
        "text": seg["text"].strip(),
        "start": seg["start"],
        "end": seg["end"],
        "source": "meeting.mp3",
    })

oai = openai.OpenAI()
embs = oai.embeddings.create(
    model="text-embedding-3-small",
    input=[c["text"] for c in chunks],
).data
for c, e in zip(chunks, embs):
    c["embedding"] = e.embedding
# Upsert to vector DB; at answer time cite start/end for deep-link playback
```

For **speaker-aware** retrieval use `pyannote.audio` for diarization and prepend `"[Speaker A] "` to each chunk before embedding.

## Video RAG (Keyframes + Transcript)

```python
# pip install ffmpeg-python opencv-python
import cv2, ffmpeg, os

def extract_keyframes(video: str, out_dir: str, fps: float = 0.2):
    """~1 frame every 5 seconds."""
    os.makedirs(out_dir, exist_ok=True)
    (ffmpeg
        .input(video)
        .filter("fps", fps=fps)
        .output(f"{out_dir}/frame_%05d.png")
        .run(quiet=True, overwrite_output=True))

# 1. Keyframes -> image embeddings (VoyageAI multimodal or CLIP)
# 2. Audio -> Whisper transcript -> text embeddings
# 3. Store both with shared video_id and timestamps
# 4. At query, retrieve top-K from both indexes, merge by time window,
#    pass the frame + transcript snippet to a vision LLM for answering.
```

## Unified Multimodal Query (Claude Vision Answer Synthesis)

```python
def answer_multimodal(query: str):
    img_hits = image_index.search(query, k=3)       # returns PNG bytes + meta
    txt_hits = text_index.search(query, k=5)

    content = [{"type": "text",
                "text": f"Question: {query}\n\nUse only the sources below. Cite as [S{'{'}i{'}'}]."}]
    for i, h in enumerate(img_hits):
        b64 = base64.b64encode(h["png"]).decode()
        content.append({"type": "text", "text": f"[S{i}] {h['meta']}"})
        content.append({"type": "image", "source":
            {"type": "base64", "media_type": "image/png", "data": b64}})
    for j, h in enumerate(txt_hits, start=len(img_hits)):
        content.append({"type": "text", "text": f"[S{j}] {h['text']}"})

    msg = claude.messages.create(
        model="claude-opus-4-5",
        max_tokens=1000,
        messages=[{"role": "user", "content": content}],
    )
    return msg.content[0].text
```

## BGE-M3 Multi-Vector Retrieval (Text-Only Sidecar)

BGE-M3 returns three representations per chunk: dense, sparse (lexical), and ColBERT-style multi-vector. Use it as a reranker over multimodal candidates.

```python
from FlagEmbedding import BGEM3FlagModel

m = BGEM3FlagModel("BAAI/bge-m3", use_fp16=True)
out = m.encode(
    ["query or passage text"],
    return_dense=True, return_sparse=True, return_colbert_vecs=True,
)
# Score function combines: 0.4*dense + 0.2*sparse + 0.4*colbert
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| OCR-only PDF ingestion (loses figures/tables) | Page-image embeddings + vision captions |
| Mixing CLIP query embeds with SigLIP index | Same model for index and query, always |
| Flattening tables to plain text | Keep HTML + embed region image + markdown sidecar |
| Transcribing audio without timestamps | Always keep `start`/`end` for citation/playback |
| One frame per second of video | Scene-change detection or 0.1-0.2 fps is enough |
| Ignoring image resolution budget | Resize to model's max (e.g., CLIP 224, SigLIP 384) before embedding |
| No modality-aware rerank | Rerank per modality, then merge; mixing scores across modalities is noisy |

## Production Checklist

- [ ] Embedding model version pinned (reindex plan if upgraded)
- [ ] Page image DPI standardized (200 DPI default)
- [ ] Table extraction path validated against a held-out set
- [ ] Audio diarization enabled where speakers matter
- [ ] Video keyframe rate tuned (0.1-0.5 fps typical)
- [ ] Per-modality indexes with shared document/chunk IDs
- [ ] Vision-LLM context budget enforced (max 20 images per request)
- [ ] Citations resolve back to page+bbox, audio timecode, or video frame
