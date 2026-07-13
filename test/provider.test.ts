import type { Options } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { withTsMorphMetadataProvider } from '../src/provider.js';

function unexpectedImport(): Promise<never> {
  return Promise.reject(new Error('reflection import should not run'));
}

describe('withTsMorphMetadataProvider', () => {
  it('keeps a genuinely absent reflection peer optional without importing it', async () => {
    const options = {} as Options;
    const rootMissing = Object.assign(new Error('root peer missing'), { code: 'MODULE_NOT_FOUND' });
    const resolve = vi.fn(() => {
      throw rootMissing;
    });
    const load = vi.fn(unexpectedImport);

    await expect(withTsMorphMetadataProvider(options, { resolve, load })).resolves.toBe(options);
    expect(resolve).toHaveBeenCalledWith('@mikro-orm/reflection/package.json');
    expect(load).not.toHaveBeenCalled();
  });

  it('preserves a broken transitive import error after the root peer resolves', async () => {
    const options = {} as Options;
    const transitiveCause = new Error('transitive dependency resolution failed');
    const importFailure = Object.assign(
      new Error('broken transitive package imported from @mikro-orm/reflection', { cause: transitiveCause }),
      { code: 'ERR_MODULE_NOT_FOUND' }
    );
    const resolve = vi.fn(() => '/node_modules/@mikro-orm/reflection/package.json');
    const load = vi.fn(async (): Promise<never> => {
      throw importFailure;
    });

    await expect(withTsMorphMetadataProvider(options, { resolve, load })).rejects.toBe(importFailure);
    expect(importFailure.cause).toBe(transitiveCause);
    expect(resolve).toHaveBeenCalledWith('@mikro-orm/reflection/package.json');
    expect(load).toHaveBeenCalledOnce();
  });

  it('preserves a non-missing root resolution error unchanged', async () => {
    const options = {} as Options;
    const resolutionFailure = Object.assign(new Error('invalid package exports'), {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    });
    const resolve = vi.fn(() => {
      throw resolutionFailure;
    });
    const load = vi.fn(unexpectedImport);

    await expect(withTsMorphMetadataProvider(options, { resolve, load })).rejects.toBe(resolutionFailure);
    expect(load).not.toHaveBeenCalled();
  });

  it('does not resolve or import reflection when a provider is explicitly configured', async () => {
    class ConfiguredProvider {}
    const options = { metadataProvider: ConfiguredProvider } as unknown as Options;
    const resolve = vi.fn(() => '/node_modules/@mikro-orm/reflection/package.json');
    const load = vi.fn(unexpectedImport);

    await expect(withTsMorphMetadataProvider(options, { resolve, load })).resolves.toBe(options);
    expect(resolve).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
});
