---
name: tei-triton-serving
disable-model-invocation: true
description: |
  High-performance serving of embedding and reranker models in production.
  Covers HuggingFace Text Embeddings Inference (TEI) on GPU, Docker
  deployment, ONNX/FP16 quantization, dynamic batching, NVIDIA Triton for
  co-serving embedding + reranker + LLM, and NVIDIA NIM as a managed
  alternative. Benchmarks and configs.

  USE WHEN: user mentions "TEI", "Text Embeddings Inference", "Triton",
  "Triton Inference Server", "NIM", "NVIDIA NIM", "embedding server",
  "reranker server", "ONNX embedding", "serve BGE", "serve E5"

  DO NOT USE FOR: vector DB serving - use `rag-architecture`;
  LLM serving in general - use provider-specific docs;
  cost tracking - use `cost-allocation`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# TEI, Triton, and NIM for Embedding/Reranker Serving

Embeddings and rerankers are the hottest-path CPU/GPU work in RAG. Serving them with `sentence-transformers` in-process or behind a plain Flask/FastAPI app leaves 3–10x throughput on the table. Three production paths:

1. **TEI (Text Embeddings Inference)** — HuggingFace's purpose-built server for sentence-transformers/BGE/E5 and cross-encoder rerankers. Rust core, dynamic batching, ONNX + FP16 + CUDA kernels. Easiest win.
2. **NVIDIA Triton** — general model server. Use when you need to co-serve embedding + reranker + small LLM (or ASR/CV models) behind one gateway, with ensembles and model pipelines.
3. **NVIDIA NIM** — NVIDIA-managed containers (embedding, reranking, LLM) with OpenAI-compatible APIs. Trade vendor lock for zero ops.

## TEI Quick Start

```bash
# BGE large on a single GPU
docker run -d --gpus all --shm-size 1g -p 8080:80 \
  -v $PWD/data:/data \
  ghcr.io/huggingface/text-embeddings-inference:latest \
  --model-id BAAI/bge-large-en-v1.5 \
  --max-batch-tokens 16384 \
  --max-concurrent-requests 512 \
  --dtype float16
```

Embedding call:

```bash
curl -s http://localhost:8080/embed \
  -H "Content-Type: application/json" \
  -d '{"inputs":["How do I rotate credentials?","What is the SLA?"]}'
```

OpenAI-compatible:

```bash
curl -s http://localhost:8080/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"bge-large","input":["hello"]}'
```

### Cross-encoder Reranker on TEI

```bash
docker run -d --gpus all -p 8081:80 \
  ghcr.io/huggingface/text-embeddings-inference:latest \
  --model-id BAAI/bge-reranker-large \
  --dtype float16

curl -s http://localhost:8081/rerank \
  -H "Content-Type: application/json" \
  -d '{"query":"rotate credentials","texts":["KMS rotates nightly","..."]}'
```

### ONNX / CPU-friendly Builds

```bash
# Pre-quantized ONNX version of BGE-small
docker run -d -p 8080:80 \
  ghcr.io/huggingface/text-embeddings-inference:cpu-latest \
  --model-id BAAI/bge-small-en-v1.5 \
  --pooling mean
```

CPU mode with INT8 ONNX gives ~200–400 QPS/core on short inputs and is plenty for low-traffic or air-gapped deployments.

### Sizing

| Model | GPU | Max batch tokens | Typical p95 (batch 32) | Throughput |
|---|---|---|---|---|
| bge-small-en-v1.5 (384d) | L4 | 32768 | 25 ms | 4k docs/s |
| bge-large-en-v1.5 (1024d) | L4 | 16384 | 60 ms | 1.2k docs/s |
| bge-large-en-v1.5 | A10 | 16384 | 40 ms | 2k docs/s |
| e5-mistral-7b (4096d) | A100 | 8192 | 180 ms | 300 docs/s |
| bge-reranker-large | L4 | 16384 | 55 ms per pair batch | 400 pairs/s |

Batch size is set indirectly via `--max-batch-tokens`. TEI auto-batches concurrent requests up to this token budget.

### TEI Client in Python

```python
from openai import OpenAI
client = OpenAI(base_url="http://tei:80/v1", api_key="-")
vecs = client.embeddings.create(model="bge-large", input=[...]).data
```

Or native JSON:

```python
import httpx
async with httpx.AsyncClient(base_url="http://tei:80") as c:
    r = await c.post("/embed", json={"inputs": batch}, timeout=30.0)
    vectors = r.json()
```

## NVIDIA Triton Inference Server

Use when you need:
- Co-serving embedding + reranker + generation on one GPU pool.
- Model ensembles (Python pre/post-processing sandwiched around an engine).
- Multi-framework: TensorRT + ONNX + PyTorch under one server.

### Model Repository Layout

```
model_repo/
  bge-large/
    config.pbtxt
    1/
      model.onnx
  bge-reranker/
    config.pbtxt
    1/
      model.onnx
  rag_ensemble/
    config.pbtxt          # ties tokenizer -> embedder -> pooler
    1/
```

### Minimal `config.pbtxt` for an ONNX Embedder

