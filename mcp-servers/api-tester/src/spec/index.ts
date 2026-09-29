// SPDX-License-Identifier: MIT
/** Load a spec and build its operation model, cached with the loaded document. */

import { loadSpec, type LoadedSpec } from './loader.js';
import { buildModel, type ApiModel } from './model.js';

const models = new WeakMap<LoadedSpec, ApiModel>();

export async function loadModel(source: string): Promise<ApiModel> {
  const loaded = await loadSpec(source);
  let model = models.get(loaded);
  if (!model) {
    model = buildModel(loaded);
    models.set(loaded, model);
  }
  return model;
}

export * from './model.js';
export { loadSpec, loadSpecFromObject, parseDocument } from './loader.js';
export { generateSample, wrongTypeValue, objectShape } from './sample.js';
export { validateAgainst, validateJsonSchema, toJsonSchema } from './schema.js';
