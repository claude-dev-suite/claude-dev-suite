// SPDX-License-Identifier: MIT
/**
 * Observability documentation
 * Includes: OpenTelemetry, tracing, metrics, logging
 */

import type { DocsRecord } from "./types.js";

export const OBSERVABILITY_TECHNOLOGIES = [
  "opentelemetry",
] as const;

export const observabilityDocs: DocsRecord = {
  opentelemetry: {
    basics: {
      url: "https://opentelemetry.io/docs/concepts/",
    },
    "nodejs-sdk": {
      url: "https://opentelemetry.io/docs/languages/js/getting-started/nodejs/",
    },
    "java-sdk": {
      url: "https://opentelemetry.io/docs/languages/java/getting-started/",
    },
    tracing: {
      url: "https://opentelemetry.io/docs/concepts/signals/traces/",
    },
    metrics: {
      url: "https://opentelemetry.io/docs/concepts/signals/metrics/",
    },
    collector: {
      url: "https://opentelemetry.io/docs/collector/",
    },
  },
};
