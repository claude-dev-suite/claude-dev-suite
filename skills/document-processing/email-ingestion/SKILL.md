---
name: email-ingestion
description: |
  Email ingestion for RAG. Covers EML (Python email module, mailparser), MSG
  (extract-msg), Gmail and Outlook APIs, thread reconstruction via In-Reply-To /
  References, recursive attachment handling, signature/quote redaction, chain
  deduplication, and metadata (sender, date, subject) preservation.

  USE WHEN: user mentions "email ingestion", "EML", "MSG file", "mailparser",
  "extract-msg", "Gmail API", "Outlook API", "Microsoft Graph mail",
  "email thread", "reply-to header", "email attachments", "signature stripping"

  DO NOT USE FOR: PDF attachments inside emails (extract here, then route to `pdf-extraction`);
  office attachments (route to `office-docs`);
  image attachments needing OCR - route to `ocr`;
  calendar ICS files - not covered here
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Email Ingestion for RAG

## Format Matrix

| Source | Library | Attachments | Threading Info | Auth |
|--------|---------|-------------|----------------|------|
| EML files | `email` (stdlib), `mailparser` | Yes | Headers | None |
| MSG files (Outlook) | `extract-msg` | Yes | Headers + MAPI props | None |
| Gmail API | `google-api-python-client` | Download via attachmentId | `threadId` | OAuth |
| Outlook / MS365 | `msgraph-sdk` | `/attachments` endpoint | `conversationId` | OAuth |
| mbox | `mailbox` (stdlib) | Yes | Headers | None |

## EML — Python stdlib

```python
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr, parsedate_to_datetime

def parse_eml(path: str) -> dict:
    with open(path, "rb") as f:
        msg = BytesParser(policy=policy.default).parse(f)

    body_text = ""
    body_html = ""
    attachments: list[dict] = []
    for part in msg.walk():
        if part.is_multipart():
            continue
        disp = (part.get("Content-Disposition") or "").lower()
        ctype = part.get_content_type()
        if "attachment" in disp or part.get_filename():
            attachments.append({
                "filename": part.get_filename(),
                "content_type": ctype,
                "payload": part.get_payload(decode=True),
                "content_id": part.get("Content-ID"),
            })
        elif ctype == "text/plain" and not body_text:
            body_text = part.get_content()
        elif ctype == "text/html" and not body_html:
            body_html = part.get_content()

    return {
        "message_id": msg.get("Message-ID"),
        "in_reply_to": msg.get("In-Reply-To"),
        "references": (msg.get("References") or "").split(),
        "from": parseaddr(msg.get("From") or ""),
        "to": [parseaddr(a) for a in (msg.get_all("To") or [])],
        "cc": [parseaddr(a) for a in (msg.get_all("Cc") or [])],
        "subject": msg.get("Subject"),
        "date": parsedate_to_datetime(msg.get("Date")) if msg.get("Date") else None,
        "body_text": body_text,
        "body_html": body_html,
        "attachments": attachments,
    }
```

## mailparser (Higher Level)

```python
import mailparser

m = mailparser.parse_from_file("note.eml")
print(m.from_, m.to, m.subject, m.date)
print(m.body)
for att in m.attachments:
    with open(f"out/{att['filename']}", "wb") as f:
        f.write(att["payload"].encode() if isinstance(att["payload"], str)
                else att["payload"])
```

## MSG — Outlook Files

```python
import extract_msg

msg = extract_msg.Message("meeting.msg")
data = {
    "sender": msg.sender,
    "to": msg.to,
    "cc": msg.cc,
    "subject": msg.subject,
    "date": msg.date,
    "body": msg.body,                 # plain text
    "html": msg.htmlBody,
    "headers": dict(msg.header.items()) if msg.header else {},
}

for att in msg.attachments:
    with open(f"out/{att.longFilename}", "wb") as f:
        f.write(att.data)

# Embedded MSGs (forwarded messages) are recursive
for att in msg.attachments:
    if isinstance(att.data, extract_msg.Message):
        inner = att.data
        print("embedded subject:", inner.subject)
```

## Gmail API

