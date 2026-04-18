---
name: audio-transcription
description: |
  Audio transcription pipeline for RAG. Covers OpenAI Whisper (local via
  whisper.cpp, faster-whisper, Groq API), AssemblyAI (diarization, sentiment),
  Deepgram Nova-3 (real-time), timestamped chunking, speaker-aware chunking,
  multilingual (Whisper large-v3), and embedding transcripts for retrieval.

  USE WHEN: user mentions "transcribe audio", "Whisper", "whisper.cpp",
  "faster-whisper", "Groq Whisper", "AssemblyAI", "Deepgram", "speaker diarization",
  "podcast transcription", "meeting transcript", "multilingual audio"

  DO NOT USE FOR: video with visuals - use `video-rag`;
  live voice assistants (streaming to LLM) - not a RAG concern;
  audio that is actually a phone voicemail attachment in email - handle via `email-ingestion` then reuse this skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Audio Transcription for RAG

## Engine Comparison

| Engine | Deployment | Diarization | Real-Time | Cost | Best For |
|--------|------------|-------------|-----------|------|----------|
| whisper.cpp | Local (CPU/Metal) | No | No | Free | Low-volume offline |
| faster-whisper | Local (CUDA/CPU) | Via pyannote | No | Free | Self-hosted batch |
| Groq Whisper API | API | No | Near real-time | Cheap | Fast bulk transcription |
| OpenAI Whisper API | API | No | No | Medium | Simple drop-in |
| AssemblyAI | API | Yes | Yes | Medium | Meetings, podcasts |
| Deepgram Nova-3 | API | Yes | Yes (streaming) | Medium | Call centers, streaming |

## faster-whisper — Self-Hosted Batch

```python
from faster_whisper import WhisperModel

model = WhisperModel(
    "large-v3",
    device="cuda",
    compute_type="float16",    # or "int8_float16" on small GPUs
    download_root="./models",
)

segments, info = model.transcribe(
    "meeting.mp3",
    language=None,             # auto-detect; or "en", "it", ...
    vad_filter=True,
    vad_parameters={"min_silence_duration_ms": 500},
    beam_size=5,
    word_timestamps=True,
    condition_on_previous_text=False,
)

print("detected:", info.language, "p=", info.language_probability)

transcript = []
for seg in segments:
    transcript.append({
        "start": seg.start,
        "end": seg.end,
        "text": seg.text.strip(),
        "words": [{"w": w.word, "s": w.start, "e": w.end, "p": w.probability}
                  for w in (seg.words or [])],
    })
```

## whisper.cpp — CPU / Apple Silicon

```bash
# Build
git clone https://github.com/ggerganov/whisper.cpp && cd whisper.cpp
make
./models/download-ggml-model.sh large-v3

# Transcribe
./main -m models/ggml-large-v3.bin -f input.wav -oj -of out
```

```python
# Python wrapper
from pywhispercpp.model import Model
m = Model("large-v3", n_threads=8)
for seg in m.transcribe("input.wav", language="auto", translate=False):
    print(seg.t0, seg.t1, seg.text)
```

## Groq Whisper API

```python
import os
from groq import Groq

client = Groq(api_key=os.environ["GROQ_API_KEY"])

with open("podcast.mp3", "rb") as f:
    result = client.audio.transcriptions.create(
        model="whisper-large-v3",
        file=("podcast.mp3", f.read()),
        response_format="verbose_json",
        timestamp_granularities=["segment", "word"],
        language="en",
    )
for seg in result.segments:
    print(seg["start"], seg["end"], seg["text"])
```

## AssemblyAI — Diarization + Sentiment

```python
import assemblyai as aai
aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]

config = aai.TranscriptionConfig(
    speaker_labels=True,
    language_detection=True,
    punctuate=True,
    format_text=True,
    sentiment_analysis=True,
    auto_chapters=True,
    entity_detection=True,
    speech_model=aai.SpeechModel.best,
)

transcript = aai.Transcriber(config=config).transcribe("call.mp3")
for utt in transcript.utterances:
    print(f"Speaker {utt.speaker} [{utt.start/1000:.1f}-{utt.end/1000:.1f}]: {utt.text}")

for chapter in transcript.chapters or []:
    print(chapter.headline, chapter.summary)
```

## Deepgram Nova-3

```python
from deepgram import DeepgramClient, PrerecordedOptions, FileSource

dg = DeepgramClient(os.environ["DEEPGRAM_API_KEY"])
with open("call.wav", "rb") as f:
    payload: FileSource = {"buffer": f.read()}

options = PrerecordedOptions(
    model="nova-3",
    smart_format=True,
    diarize=True,
    utterances=True,
    paragraphs=True,
    language="multi",
    detect_language=True,
)
resp = dg.listen.rest.v("1").transcribe_file(payload, options)

for para in resp.results.channels[0].alternatives[0].paragraphs.paragraphs:
    print(f"Speaker {para.speaker}:", para.sentences[0].text)
```

## Speaker Diarization with pyannote (Whisper + pyannote)

```python
from pyannote.audio import Pipeline

diar = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token=os.environ["HF_TOKEN"],
)
diar_result = diar("meeting.wav")

# Merge Whisper word timestamps with diarization tracks
def assign_speakers(words: list[dict], diar_result) -> list[dict]:
    out = []
    for w in words:
        mid = (w["s"] + w["e"]) / 2
        speaker = "unknown"
        for turn, _, spk in diar_result.itertracks(yield_label=True):
            if turn.start <= mid <= turn.end:
                speaker = spk
                break
        out.append({**w, "speaker": speaker})
    return out
```

