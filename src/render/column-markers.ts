/**
 * Column-marker presentation constants shared by the Mermaid and markdown
 * renderers, so both outputs describe the same column the same way.
 */

/** Marker for the STI discriminator column on a root entity. */
export const DISCRIMINATOR_LABEL = 'discriminator';

/** Marker naming the @Embeddable source type of a flattened embedded column, e.g. "[Address]". */
export function embeddedLabel(embeddedIn: string): string {
  return `[${embeddedIn}]`;
}
