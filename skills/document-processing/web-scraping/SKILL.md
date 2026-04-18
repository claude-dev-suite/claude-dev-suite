---
name: web-scraping
description: |
  Web scraping for RAG ingestion. Covers Firecrawl API, Crawl4AI (open source),
  trafilatura (main-content extraction), BeautifulSoup + readability-lxml, Scrapy
  for large crawls, Playwright for JS-rendered pages, sitemap.xml discovery,
  robots.txt, polite crawling, anti-bot, and deduplication.

  USE WHEN: user mentions "web scraping", "crawl website", "Firecrawl", "Crawl4AI",
  "trafilatura", "readability", "BeautifulSoup", "Scrapy", "Playwright scrape",
  "sitemap", "robots.txt", "crawl for RAG", "extract article"

  DO NOT USE FOR: parsing already-downloaded HTML files for layout - use `unstructured-io`;
  PDF downloads from the web - use `pdf-extraction`;
  office docs behind login - use `office-docs`;
  structured markdown vaults - use `markdown-structured`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Web Scraping for RAG

## Tool Comparison

| Tool | Type | JS Rendering | Main-Content | Scale | Best For |
|------|------|--------------|--------------|-------|----------|
| Firecrawl | API (paid) | Yes | Excellent (LLM) | Medium | Quick RAG ingestion, markdown out |
| Crawl4AI | OSS library | Yes (Playwright) | Very good | Medium | Self-hosted, LLM-friendly |
| trafilatura | OSS library | No | Excellent | High | Article/news extraction |
| BeautifulSoup + readability-lxml | OSS | No | Good | High | Custom HTML parsing |
| Scrapy | OSS framework | No (+ splash) | Manual | Very high | Multi-million page crawls |
| Playwright | Browser automation | Yes | Manual | Low-medium | SPA / logged-in scraping |

## Firecrawl API

```python
import os
from firecrawl import FirecrawlApp

app = FirecrawlApp(api_key=os.environ["FIRECRAWL_API_KEY"])

# Single page -> markdown
result = app.scrape_url(
    "https://docs.anthropic.com/claude/docs",
    params={
        "formats": ["markdown", "links", "html"],
        "onlyMainContent": True,
        "waitFor": 1500,
        "timeout": 30000,
    },
)
print(result["markdown"][:500])

# Full site crawl
job = app.crawl_url(
    "https://docs.anthropic.com",
    params={
        "limit": 500,
        "scrapeOptions": {"formats": ["markdown"], "onlyMainContent": True},
        "excludePaths": ["/blog/*", "/legal/*"],
        "maxDepth": 4,
    },
    wait_until_done=True,
)
for page in job["data"]:
    save_chunk(page["metadata"]["sourceURL"], page["markdown"])
```

## Crawl4AI — Open Source, LLM-Friendly

```python
import asyncio
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, BrowserConfig
from crawl4ai.extraction_strategy import LLMExtractionStrategy

async def crawl():
    browser = BrowserConfig(headless=True, viewport_width=1280)
    run_cfg = CrawlerRunConfig(
        word_count_threshold=50,
        exclude_external_links=True,
        remove_overlay_elements=True,
        wait_for="css:article",
        cache_mode="bypass",
    )
    async with AsyncWebCrawler(config=browser) as crawler:
        result = await crawler.arun(
            url="https://example.com/article",
            config=run_cfg,
        )
        return result.markdown.fit_markdown, result.links["internal"]

md, links = asyncio.run(crawl())
```

## trafilatura — Main-Content Extraction

```python
import trafilatura
from trafilatura.settings import use_config

cfg = use_config()
cfg.set("DEFAULT", "EXTRACTION_TIMEOUT", "30")

downloaded = trafilatura.fetch_url("https://news.ycombinator.com/item?id=1")
result = trafilatura.extract(
    downloaded,
    output_format="markdown",
    include_tables=True,
    include_links=True,
    include_comments=False,
    with_metadata=True,
    favor_precision=True,
    config=cfg,
)
print(result)

# Sitemap-driven ingestion
from trafilatura.sitemaps import sitemap_search
urls = sitemap_search("https://example.com")
for url in urls[:1000]:
    html = trafilatura.fetch_url(url)
    text = trafilatura.extract(html, output_format="markdown")
    if text:
        save_chunk(url, text)
```

