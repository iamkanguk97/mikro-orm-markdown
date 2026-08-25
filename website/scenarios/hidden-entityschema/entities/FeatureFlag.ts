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
    // Schema properties cannot carry JSDoc, but `comment` is runtime metadata:
    // it fills the Description column (and doubles as the DDL column comment).
    key: { type: 'string', unique: true, comment: 'Unique flag name, e.g. new-checkout' },
    enabled: { type: 'boolean', comment: 'Current on/off state' },
  },
});
