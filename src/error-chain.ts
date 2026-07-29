/**
 * Shared helpers for inspecting `unknown` errors and their `cause` chains.
 */

/**
 * Walks an error's `cause` chain and returns every link in order, starting
 * with the value itself.
 *
 * Traverses through any object link (not just `Error`s) so wrapped sentinel
 * errors are still discovered, and guards against `cause` cycles. A trailing
 * non-object value (`null`, a string, …) is kept because it still carries
 * information; a trailing `undefined` just means the chain ended and is
 * dropped.
 */
export function causeChain(err: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;

  while (current !== null && typeof current === 'object') {
    if (seen.has(current)) {
      return chain;
    }
    seen.add(current);
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }

  if (current !== undefined) {
    chain.push(current);
  }

  return chain;
}

/** The `message` of an `Error`, or the stringified value for anything else. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
