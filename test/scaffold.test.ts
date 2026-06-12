import { describe, expect, it } from 'vitest';
import type { GenerateOptions } from '../src/model/types.js';

describe('scaffold', () => {
  it('GenerateOptions type is exported', () => {
    const opts: GenerateOptions = {
      config: 'mikro-orm.config.ts',
      out: 'ERD.md',
      title: 'Test',
    };
    expect(opts.config).toBe('mikro-orm.config.ts');
  });
});
