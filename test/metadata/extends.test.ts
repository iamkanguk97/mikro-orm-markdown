import { describe, expect, it } from 'vitest';
import { resolveExtendsName } from '../../src/metadata/extends.js';
import { makeEntityMeta } from '../helpers/entity-meta.js';

describe('resolveExtendsName', () => {
  it('returns the class name when MikroORM v6 stores it as a string', () => {
    const meta = makeEntityMeta({ className: 'Dog', tableName: 'animals', extends: 'Animal' });

    expect(resolveExtendsName(meta)).toBe('Animal');
  });

  it('returns the class name when MikroORM v7 stores the ancestor class itself', () => {
    class Animal {}
    const meta = makeEntityMeta({ className: 'Dog', tableName: 'animals', extends: Animal });

    expect(resolveExtendsName(meta)).toBe('Animal');
  });

  it('returns undefined for an entity that extends nothing', () => {
    const meta = makeEntityMeta({ className: 'Animal', tableName: 'animals' });

    expect(resolveExtendsName(meta)).toBeUndefined();
  });

  it('treats an empty string as extending nothing', () => {
    const meta = makeEntityMeta({ className: 'Animal', tableName: 'animals', extends: '' });

    expect(resolveExtendsName(meta)).toBeUndefined();
  });

  it('treats an anonymous ancestor class as extending nothing', () => {
    const meta = makeEntityMeta({ className: 'Dog', tableName: 'animals', extends: (() => class {})() });

    expect(resolveExtendsName(meta)).toBeUndefined();
  });
});
