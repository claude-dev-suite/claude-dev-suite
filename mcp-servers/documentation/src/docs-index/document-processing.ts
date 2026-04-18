// SPDX-License-Identifier: MIT
/**
 * Document processing documentation for RAG pipelines.
 * Includes: PDF, Unstructured, tables, OCR, code, web scraping,
 *           office docs, audio, email, video, markdown.
 *
 * KB layout: knowledge/document-processing/{technology}/{topic}.md
 */

import type { DocsRecord } from "./types.js";

export const DOCUMENT_PROCESSING_TECHNOLOGIES = [
  "pdf-extraction",
  "unstructured-io",
  "table-extraction",
  "ocr",
  "code-chunking",
  "web-scraping",
  "office-docs",
  "audio-transcription",
  "email-ingestion",
  "video-rag",
  "markdown-structured",
] as const;

export const documentProcessingDocs: DocsRecord = {
  "pdf-extraction": {
    overview: { local: "document-processing/pdf-extraction/overview.md", url: "https://pymupdf.readthedocs.io/en/latest/" },
    "tools-comparison": { local: "document-processing/pdf-extraction/tools-comparison.md", url: "https://pymupdf.readthedocs.io/en/latest/" },
    "production-pipeline": { local: "document-processing/pdf-extraction/production-pipeline.md", url: "https://pymupdf.readthedocs.io/en/latest/" },
  },
  "unstructured-io": {
    overview: { local: "document-processing/unstructured-io/overview.md", url: "https://docs.unstructured.io/open-source/introduction/overview" },
    "tools-comparison": { local: "document-processing/unstructured-io/tools-comparison.md", url: "https://docs.unstructured.io/open-source/introduction/overview" },
    "production-pipeline": { local: "document-processing/unstructured-io/production-pipeline.md", url: "https://docs.unstructured.io/open-source/introduction/overview" },
  },
  "table-extraction": {
    overview: { local: "document-processing/table-extraction/overview.md", url: "https://camelot-py.readthedocs.io/en/master/" },
    "tools-comparison": { local: "document-processing/table-extraction/tools-comparison.md", url: "https://camelot-py.readthedocs.io/en/master/" },
    "production-pipeline": { local: "document-processing/table-extraction/production-pipeline.md", url: "https://camelot-py.readthedocs.io/en/master/" },
  },
  ocr: {
    overview: { local: "document-processing/ocr/overview.md", url: "https://tesseract-ocr.github.io/tessdoc/" },
    "tools-comparison": { local: "document-processing/ocr/tools-comparison.md", url: "https://tesseract-ocr.github.io/tessdoc/" },
    "production-pipeline": { local: "document-processing/ocr/production-pipeline.md", url: "https://tesseract-ocr.github.io/tessdoc/" },
  },
  "code-chunking": {
    overview: { local: "document-processing/code-chunking/overview.md", url: "https://tree-sitter.github.io/tree-sitter/" },
    "tools-comparison": { local: "document-processing/code-chunking/tools-comparison.md", url: "https://tree-sitter.github.io/tree-sitter/" },
    "production-pipeline": { local: "document-processing/code-chunking/production-pipeline.md", url: "https://tree-sitter.github.io/tree-sitter/" },
  },
  "web-scraping": {
    overview: { local: "document-processing/web-scraping/overview.md", url: "https://docs.firecrawl.dev/" },
    "tools-comparison": { local: "document-processing/web-scraping/tools-comparison.md", url: "https://docs.firecrawl.dev/" },
    "production-pipeline": { local: "document-processing/web-scraping/production-pipeline.md", url: "https://docs.firecrawl.dev/" },
  },
  "office-docs": {
    overview: { local: "document-processing/office-docs/overview.md", url: "https://python-docx.readthedocs.io/en/latest/" },
    "tools-comparison": { local: "document-processing/office-docs/tools-comparison.md", url: "https://python-docx.readthedocs.io/en/latest/" },
    "production-pipeline": { local: "document-processing/office-docs/production-pipeline.md", url: "https://python-docx.readthedocs.io/en/latest/" },
  },
  "audio-transcription": {
    overview: { local: "document-processing/audio-transcription/overview.md", url: "https://github.com/openai/whisper" },
    "tools-comparison": { local: "document-processing/audio-transcription/tools-comparison.md", url: "https://github.com/openai/whisper" },
    "production-pipeline": { local: "document-processing/audio-transcription/production-pipeline.md", url: "https://github.com/openai/whisper" },
  },
  "email-ingestion": {
    overview: { local: "document-processing/email-ingestion/overview.md", url: "https://docs.python.org/3/library/email.html" },
    "tools-comparison": { local: "document-processing/email-ingestion/tools-comparison.md", url: "https://docs.python.org/3/library/email.html" },
    "production-pipeline": { local: "document-processing/email-ingestion/production-pipeline.md", url: "https://docs.python.org/3/library/email.html" },
  },
  "video-rag": {
    overview: { local: "document-processing/video-rag/overview.md", url: "https://www.scenedetect.com/docs/latest/" },
    "tools-comparison": { local: "document-processing/video-rag/tools-comparison.md", url: "https://www.scenedetect.com/docs/latest/" },
    "production-pipeline": { local: "document-processing/video-rag/production-pipeline.md", url: "https://www.scenedetect.com/docs/latest/" },
  },
  "markdown-structured": {
    overview: { local: "document-processing/markdown-structured/overview.md", url: "https://python.langchain.com/docs/how_to/markdown_header_metadata_splitter/" },
    "tools-comparison": { local: "document-processing/markdown-structured/tools-comparison.md", url: "https://python.langchain.com/docs/how_to/markdown_header_metadata_splitter/" },
    "production-pipeline": { local: "document-processing/markdown-structured/production-pipeline.md", url: "https://python.langchain.com/docs/how_to/markdown_header_metadata_splitter/" },
  },
};
