import { EntitySchema } from '@mikro-orm/core';

/**
 * Runtime feature toggle, declared with EntitySchema instead of decorators —
 * it renders from metadata right next to the decorator-based entities.
 */
export const FeatureFlagSchema = new EntitySchema({
  name: 'FeatureFlag',
  properties: {
    id: { primary: true, type: 'integer' },
    key: { type: 'string', unique: true },
    enabled: { type: 'boolean' },
  },
});
