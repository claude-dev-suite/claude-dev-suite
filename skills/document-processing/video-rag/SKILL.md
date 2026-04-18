---
name: video-rag
description: |
  Video ingestion for multimodal RAG. Covers keyframe extraction (ffmpeg,
  PySceneDetect), audio-track transcription via Whisper, visual embeddings
  per keyframe (CLIP, SigLIP, VoyageAI multimodal), multi-modal retrieval
  combining visual + transcript hits, timestamp-anchored citations, and
  YouTube transcript ingestion.

  USE WHEN: user mentions "video RAG", "video transcription", "keyframe
  extraction", "PySceneDetect", "ffmpeg scenes", "CLIP embeddings", "SigLIP",
  "VoyageAI multimodal", "YouTube transcript", "multimodal retrieval",
  "video chunking"

  DO NOT USE FOR: audio-only content (podcasts, meetings) - use `audio-transcription`;
  screen recordings that are effectively slide decks - use `office-docs` on the source PPTX;
  static images - use `ocr` or pure vision embeddings
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Video RAG

## Pipeline Overview

```
video.mp4
   |-- ffmpeg demux --------> audio.wav  --> Whisper --> transcript (timestamped segments)
   |                                                       |
   |                                                       v
   |                                         speaker-aware chunks
   |
   |-- PySceneDetect -------> scene list --> ffmpeg extract keyframes --> images
                                                                            |
                                                                            v
                                              CLIP / SigLIP / VoyageAI multimodal embeddings

Index:  text chunks (+ time) + image chunks (+ time) in vector store with shared schema.
Query:  embed text -> search text index AND multimodal index -> merge -> answer with timestamp.
```

## Keyframe Extraction

### ffmpeg — Fixed Interval

```bash
# One frame every 5 seconds, scaled to 512px wide
ffmpeg -i input.mp4 -vf "fps=1/5,scale=512:-1" -q:v 2 frames/f_%05d.jpg
```

### PySceneDetect — Shot Boundaries

```python
from scenedetect import open_video, SceneManager
from scenedetect.detectors import ContentDetector, AdaptiveDetector
from scenedetect.scene_manager import save_images

video = open_video("input.mp4")
mgr = SceneManager()
mgr.add_detector(ContentDetector(threshold=27.0))   # or AdaptiveDetector()
mgr.detect_scenes(video)

scenes = mgr.get_scene_list()
for i, (start, end) in enumerate(scenes):
    print(i, start.get_seconds(), end.get_seconds())

save_images(
    scenes,
    video,
    num_images=1,          # 1 representative frame per scene
    image_name_template="scene-$SCENE_NUMBER",
    output_dir="keyframes",
)
```

### ffmpeg — Scene-Change Detection (no Python)

```bash
# Dump frames at scene cuts with timestamps
ffmpeg -i input.mp4 -vf "select='gt(scene,0.3)',showinfo" \
       -vsync vfr keyframes/kf_%04d.jpg 2> scene-log.txt
```

## Audio Track Extraction

```python
import subprocess

def extract_audio(video_path: str, wav_path: str) -> None:
    # 16 kHz mono WAV - ideal for Whisper
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
        wav_path,
    ], check=True)
```

## Whisper Transcription

See `audio-transcription` skill for the full engine comparison. Minimal example:

```python
from faster_whisper import WhisperModel

model = WhisperModel("large-v3", device="cuda", compute_type="float16")
segments, info = model.transcribe("audio.wav", vad_filter=True,
                                  word_timestamps=True)

transcript_segments = [
    {"start": s.start, "end": s.end, "text": s.text.strip()}
    for s in segments
]
```

## Visual Embeddings

### CLIP (OpenAI / open_clip)

