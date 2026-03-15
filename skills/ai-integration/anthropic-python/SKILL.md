---
name: anthropic-python
description: |
  Anthropic Python SDK for Claude API integration. Covers messages API,
  streaming, tool use, vision, error handling, and best practices.
  Use when building Python applications that call the Claude API.

  USE WHEN: user mentions "anthropic", "claude api", "anthropic sdk",
  "anthropic.Anthropic()", "client.messages.create", "claude-opus",
  "claude-sonnet", "tool_use", "streaming claude", "claude python"

  DO NOT USE FOR: OpenAI API, other LLM providers, JavaScript/TypeScript Anthropic SDK
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Anthropic Python SDK

## Installation

```bash
pip install anthropic>=0.25.0
```

## Basic Usage

```python
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

message = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Analyze this tag list and identify patterns."}
    ]
)
print(message.content[0].text)
```

## Model Selection

| Model | ID | Best For |
|-------|-----|---------|
| Claude Opus 4.6 | `claude-opus-4-6` | Complex analysis, expert reasoning |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Balanced performance/cost |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | Fast, lightweight tasks |

## System Prompts

```python
message = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=2048,
    system="You are an industrial automation expert specializing in DCS engineering.",
    messages=[
        {"role": "user", "content": "Review this motor tag list for ISA-5.1 compliance."}
    ]
)
```

## Multi-Turn Conversations

```python
def chat(client: anthropic.Anthropic, history: list, user_message: str) -> tuple[str, list]:
    history.append({"role": "user", "content": user_message})

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=history,
    )

    assistant_text = response.content[0].text
    history.append({"role": "assistant", "content": assistant_text})
    return assistant_text, history
```

## Streaming

```python
with client.messages.stream(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Generate a motor PRT template."}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)

# Or get final message after stream
with client.messages.stream(...) as stream:
    message = stream.get_final_message()
```

## Tool Use (Function Calling)

```python
tools = [
    {
        "name": "validate_tag",
        "description": "Validate an ISA-5.1 tag name and return structured info",
        "input_schema": {
            "type": "object",
            "properties": {
                "tag": {"type": "string", "description": "The tag name to validate"},
                "area": {"type": "integer", "description": "Expected area code"},
            },
            "required": ["tag"],
        },
    }
]

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "Validate tag 11301.FIC.056A for area 11301"}],
)

# Process tool calls
if response.stop_reason == "tool_use":
    for block in response.content:
        if block.type == "tool_use":
            tool_name = block.name
            tool_input = block.input
            result = handle_tool(tool_name, tool_input)
```

## Vision (Image Input)

```python
import base64
from pathlib import Path

def encode_image(path: str) -> str:
    return base64.standard_b64encode(Path(path).read_bytes()).decode("utf-8")

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": encode_image("p&id_diagram.png"),
                    },
                },
                {"type": "text", "text": "Identify all motor symbols and extract their tag names."},
            ],
        }
    ],
)
```

## Error Handling

```python
from anthropic import APIError, APIConnectionError, RateLimitError, APIStatusError

def safe_claude_call(client: anthropic.Anthropic, prompt: str) -> str | None:
    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text

    except RateLimitError:
        # Exponential backoff
        import time
        time.sleep(60)
        return None

    except APIConnectionError as e:
        print(f"Connection error: {e}")
        return None

    except APIStatusError as e:
        print(f"API error {e.status_code}: {e.message}")
        return None
```

## Async Client

```python
import asyncio
import anthropic

async def analyze_batch(prompts: list[str]) -> list[str]:
    client = anthropic.AsyncAnthropic()

    async def call(prompt: str) -> str:
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text

    return await asyncio.gather(*[call(p) for p in prompts])
```

## Usage Tracking

```python
response = client.messages.create(...)

print(response.usage.input_tokens)   # tokens sent
print(response.usage.output_tokens)  # tokens received
# Total cost = input_tokens * price_in + output_tokens * price_out
```

## Integration with Streamlit

```python
import streamlit as st
import anthropic

@st.cache_resource
def get_anthropic_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=st.secrets["anthropic"]["api_key"])

def stream_to_streamlit(prompt: str) -> str:
    client = get_anthropic_client()
    response_placeholder = st.empty()
    full_text = ""

    with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        for text in stream.text_stream:
            full_text += text
            response_placeholder.markdown(full_text + "▌")

    response_placeholder.markdown(full_text)
    return full_text
```

## Best Practices

| Practice | Why |
|----------|-----|
| Use `@st.cache_resource` for client | Avoid creating new client per request |
| Store API key in secrets.toml / env | Never hardcode keys |
| Set `max_tokens` explicitly | Avoid runaway costs |
| Use Haiku for classification/routing | 10x cheaper than Sonnet |
| Use Opus for complex analysis | Best reasoning quality |
| Stream long responses | Better UX, fail faster |
| Handle `RateLimitError` with backoff | API has rate limits |
| Track usage per request | Cost monitoring |
