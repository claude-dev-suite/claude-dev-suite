// SPDX-License-Identifier: MIT
/**
 * Convert `/api/detect`'s response into the shape `POST /api/install` accepts.
 *
 * These two endpoints disagree on casing, and the disagreement was silent.
 * `/api/detect` answers in snake_case (`meta_framework`, `db_type`) because it
 * serialises `StackInfo` from `types/core.ts`; `InstallRequestSchema`'s
 * `DetectedStackSchema` is camelCase, and `installation.service.normalizeStackInfo`
 * reads camelCase back out.
 *
 * The wizard used to map only the two *top-level* names (`project_type`,
 * `is_monorepo`) and forward the `frontend`/`backend`/`database` sub-objects
 * verbatim. Because the schema is `.passthrough()`, the snake_case keys were
 * carried along without complaint and the camelCase reads simply produced
 * `undefined` — so the manifest recorded `meta_framework: undefined` and
 * `db_type: ''`, the integration-validator hook matched on the wrong stack, and
 * no Next.js project was ever considered compatible with a Next.js feature.
 *
 * Keeping the conversion in one tested function is what makes that round trip
 * checkable: detect → payload → normalizeStackInfo must return what detect said.
 */

import type { DetectionResponse } from '@/types';

export interface DetectedStackPayload {
  projectType?: string;
  frontend?: { framework?: string; metaFramework?: string; runtime?: string };
  backend?: { framework?: string; metaFramework?: string; runtime?: string };
  database?: { dbType?: string; orm?: string };
  testing?: { unit?: string; e2e?: string };
  isMonorepo?: boolean;
  confidence?: number;
}

export function toDetectedStackPayload(detection: DetectionResponse): DetectedStackPayload {
  return {
    projectType: detection.project_type,
    frontend: detection.frontend
      ? {
          framework: detection.frontend.framework,
          metaFramework: detection.frontend.meta_framework,
          runtime: detection.frontend.runtime,
        }
      : undefined,
    backend: detection.backend
      ? {
          framework: detection.backend.framework,
          metaFramework: detection.backend.meta_framework,
          runtime: detection.backend.runtime,
        }
      : undefined,
    database: detection.database
      ? {
          dbType: detection.database.db_type,
          orm: detection.database.orm,
        }
      : undefined,
    testing: detection.testing,
    isMonorepo: detection.is_monorepo,
    confidence: detection.confidence,
  };
}
