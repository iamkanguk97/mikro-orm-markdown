import { describe, expect, it, vi } from 'vitest';
import { emitWarning, flattenWarning, type StructuredWarning } from '../src/warnings.js';

const FULL_WARNING: StructuredWarning = {
  title: 'JSDoc source unavailable',
  detail: 'Entities were discovered from compiled JavaScript.',
  impact: ['Descriptions may be missing.', 'Hidden entities may be exposed.'],
  fix: 'Pass --src "<glob>".',
};

describe('flattenWarning', () => {
  it('joins detail, impact items, and fix into one message', () => {
    expect(flattenWarning(FULL_WARNING)).toBe(
      'Entities were discovered from compiled JavaScript. ' +
        'Descriptions may be missing. Hidden entities may be exposed. ' +
        'Pass --src "<glob>".'
    );
  });

  it('omits absent impact and fix sections', () => {
    const flat = flattenWarning({ title: 'T', detail: 'Something happened.' });
    expect(flat).toBe('Something happened.');
  });
});

describe('emitWarning', () => {
  it('calls the handler with the flat message and the structured warning', () => {
    const onWarn = vi.fn();
    emitWarning(onWarn, FULL_WARNING);

    expect(onWarn).toHaveBeenCalledOnce();
    expect(onWarn).toHaveBeenCalledWith(flattenWarning(FULL_WARNING), FULL_WARNING);
  });

  it('does nothing when no handler is given', () => {
    expect(() => emitWarning(undefined, FULL_WARNING)).not.toThrow();
  });
});
