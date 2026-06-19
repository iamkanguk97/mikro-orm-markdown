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
  /** DB column comment from @Property({ comment }); used as the description fallback when no JSDoc exists. */
  comment?: string;
  /**
   * SQL expression for @Formula columns (e.g. "LENGTH(name)").
   * When set, the column has no physical DB column — it is computed at SELECT time.
   */
  formula?: string;
  /**
   * For embedded flat columns: the TypeScript class name of the @Embeddable
   * (e.g. "Address"). Enables grouping in the rendered output.
   */
  embeddedIn?: string;
  /**
   * For embedded flat columns: the original property name on the @Embeddable
   * class (e.g. "street"). Used to look up that class's own JSDoc.
   */
  embeddedPropName?: string;
  /** True when this column is the STI discriminator column on the root entity. */
  isDiscriminator?: boolean;
  /** Allowed values for an @Enum column (e.g. ["active", "banned"]). */
  enumItems?: string[];
}

/** An index, unique, or check constraint extracted from EntityMetadata. */
export interface ConstraintModel {
  type: 'index' | 'unique' | 'check';
  name?: string;
  /** Property names (or field names) covered by the constraint. */
  properties: string[];
  /** For check constraints: the raw SQL expression. */
  expression?: string;
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

/** An entity box in the ERD (pivot tables and embeddables excluded). */
export interface EntityModel {
  className: string;
  tableName: string;
  columns: ColumnModel[];
  isPivot: boolean;
  isEmbeddable: boolean;
  /**
   * STI root: the column name used to distinguish subclass rows (e.g. "type").
   * Undefined for non-STI entities and STI children.
   */
  discriminatorColumn?: string;
  /**
   * STI child: the className of the root/parent entity (e.g. "Animal").
   * Populated from meta.extends for entities that have a discriminatorValue.
   */
  extendsEntity?: string;
  /** Indexes, unique constraints, and check constraints (used in Milestone 5 markdown). */
  constraints: ConstraintModel[];
}

/** Complete model for one ERD section — input to the Mermaid renderer. */
export interface DiagramModel {
  entities: EntityModel[];
  relations: RelationEdge[];
}
