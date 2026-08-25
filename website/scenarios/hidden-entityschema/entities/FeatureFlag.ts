import { EntitySchema } from '@mikro-orm/core';

/**
 * Runtime feature toggle, declared with EntitySchema instead of decorators —
 * this description and the namespace group are read from the schema declaration.
 * @namespace Rollout
 */
export const FeatureFlagSchema = new EntitySchema({
  name: 'FeatureFlag',
  properties: {
    id: { primary: true, type: 'integer' },
    key: { type: 'string', unique: true },
    enabled: { type: 'boolean' },
  },
});