## BeautifulSoup + readability-lxml

```python
import requests
from bs4 import BeautifulSoup
from readability import Document  # readability-lxml

html = requests.get("https://example.com/post", timeout=15).text

doc = Document(html)
title = doc.title()
cleaned_html = doc.summary(html_partial=True)

soup = BeautifulSoup(cleaned_html, "lxml")
for tag in soup(["script", "style", "nav", "footer", "aside"]):
    tag.decompose()
text = soup.get_text("\n", strip=True)
```

## Scrapy — Large-Scale Crawl

```python
# spider.py
import scrapy
from scrapy.linkextractors import LinkExtractor
from scrapy.spiders import CrawlSpider, Rule

class DocsSpider(CrawlSpider):
    name = "docs"
    allowed_domains = ["example.com"]
    start_urls = ["https://example.com/sitemap.xml"]

    custom_settings = {
        "ROBOTSTXT_OBEY": True,
        "CONCURRENT_REQUESTS": 16,
        "DOWNLOAD_DELAY": 0.5,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_TARGET_CONCURRENCY": 4.0,
        "USER_AGENT": "RAGBot/1.0 (+https://myorg.com/bot)",
        "HTTPCACHE_ENABLED": True,
        "DEPTH_LIMIT": 5,
    }

    rules = (
        Rule(LinkExtractor(allow=r"/docs/"), callback="parse_page", follow=True),
    )

    def parse_page(self, response):
        yield {
            "url": response.url,
            "title": response.css("h1::text").get(),
            "text": " ".join(response.css("article ::text").getall()),
        }
```

Run: `scrapy runspider spider.py -O out.jsonl`.

## Playwright — JS-Rendered Pages

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        user_agent="RAGBot/1.0",
        viewport={"width": 1280, "height": 900},
    )
    page = ctx.new_page()
    page.goto("https://spa.example.com", wait_until="networkidle")
    page.wait_for_selector("article")

    # Auto-scroll for lazy-loaded content
    page.evaluate("""
      async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 200));
        }
      }
    """)

    html = page.content()
    browser.close()
```

## Sitemap.xml Discovery

```python
import requests
import xml.etree.ElementTree as ET

def discover_urls(sitemap_url: str) -> list[str]:
    resp = requests.get(sitemap_url, timeout=15)
    resp.raise_for_status()
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.fromstring(resp.content)
    # Sitemap index vs urlset
    if root.tag.endswith("sitemapindex"):
        urls = []
        for sm in root.findall("sm:sitemap", ns):
            loc = sm.find("sm:loc", ns).text
            urls.extend(discover_urls(loc))
        return urls
    return [u.find("sm:loc", ns).text for u in root.findall("sm:url", ns)]
```

## robots.txt Respect

```python
from urllib.robotparser import RobotFileParser

rp = RobotFileParser()
rp.set_url("https://example.com/robots.txt")
rp.read()

if not rp.can_fetch("RAGBot/1.0", "https://example.com/private/"):
    raise PermissionError("Disallowed by robots.txt")

crawl_delay = rp.crawl_delay("RAGBot/1.0") or 1.0
```

## Anti-Bot Handling

| Challenge | Mitigation |
|---|---|
| Cloudflare / hCaptcha | Use Playwright with `playwright-stealth`, or a paid unblocker (Bright Data, ZenRows) |
| Rate limiting (429) | Exponential backoff + `Retry-After` header |
| IP blocks | Rotating residential proxies; lower `CONCURRENT_REQUESTS_PER_DOMAIN` |
| UA blocklists | Set a real-looking UA and `Accept-Language` |
| JS fingerprinting | `playwright-stealth` patches, `crawl4ai` stealth mode |

```python
# Polite backoff
import time, random, requests

