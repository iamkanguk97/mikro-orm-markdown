import { describe, expect, it } from 'vitest';
import { causeChain, errorMessage } from '../src/error-chain.js';

describe('causeChain', () => {
  it('returns the error itself when there is no cause', () => {
    const err = new Error('lonely');
    expect(causeChain(err)).toEqual([err]);
  });

  it('walks nested Error causes in order', () => {
    const root = new Error('root');
    const middle = new Error('middle', { cause: root });
    const top = new Error('top', { cause: middle });

    expect(causeChain(top)).toEqual([top, middle, root]);
  });

  it('traverses through non-Error objects that carry a cause', () => {
    const sentinel = new Error('sentinel');
    const wrapper = { cause: sentinel };
    const top = new Error('top', { cause: wrapper });

    expect(causeChain(top)).toEqual([top, wrapper, sentinel]);
  });

  it('keeps a trailing non-object value such as a string', () => {
    const top = new Error('top', { cause: 'raw string cause' });
    expect(causeChain(top)).toEqual([top, 'raw string cause']);
  });

  it('keeps a trailing null cause', () => {
    const top = new Error('top', { cause: null });
    expect(causeChain(top)).toEqual([top, null]);
  });

  it('stops on a cause cycle without duplicating links', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    (a as { cause?: unknown }).cause = b;

    expect(causeChain(a)).toEqual([a, b]);
  });

  it('returns a bare non-object value as a single-link chain', () => {
    expect(causeChain('boom')).toEqual(['boom']);
  });
});

describe('errorMessage', () => {
  it('returns the message for Error instances', () => {
    expect(errorMessage(new Error('the message'))).toBe('the message');
  });

  it('stringifies non-Error values', () => {
    expect(errorMessage('plain string')).toBe('plain string');
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage({ code: 'EACCES' })).toBe('[object Object]');
  });
});