```python
import torch
from PIL import Image
import open_clip

device = "cuda" if torch.cuda.is_available() else "cpu"
model, _, preprocess = open_clip.create_model_and_transforms(
    "ViT-L-14", pretrained="openai"
)
model = model.to(device).eval()
tokenizer = open_clip.get_tokenizer("ViT-L-14")

def embed_image(path: str) -> list[float]:
    img = preprocess(Image.open(path).convert("RGB")).unsqueeze(0).to(device)
    with torch.no_grad():
        vec = model.encode_image(img)
        vec = vec / vec.norm(dim=-1, keepdim=True)
    return vec[0].cpu().tolist()

def embed_text(text: str) -> list[float]:
    tokens = tokenizer([text]).to(device)
    with torch.no_grad():
        vec = model.encode_text(tokens)
        vec = vec / vec.norm(dim=-1, keepdim=True)
    return vec[0].cpu().tolist()
```

### SigLIP (better zero-shot than CLIP)

```python
from transformers import AutoProcessor, AutoModel
import torch

processor = AutoProcessor.from_pretrained("google/siglip-so400m-patch14-384")
model = AutoModel.from_pretrained("google/siglip-so400m-patch14-384").to("cuda").eval()

def embed_image_siglip(path: str) -> list[float]:
    inputs = processor(images=Image.open(path).convert("RGB"), return_tensors="pt").to("cuda")
    with torch.no_grad():
        feats = model.get_image_features(**inputs)
        feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats[0].cpu().tolist()
```

### VoyageAI Multimodal (API)

```python
import os, base64, voyageai

vo = voyageai.Client(api_key=os.environ["VOYAGE_API_KEY"])

def encode_image_b64(path: str) -> str:
    with open(path, "rb") as f:
        return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()

result = vo.multimodal_embed(
    inputs=[[encode_image_b64("keyframes/scene-0001.jpg"), "a laptop on a desk"]],
    model="voyage-multimodal-3",
    input_type="document",
)
vectors = result.embeddings
```

## Unified Chunk Schema

```python
from dataclasses import dataclass
from typing import Literal

@dataclass
class VideoChunk:
    source: str
    modality: Literal["transcript", "visual"]
    start: float
    end: float
    text: str | None           # transcript text or caption
    image_path: str | None     # keyframe on disk or blob URL
    vector: list[float]
    metadata: dict             # speaker, scene_id, etc.
```

Both modalities share the schema so they can live in the same index (with a `modality` filter) or in two parallel indexes merged at query time.

## Chunking + Embedding

```python
def build_video_chunks(video_path: str) -> list[VideoChunk]:
    # 1. Audio
    extract_audio(video_path, "audio.wav")
    model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    segments, info = model.transcribe("audio.wav", vad_filter=True,
                                      word_timestamps=True)
    transcript_segments = [
        {"start": s.start, "end": s.end, "text": s.text.strip()}
        for s in segments
    ]

    # 2. Scenes + keyframes
    video = open_video(video_path)
    mgr = SceneManager()
    mgr.add_detector(ContentDetector(threshold=27.0))
    mgr.detect_scenes(video)
    scenes = mgr.get_scene_list()
    save_images(scenes, video, num_images=1,
                image_name_template="$SCENE_NUMBER",
                output_dir="keyframes")

    # 3. Text chunks
    from openai import OpenAI
    oa = OpenAI()
    text_chunks = []
    for seg in merge_into_windows(transcript_segments, max_chars=900):
        emb = oa.embeddings.create(model="text-embedding-3-large",
                                   input=seg["text"]).data[0].embedding
        text_chunks.append(VideoChunk(
            source=video_path, modality="transcript",
            start=seg["start"], end=seg["end"],
            text=seg["text"], image_path=None,
            vector=emb, metadata={"language": info.language},
        ))

    # 4. Visual chunks
    visual_chunks = []
    for i, (start, end) in enumerate(scenes, start=1):
        img_path = f"keyframes/{i:03d}.jpg"
        vec = embed_image(img_path)
        visual_chunks.append(VideoChunk(
            source=video_path, modality="visual",
            start=start.get_seconds(), end=end.get_seconds(),
            text=None, image_path=img_path,
            vector=vec, metadata={"scene_id": i},
        ))
    return text_chunks + visual_chunks
```

