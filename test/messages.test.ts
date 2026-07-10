import { describe, expect, it, vi } from 'vitest';
import { emitWarning, flattenMessage, StructuredError, type StructuredMessage } from '../src/messages.js';

const FULL_MESSAGE: StructuredMessage = {
  title: 'JSDoc source unavailable',
  detail: 'Entities were discovered from compiled JavaScript.',
  impact: ['Descriptions may be missing.', 'Hidden entities may be exposed.'],
  fix: 'Pass --src "<glob>".',
};

describe('flattenMessage', () => {
  it('joins detail, impact items, and fix into one message', () => {
    expect(flattenMessage(FULL_MESSAGE)).toBe(
      'Entities were discovered from compiled JavaScript. ' +
        'Descriptions may be missing. Hidden entities may be exposed. ' +
        'Pass --src "<glob>".'
    );
  });

  it('omits absent impact and fix sections', () => {
    const flat = flattenMessage({ title: 'T', detail: 'Something happened.' });
    expect(flat).toBe('Something happened.');
  });
});

describe('emitWarning', () => {
  it('calls the handler with the flat message and the structured message', () => {
    const onWarn = vi.fn();
    emitWarning(onWarn, FULL_MESSAGE);

    expect(onWarn).toHaveBeenCalledOnce();
    expect(onWarn).toHaveBeenCalledWith(flattenMessage(FULL_MESSAGE), FULL_MESSAGE);
  });

  it('does nothing when no handler is given', () => {
    expect(() => emitWarning(undefined, FULL_MESSAGE)).not.toThrow();
  });
});

describe('StructuredError', () => {
  it('uses the flattened message as Error.message and keeps the structure', () => {
    const err = new StructuredError(FULL_MESSAGE);

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('StructuredError');
    expect(err.message).toBe(flattenMessage(FULL_MESSAGE));
    expect(err.structured).toBe(FULL_MESSAGE);
  });
});
