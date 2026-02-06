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
      local: "opentelemetry/basics.md",
      url: "https://opentelemetry.io/docs/concepts/",
    },
    "nodejs-sdk": {
      local: "opentelemetry/nodejs-sdk.md",
      url: "https://opentelemetry.io/docs/languages/js/getting-started/nodejs/",
    },
    "java-sdk": {
      local: "opentelemetry/java-sdk.md",
      url: "https://opentelemetry.io/docs/languages/java/getting-started/",
    },
    tracing: {
      local: "opentelemetry/tracing.md",
      url: "https://opentelemetry.io/docs/concepts/signals/traces/",
    },
    metrics: {
      local: "opentelemetry/metrics.md",
      url: "https://opentelemetry.io/docs/concepts/signals/metrics/",
    },
    collector: {
      local: "opentelemetry/collector.md",
      url: "https://opentelemetry.io/docs/collector/",
    },
  },
};