## Timestamped Chunking for RAG

```python
from dataclasses import dataclass

@dataclass
class AudioChunk:
    text: str
    start: float
    end: float
    speaker: str | None
    source: str
    language: str

def chunk_transcript(
    segments: list[dict],
    max_chars: int = 1000,
    overlap_chars: int = 150,
    source: str = "",
    language: str = "en",
) -> list[AudioChunk]:
    out: list[AudioChunk] = []
    buf: list[dict] = []
    buf_len = 0
    current_speaker = None
    for seg in segments:
        speaker = seg.get("speaker")
        # New chunk on speaker change OR size overflow
        if (current_speaker and speaker and speaker != current_speaker) or \
           (buf_len + len(seg["text"]) > max_chars and buf):
            out.append(AudioChunk(
                text=" ".join(s["text"] for s in buf).strip(),
                start=buf[0]["start"],
                end=buf[-1]["end"],
                speaker=current_speaker,
                source=source,
                language=language,
            ))
            # Rolling overlap: keep last few segments
            keep = []
            keep_len = 0
            for s in reversed(buf):
                keep_len += len(s["text"])
                keep.insert(0, s)
                if keep_len >= overlap_chars:
                    break
            buf = keep
            buf_len = sum(len(s["text"]) for s in buf)
        buf.append(seg)
        buf_len += len(seg["text"])
        current_speaker = speaker or current_speaker
    if buf:
        out.append(AudioChunk(
            text=" ".join(s["text"] for s in buf).strip(),
            start=buf[0]["start"],
            end=buf[-1]["end"],
            speaker=current_speaker,
            source=source,
            language=language,
        ))
    return out
```

## Multilingual with Whisper large-v3

```python
from faster_whisper import WhisperModel

model = WhisperModel("large-v3", device="cuda", compute_type="float16")

# Transcribe in source language
segments, info = model.transcribe("italian_meeting.mp3", task="transcribe")

# Translate to English (Whisper built-in X->English)
segments_en, _ = model.transcribe("italian_meeting.mp3", task="translate")

# For non-English target, use a translator model on top
from transformers import pipeline
translator = pipeline("translation", model="Helsinki-NLP/opus-mt-it-es")
italian = " ".join(s.text for s in segments)
spanish = translator(italian, max_length=512)[0]["translation_text"]
```

## Embedding Transcripts

```python
from openai import OpenAI

oa = OpenAI()

def embed_chunks(chunks: list[AudioChunk]) -> list[dict]:
    texts = [
        (f"[{c.speaker}] {c.text}" if c.speaker else c.text)
        for c in chunks
    ]
    resp = oa.embeddings.create(model="text-embedding-3-large", input=texts)
    return [{
        "vector": d.embedding,
        "metadata": {
            "source": c.source,
            "start": c.start,
            "end": c.end,
            "speaker": c.speaker,
            "language": c.language,
            "text": c.text,
        },
    } for c, d in zip(chunks, resp.data)]
```

## Full Pipeline

```python
def ingest_audio(path: str) -> list[dict]:
    # 1. Transcribe with word timestamps
    model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    segments, info = model.transcribe(path, vad_filter=True, word_timestamps=True)
    words = []
    for seg in segments:
        for w in (seg.words or []):
            words.append({"s": w.start, "e": w.end, "text": w.word})

    # 2. Diarize
    diar = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1",
                                    use_auth_token=os.environ["HF_TOKEN"])
    diar_result = diar(path)

    # 3. Group words into speaker-aware segments
    segments_with_spk = group_by_speaker(words, diar_result)

    # 4. Chunk for RAG
    chunks = chunk_transcript(segments_with_spk, source=path,
                              language=info.language)

    # 5. Embed
    return embed_chunks(chunks)
```

### Citation-Friendly Answers

```python
def format_citation(chunk: AudioChunk) -> str:
    m, s = divmod(int(chunk.start), 60)
    h, m = divmod(m, 60)
    return f"{chunk.source} @ {h:02d}:{m:02d}:{s:02d}"
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Using `tiny` Whisper for production RAG | Default to `large-v3` or API |
| Fixed time-window chunking | Chunk by segment boundaries + speaker turns |
| Dropping timestamps when chunking | Store `start`/`end` per chunk for citation |
| Skipping VAD on long files | `vad_filter=True` trims silence and hallucinations |
| Ignoring language detection | Always store detected language in metadata |
| Feeding raw mic audio to Whisper | Resample to 16 kHz mono WAV first |
| Loading pyannote model per file | Initialize once and reuse |
| Diarization labels across files | Speaker IDs are per-file; re-identify across files with speaker embeddings |

## Production Checklist

- [ ] 16 kHz mono WAV normalization before transcription
- [ ] VAD enabled to suppress silence + Whisper hallucinations
- [ ] Word-level timestamps for accurate chunking and citations
- [ ] Diarization merged into chunks with `speaker` metadata
- [ ] Source audio path, `start`, `end` preserved on every chunk
- [ ] Language detection stored per chunk (supports multilingual corpora)
- [ ] Long files streamed/chunked (>1h) to stay under GPU memory
- [ ] Fallback engine if primary fails (faster-whisper -> Groq -> OpenAI)
- [ ] PII redaction pass on transcripts before embedding when required
