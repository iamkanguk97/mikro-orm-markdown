import { describe, expect, it } from 'vitest';
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
  it('passes the flat message and the structure to handlers declaring two parameters', () => {
    const calls: [string, StructuredMessage | undefined][] = [];
    emitWarning((message, warning) => {
      calls.push([message, warning]);
    }, FULL_MESSAGE);

    expect(calls).toEqual([[flattenMessage(FULL_MESSAGE), FULL_MESSAGE]]);
  });

  it('passes only the flat message to handlers declaring a single parameter', () => {
    const calls: string[] = [];
    emitWarning((message) => {
      calls.push(message);
    }, FULL_MESSAGE);

    expect(calls).toEqual([flattenMessage(FULL_MESSAGE)]);
  });

  it('passes only the flat message to variadic handlers like console.warn', () => {
    const calls: unknown[][] = [];
    emitWarning((...args: unknown[]) => {
      calls.push(args);
    }, FULL_MESSAGE);

    expect(calls).toEqual([[flattenMessage(FULL_MESSAGE)]]);
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