## Multi-Modal Retrieval

Two strategies:

**1. Shared CLIP-space index** (requires CLIP text embeddings for text chunks too, or caption the transcript first). Query text -> embed with CLIP text encoder -> single search.

**2. Dual-index fusion** (recommended): text chunks in a text-embedding space, visual chunks in CLIP/SigLIP space. Query both, combine scores.

```python
def hybrid_search(query: str, k: int = 10) -> list[VideoChunk]:
    # Text side
    text_vec = oa.embeddings.create(
        model="text-embedding-3-large", input=query
    ).data[0].embedding
    text_hits = text_index.query(text_vec, k=k)

    # Visual side
    vis_vec = embed_text(query)   # CLIP text encoder
    vis_hits = visual_index.query(vis_vec, k=k)

    # Reciprocal Rank Fusion
    def rrf(ranks: list[list], k_rrf: int = 60) -> dict:
        scores = {}
        for results in ranks:
            for rank, item in enumerate(results):
                scores[item.id] = scores.get(item.id, 0) + 1 / (k_rrf + rank)
        return scores

    fused = rrf([text_hits, vis_hits])
    return sorted(fused, key=fused.get, reverse=True)[:k]
```

## Timestamp-Anchored Citations

```python
def citation(chunk: VideoChunk) -> str:
    h, rem = divmod(int(chunk.start), 3600)
    m, s = divmod(rem, 60)
    stamp = f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"
    return f"{chunk.source} @ {stamp} ({chunk.modality})"

# YouTube deep link
def youtube_link(video_id: str, start: float) -> str:
    return f"https://youtu.be/{video_id}?t={int(start)}"
```

## YouTube Transcripts

```python
from youtube_transcript_api import YouTubeTranscriptApi

def fetch_youtube(video_id: str) -> list[dict]:
    # Try manual English, fall back to auto, then any available
    api = YouTubeTranscriptApi()
    listing = api.list(video_id)
    try:
        tx = listing.find_manually_created_transcript(["en"])
    except Exception:
        tx = listing.find_generated_transcript(["en"])
    return [
        {"start": s.start, "end": s.start + s.duration, "text": s.text}
        for s in tx.fetch()
    ]
```

For videos without captions, download with `yt-dlp` then run the Whisper pipeline:

```bash
yt-dlp -f "bestaudio[ext=m4a]" -x --audio-format wav -o "audio.%(ext)s" <url>
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Fixed-interval keyframes on static videos | Use PySceneDetect so each scene is represented once |
| Only transcript, no visuals | A "how do I click the button" query needs visual retrieval too |
| CLIP on huge frames | Resize to 224-384 px per model spec before embedding |
| Storing raw frames in the vector DB | Keep frames on object storage; store URI + vector |
| Ignoring scene boundaries when chunking transcript | Align transcript windows to scene start/end when possible |
| One giant vector per video | Always chunk; the unit of retrieval is seconds, not minutes |
| Mixing CLIP-space and text-embedding-space in one cosine search | Either share space or use RRF fusion |
| Scraping YouTube pages for transcripts | Use `youtube-transcript-api` / `yt-dlp` first |

## Production Checklist

- [ ] Scene-aware keyframes (PySceneDetect) rather than fixed intervals for edited content
- [ ] 16 kHz mono WAV extracted once and cached
- [ ] Transcript and visual chunks share `{source, start, end, modality}` schema
- [ ] Visual model choice documented (CLIP vs SigLIP vs VoyageAI multimodal)
- [ ] Dual-index fusion (RRF) unless using a true shared multimodal space
- [ ] Keyframes stored on object storage, not in the vector DB
- [ ] Citations include deep-linkable timestamps (YouTube `?t=` or local `#t=`)
- [ ] Whisper VAD enabled; language auto-detected and stored
- [ ] Captions path (`youtube-transcript-api`) tried before full Whisper transcription
- [ ] Re-ingest triggered by source hash change, not by re-downloads