```python
import os, base64
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

creds = Credentials.from_authorized_user_file("token.json",
                                               ["https://www.googleapis.com/auth/gmail.readonly"])
svc = build("gmail", "v1", credentials=creds)

def list_messages(query: str = "newer_than:30d"):
    resp = svc.users().messages().list(userId="me", q=query, maxResults=500).execute()
    return resp.get("messages", [])

def fetch_message(msg_id: str) -> dict:
    m = svc.users().messages().get(userId="me", id=msg_id, format="full").execute()
    headers = {h["name"].lower(): h["value"] for h in m["payload"]["headers"]}

    def walk(part):
        if "parts" in part:
            for p in part["parts"]:
                yield from walk(p)
        else:
            yield part

    text_parts, attachments = [], []
    for part in walk(m["payload"]):
        body = part.get("body", {})
        if body.get("attachmentId"):
            att = svc.users().messages().attachments().get(
                userId="me", messageId=msg_id, id=body["attachmentId"]
            ).execute()
            data = base64.urlsafe_b64decode(att["data"])
            attachments.append({
                "filename": next((h["value"] for h in part.get("headers", [])
                                  if h["name"].lower() == "content-disposition"), ""),
                "mime": part.get("mimeType"),
                "data": data,
            })
        elif part.get("mimeType") == "text/plain" and body.get("data"):
            text_parts.append(base64.urlsafe_b64decode(body["data"]).decode("utf-8", "replace"))

    return {
        "id": msg_id,
        "thread_id": m.get("threadId"),
        "from": headers.get("from"),
        "subject": headers.get("subject"),
        "date": headers.get("date"),
        "message_id": headers.get("message-id"),
        "in_reply_to": headers.get("in-reply-to"),
        "references": (headers.get("references") or "").split(),
        "body": "\n".join(text_parts),
        "attachments": attachments,
    }
```

## Outlook via Microsoft Graph

```python
from msgraph import GraphServiceClient
from azure.identity.aio import ClientSecretCredential

cred = ClientSecretCredential(
    tenant_id=os.environ["MS_TENANT_ID"],
    client_id=os.environ["MS_CLIENT_ID"],
    client_secret=os.environ["MS_CLIENT_SECRET"],
)
graph = GraphServiceClient(credentials=cred, scopes=["https://graph.microsoft.com/.default"])

async def list_messages(user_id: str):
    page = await graph.users.by_user_id(user_id).messages.get()
    return page.value

async def get_attachments(user_id: str, message_id: str):
    return (await graph.users.by_user_id(user_id)
            .messages.by_message_id(message_id)
            .attachments.get()).value
```

## Thread Reconstruction

```python
from collections import defaultdict

def build_threads(messages: list[dict]) -> dict[str, list[dict]]:
    by_id = {m["message_id"]: m for m in messages if m.get("message_id")}
    children = defaultdict(list)
    roots = []
    for m in messages:
        parent = m.get("in_reply_to")
        if parent and parent in by_id:
            children[parent].append(m)
        else:
            roots.append(m)

    threads: dict[str, list[dict]] = {}
    def walk(root):
        out = [root]
        for c in sorted(children[root["message_id"]], key=lambda x: x.get("date") or ""):
            out.extend(walk(c))
        return out

    for root in roots:
        threads[root["message_id"]] = walk(root)
    return threads
```

For Gmail / Outlook the provider already exposes `threadId` / `conversationId`. Prefer those when available; fall back to header-based reconstruction for EML/mbox corpora.

## Signature and Reply-Quote Stripping

```python
import re
from email_reply_parser import EmailReplyParser  # pip install email-reply-parser

SIGNATURE_MARKERS = [
    r"^-- $",                        # RFC 3676 sig separator
    r"^Sent from my (iPhone|iPad|Android)",
    r"^Get Outlook for",
    r"^Best regards,",
    r"^Thanks,?\s*$",
    r"^Cheers,?\s*$",
]
SIG_RE = re.compile("|".join(SIGNATURE_MARKERS), re.MULTILINE | re.IGNORECASE)

def clean_body(text: str) -> str:
    # Strip quoted replies ("On <date> X wrote:" blocks and ">" lines)
    reply = EmailReplyParser.parse_reply(text)
    # Cut at first signature marker
    m = SIG_RE.search(reply)
    if m:
        reply = reply[: m.start()]
    # Drop quoted lines as last resort
    lines = [ln for ln in reply.splitlines() if not ln.lstrip().startswith(">")]
    return "\n".join(lines).strip()
```

## Attachment Recursion