```protobuf
name: "bge-large"
platform: "onnxruntime_onnx"
max_batch_size: 128
input [ { name: "input_ids" data_type: TYPE_INT64 dims: [ -1 ] },
        { name: "attention_mask" data_type: TYPE_INT64 dims: [ -1 ] } ]
output [ { name: "sentence_embedding" data_type: TYPE_FP16 dims: [ 1024 ] } ]
dynamic_batching {
  max_queue_delay_microseconds: 2000
  preferred_batch_size: [ 8, 16, 32 ]
}
instance_group [ { count: 2 kind: KIND_GPU } ]
optimization { execution_accelerators { gpu_execution_accelerator : [ {
  name : "tensorrt"
  parameters { key: "precision_mode" value: "FP16" }
  parameters { key: "max_workspace_size_bytes" value: "4294967296" }
} ] } }
```

### Launch

```bash
docker run --gpus all --rm -p 8000:8000 -p 8001:8001 -p 8002:8002 \
  -v $PWD/model_repo:/models \
  nvcr.io/nvidia/tritonserver:24.08-py3 \
  tritonserver --model-repository=/models --log-verbose=1
```

Ports: 8000 HTTP, 8001 gRPC, 8002 metrics (Prometheus).

### Python Client

```python
import tritonclient.http as httpclient
import numpy as np

c = httpclient.InferenceServerClient("triton:8000")
ids = np.array([[101, 7592, 102]], dtype=np.int64)
mask = np.array([[1, 1, 1]], dtype=np.int64)
inputs = [
    httpclient.InferInput("input_ids", ids.shape, "INT64"),
    httpclient.InferInput("attention_mask", mask.shape, "INT64"),
]
inputs[0].set_data_from_numpy(ids); inputs[1].set_data_from_numpy(mask)
out = c.infer("bge-large", inputs).as_numpy("sentence_embedding")
```

### Ensembles (tokenize → embed → pool)

Compose a Python backend tokenizer model with the ONNX embedder so clients send raw text. See `ensemble_scheduling` in Triton docs; treat the ensemble name as the public endpoint.

## NVIDIA NIM

NIM containers expose OpenAI-compatible endpoints for embedding (`nvidia/nv-embedqa-e5-v5`, `nvidia/llama-3.2-nv-embedqa-1b-v2`) and reranking (`nvidia/llama-3.2-nv-rerankqa-1b-v2`). Deploy:

```bash
docker run -it --rm --gpus all \
  -e NGC_API_KEY=$NGC_API_KEY \
  -p 8000:8000 \
  nvcr.io/nim/nvidia/llama-3.2-nv-embedqa-1b-v2:latest
```

Call:

```python
from openai import OpenAI
nim = OpenAI(base_url="http://nim:8000/v1", api_key="-")
nim.embeddings.create(model="nvidia/llama-3.2-nv-embedqa-1b-v2", input=[...])
```

Trade-offs: NIM gives fastest path to GPU-optimized models with no tuning, but you pay NVIDIA list pricing (or run on approved GPUs) and accept their update cadence.

## Production Patterns

### Sidecar vs Centralized

- **Sidecar** (one TEI per app pod): simple, high locality, wasted GPU.
- **Centralized** (pool of TEI/Triton pods behind a service): shared GPU pool, better utilization, adds RTT.

Centralized wins above ~5 app replicas.

### Health, Readiness, Autoscaling

- TEI: `GET /health` returns 200 when loaded; readyz waits for model load.
- Triton: `GET /v2/health/ready` per-model; surface as K8s readiness probe.
- Autoscale on `text_embeddings_inference_queue_size` / `nv_inference_queue_duration_us` from Prometheus, not raw CPU.

### Warmup

Send 1–2 batched requests at startup so CUDA kernels compile before real traffic. Skip and you eat 2–5 s on the first query.

### Token Budget Alignment

Match `--max-batch-tokens` to your chunk size distribution. If 95% of chunks are 512 tokens, `max-batch-tokens = 16384` gives batches of 32 which is usually the sweet spot.

## Benchmarks (indicative, tune for your workload)

| Stack | Model | GPU | Docs/s | p95 (ms) |
|---|---|---|---|---|
| sentence-transformers in-process | bge-large | L4 | 600 | 120 |
| TEI FP16 | bge-large | L4 | 1800 | 50 |
| TEI FP16 | bge-large | A10 | 2400 | 40 |
| Triton + TensorRT FP16 | bge-large | L4 | 2200 | 35 |
| Triton + TensorRT INT8 | bge-large | L4 | 3000 | 30 |
| NIM (nv-embedqa-e5-v5) | L40S | 3500 | 25 |

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Running `sentence-transformers` in the web worker | Move to TEI/Triton/NIM |
| FP32 on GPU | Use FP16 or INT8 (TensorRT) |
| Tiny batch sizes (1–4) | Tune `max-batch-tokens` to allow dynamic batching |
| One model per container on the same GPU | Triton with `instance_group` shares VRAM |
| No warmup | Send warmup request at pod start |
| Autoscaling on CPU when GPU is the bottleneck | Scale on queue depth / queue duration |
| Cross-encoder rerank called one pair at a time | Batch 16–64 pairs per request |

## Production Checklist

- [ ] Embedding and reranker served on TEI/Triton/NIM (not in-process)
- [ ] FP16 or INT8 precision verified against golden eval set
- [ ] Dynamic batching configured with `max_queue_delay_microseconds` 1–3 ms
- [ ] Warmup request on pod start
- [ ] Prometheus metrics scraped: queue depth, p95 latency, batch size hist
- [ ] K8s HPA scaling on queue metric, not CPU
- [ ] Health + readiness probes wired
- [ ] Separate model versions; shadow new versions before cutover
- [ ] Per-model rate limits at the gateway to prevent GPU starvation
