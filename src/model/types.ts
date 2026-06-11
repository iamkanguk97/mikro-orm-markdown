/** Options accepted by the main generateMarkdown function and CLI. */
export interface GenerateOptions {
  /** Path to the MikroORM config file (default: mikro-orm.config.ts). */
  config: string;
  /** Output markdown file path (default: ERD.md). */
  out: string;
  /** Title shown at the top of the generated document. */
  title: string;
  /** Glob patterns for TypeScript entity source files (for JSDoc extraction). */
  src?: string[];
}
