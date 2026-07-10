/**
 * Structured payload for long guidance messages (cause + impact + fix), shared
 * by warnings and errors.
 *
 * Messages are always delivered flat — warnings as the `onWarn` message
 * argument, errors as `Error.message` — so consumers can log them with any
 * logger. Emitters of long guidance messages additionally attach this
 * structure so presentation layers (e.g. the CLI) can render them as
 * scannable sections instead of one long line. Short one-line messages carry
 * no structure.
 */
export interface StructuredMessage {
  /** Short headline, e.g. "JSDoc source unavailable". */
  title: string;
  /** What happened and why. */
  detail: string;
  /** Consequences the user should be aware of. */
  impact?: string[];
  /** Suggested action to resolve the problem. */
  fix?: string;
}

/**
 * Receives non-fatal warnings. `message` is always present and self-contained;
 * `warning` carries the structured form when the emitter provides one.
 */
export type WarnHandler = (message: string, warning?: StructuredMessage) => void;

/** Flattens a structured message into a single self-contained string. */
export function flattenMessage(structured: StructuredMessage): string {
  const parts = [structured.detail, ...(structured.impact ?? [])];
  if (structured.fix !== undefined) {
    parts.push(structured.fix);
  }
  return parts.join(' ');
}

/** Emits a structured warning through an optional handler, flattening it for the message argument. */
export function emitWarning(onWarn: WarnHandler | undefined, warning: StructuredMessage): void {
  onWarn?.(flattenMessage(warning), warning);
}

/**
 * A fatal error carrying a structured guidance message.
 *
 * `message` is the flattened single-line form, so programmatic consumers,
 * stack traces, and logs see a plain self-contained string; the CLI renders
 * `structured` as sections instead.
 */
export class StructuredError extends Error {
  constructor(readonly structured: StructuredMessage) {
    super(flattenMessage(structured));
    this.name = 'StructuredError';
  }
}
