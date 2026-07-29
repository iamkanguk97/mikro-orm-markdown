import type { JsDocResult } from '../../src/docs/jsdoc.js';

/** An empty JsDocResult, with overrides for only the fields a test cares about. */
export function makeJsDocResult(init: Partial<JsDocResult> = {}): JsDocResult {
  return { entities: new Map(), props: new Map(), sourceFileCount: 0, classNames: new Set(), ...init };
}