def fetch(url, max_tries=5):
    for attempt in range(max_tries):
        r = requests.get(url, timeout=20, headers={"User-Agent": "RAGBot/1.0"})
        if r.status_code == 200:
            return r.text
        if r.status_code == 429:
            delay = int(r.headers.get("Retry-After", 2 ** attempt))
            time.sleep(delay + random.random())
            continue
        r.raise_for_status()
    raise RuntimeError(f"failed: {url}")
```

## Content Deduplication

```python
import hashlib
from datasketch import MinHash, MinHashLSH

def content_hash(text: str) -> str:
    norm = " ".join(text.split()).lower()
    return hashlib.sha256(norm.encode()).hexdigest()

def minhash(text: str, num_perm=128) -> MinHash:
    m = MinHash(num_perm=num_perm)
    for shingle in {text[i:i+5] for i in range(len(text) - 4)}:
        m.update(shingle.encode())
    return m

lsh = MinHashLSH(threshold=0.85, num_perm=128)
seen_hashes: set[str] = set()

def is_duplicate(url: str, text: str) -> bool:
    h = content_hash(text)
    if h in seen_hashes:
        return True
    mh = minhash(text)
    if lsh.query(mh):
        return True
    seen_hashes.add(h)
    lsh.insert(url, mh)
    return False
```

## Link Following Strategy

- Restrict to `allowed_domains` and same-subdomain when possible.
- BFS by depth with a `seen` set keyed on canonical URL (strip fragments, sort query params).
- Respect `rel="nofollow"` for RAG corpora quality.
- Prefer sitemap-discovered URLs over link-graph crawling to avoid dead ends.

```python
from urllib.parse import urlparse, urlunparse, urljoin, parse_qsl, urlencode

def canonicalize(url: str) -> str:
    p = urlparse(url)
    query = urlencode(sorted(parse_qsl(p.query)))
    return urlunparse((p.scheme, p.netloc.lower(), p.path.rstrip("/"), "", query, ""))
```

## RAG-Ready Pipeline

```python
from dataclasses import dataclass
from datetime import datetime

@dataclass
class WebChunk:
    url: str
    title: str
    text: str
    fetched_at: str
    content_hash: str

def scrape_for_rag(urls: list[str]) -> list[WebChunk]:
    out: list[WebChunk] = []
    for url in urls:
        html = fetch(url)
        md = trafilatura.extract(html, output_format="markdown", with_metadata=False)
        if not md or len(md) < 200:
            continue
        if is_duplicate(url, md):
            continue
        out.append(WebChunk(
            url=url,
            title=Document(html).title(),
            text=md,
            fetched_at=datetime.utcnow().isoformat(),
            content_hash=content_hash(md),
        ))
    return out
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Ignoring robots.txt | Parse with `urllib.robotparser` before fetching |
| Scraping rendered HTML instead of calling the API | Look for a public JSON API first |
| Saving raw HTML as RAG chunks | Run trafilatura or readability first |
| No deduplication | Hash normalized text; MinHash-LSH for near-dupes |
| Unbounded concurrency against one domain | Use `DOWNLOAD_DELAY` + AutoThrottle |
| Re-scraping the same URLs | Persist `{url: last_modified, hash}` and use `If-Modified-Since` |
| Blindly trusting sitemap URLs | Validate status 200 and Content-Type before parsing |

## Production Checklist

- [ ] Descriptive User-Agent with contact URL
- [ ] robots.txt parsed and obeyed
- [ ] Per-domain rate limit / crawl delay
- [ ] Exponential backoff on 429/5xx
- [ ] Canonical URL used as dedup key
- [ ] Content hash + MinHash-LSH for near-duplicate suppression
- [ ] Main-content extraction (trafilatura / readability) before chunking
- [ ] Metadata stored: url, fetched_at, http_status, content_hash, title
- [ ] JS-rendered pages routed to Playwright / Crawl4AI only when needed
- [ ] Scheduled re-crawl that respects `Last-Modified` / `ETag`