```python
from pathlib import Path

def route_attachment(att: dict, base_dir: Path) -> list[dict]:
    name = att["filename"] or "unnamed"
    ext = name.lower().rsplit(".", 1)[-1]
    blob_path = base_dir / name
    blob_path.write_bytes(att["payload"] or att.get("data", b""))

    # Dispatch to the right skill
    if ext == "pdf":
        from mymodule.pdf import extract_for_rag
        return extract_for_rag(str(blob_path))          # pdf-extraction skill
    if ext in {"docx", "xlsx", "pptx"}:
        from mymodule.office import extract as office_extract
        return office_extract(str(blob_path))           # office-docs skill
    if ext in {"png", "jpg", "jpeg", "tiff"}:
        from mymodule.ocr import run_ocr
        return run_ocr(str(blob_path))                  # ocr skill
    if ext in {"eml", "msg"}:
        return ingest_email_file(str(blob_path))        # recursive
    return []
```

## Deduplication

```python
import hashlib

def email_key(msg: dict) -> str:
    # Prefer Message-ID; fall back to hash of normalized headers+body
    if msg.get("message_id"):
        return msg["message_id"].strip("<>").lower()
    body = clean_body(msg.get("body_text") or msg.get("body") or "")
    basis = f"{msg.get('from')}|{msg.get('subject')}|{msg.get('date')}|{body[:500]}"
    return hashlib.sha256(basis.encode()).hexdigest()

def dedupe(messages: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out = []
    for m in messages:
        k = email_key(m)
        if k in seen:
            continue
        seen.add(k)
        out.append(m)
    return out
```

## Privacy Filtering

```python
PII_PATTERNS = {
    "email": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}",
    "phone": r"\+?\d[\d \-().]{7,}\d",
    "ssn":   r"\b\d{3}-\d{2}-\d{4}\b",
    "cc":    r"\b(?:\d[ -]?){13,16}\b",
}

def redact(text: str, types: list[str] = ("ssn", "cc")) -> str:
    for t in types:
        text = re.sub(PII_PATTERNS[t], f"[REDACTED_{t.upper()}]", text)
    return text
```

## RAG Chunking

```python
from dataclasses import dataclass
from datetime import datetime

@dataclass
class EmailChunk:
    text: str
    message_id: str
    thread_id: str
    sender: str
    subject: str
    date: str
    position_in_thread: int

def email_to_chunks(msg: dict, thread_id: str, position: int) -> list[EmailChunk]:
    body = clean_body(msg.get("body_text") or msg.get("body") or "")
    if not body:
        return []
    return [EmailChunk(
        text=f"Subject: {msg.get('subject')}\nFrom: {msg.get('from')}\n\n{body}",
        message_id=msg.get("message_id") or "",
        thread_id=thread_id,
        sender=str(msg.get("from")),
        subject=msg.get("subject") or "",
        date=msg.get("date").isoformat() if isinstance(msg.get("date"), datetime) else str(msg.get("date")),
        position_in_thread=position,
    )]
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Indexing every reply in a chain separately | Keep threads grouped; index latest + unique content |
| Keeping signatures in embeddings | Strip with `EmailReplyParser` + signature regex |
| Ignoring `In-Reply-To` / `References` | Use them to reconstruct threads for EML/mbox |
| Skipping attachments | Recurse: PDFs -> pdf-extraction, docs -> office-docs |
| Storing full HTML bodies | Convert to text or markdown first |
| Using subject prefix matching for threads | Unreliable; prefer `threadId`/`Message-ID` |
| Leaking PII into embeddings | Redact before embedding when required by policy |
| Re-downloading Gmail messages | Persist `historyId`; use `users.history.list` for deltas |

## Production Checklist

- [ ] Canonical `message_id` stored on every chunk
- [ ] Thread reconstruction via provider ID first, headers second
- [ ] Reply-quote + signature stripped before embedding
- [ ] Attachments routed to the right specialist skill and cross-linked by `message_id`
- [ ] PII redaction configurable per tenant / per corpus
- [ ] Incremental sync (`historyId` for Gmail, `delta` query for Graph)
- [ ] Dedup keyed on Message-ID with hash fallback
- [ ] Metadata preserved: from, to, cc, subject, date, thread_id, position_in_thread
- [ ] HTML bodies converted to markdown/text; inline images handled via Content-ID
