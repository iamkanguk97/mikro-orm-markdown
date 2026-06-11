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

// ─── Internal model types (not exported via index.ts) ────────────────────────

/** A single column (scalar or FK) in an entity box. */
export interface ColumnModel {
  /** TypeScript property name (e.g. "author"). */
  propName: string;
  /** Actual DB column name from NamingStrategy (e.g. "author_id"). */
  fieldName: string;
  /** MikroORM type string, normalized for Mermaid (e.g. "integer", "string"). */
  type: string;
  isPrimary: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  isNullable: boolean;
  /** Optional description from JSDoc or @Property({ comment }) (populated in Milestone 4). */
  comment?: string;
}

/** A directed relation edge from the owning side to the referenced side. */
export interface RelationEdge {
  /** className of the entity that owns the FK / pivot. */
  fromEntity: string;
  /** className of the referenced entity. */
  toEntity: string;
  /**
   * Mermaid cardinality symbol on the fromEntity side.
   * e.g. "}o" = zero-or-many, "||" = exactly-one
   */
  fromCardinality: string;
  /**
   * Mermaid cardinality symbol on the toEntity side.
   * e.g. "||" = exactly-one, "o|" = zero-or-one
   */
  toCardinality: string;
  /** Label shown on the relation arrow (= property name). */
  label: string;
}

/** An entity box in the ERD (pivot tables excluded). */
export interface EntityModel {
  className: string;
  tableName: string;
  columns: ColumnModel[];
  isPivot: boolean;
  isEmbeddable: boolean;
}

/** Complete model for one ERD section — input to the Mermaid renderer. */
export interface DiagramModel {
  entities: EntityModel[];
  relations: RelationEdge[];
}
