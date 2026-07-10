/**
 * Structured payload for long guidance warnings (cause + impact + fix).
 *
 * Warnings are always delivered to `onWarn` as a flat message string; emitters
 * of long guidance warnings additionally pass this structure so presentation
 * layers (e.g. the CLI) can render them as scannable sections instead of one
 * long line. Short one-line warnings pass no structure.
 */
export interface StructuredWarning {
  /** Short headline, e.g. "JSDoc source unavailable". */
  title: string;
  /** What happened and why. */
  detail: string;
  /** Consequences the user should be aware of. */
  impact?: string[];
  /** Suggested action to resolve the warning. */
  fix?: string;
}

/**
 * Receives non-fatal warnings. `message` is always present and self-contained;
 * `warning` carries the structured form when the emitter provides one.
 */
export type WarnHandler = (message: string, warning?: StructuredWarning) => void;

/** Flattens a structured warning into a single self-contained message string. */
export function flattenWarning(warning: StructuredWarning): string {
  const parts = [warning.detail, ...(warning.impact ?? [])];
  if (warning.fix !== undefined) {
    parts.push(warning.fix);
  }
  return parts.join(' ');
}

/** Emits a structured warning through an optional handler, flattening it for the message argument. */
export function emitWarning(onWarn: WarnHandler | undefined, warning: StructuredWarning): void {
  onWarn?.(flattenWarning(warning), warning);
}
