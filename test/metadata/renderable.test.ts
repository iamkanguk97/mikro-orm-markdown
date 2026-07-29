import type { EntityMetadata } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { isRenderableMeta } from '../../src/metadata/renderable.js';

describe('isRenderableMeta', () => {
  it('excludes pivot tables', () => {
    expect(isRenderableMeta({ pivotTable: true } as EntityMetadata)).toBe(false);
  });

  it('excludes embeddables', () => {
    expect(isRenderableMeta({ embeddable: true } as EntityMetadata)).toBe(false);
  });

  it('includes plain entities', () => {
    expect(isRenderableMeta({} as EntityMetadata)).toBe(true);
  });
});
