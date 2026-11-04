import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

// Mirrors a common real-world shape: an abstract (non-entity) soft-delete base,
// a table comment as the source of truth, and class JSDoc carrying tags only.

export abstract class TableCommentSoftDeletableBase {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  @Property({ type: 'datetime', nullable: true })
  deletedAt?: Date;
}

/** @namespace Core */
@Entity({
  schema: 'dbo',
  tableName: 'tag_only_address',
  comment: 'Each row represents a single postal address',
})
export class TagOnlyJsDocAddress extends TableCommentSoftDeletableBase {
  @Property({ type: 'string' })
  street!: string;
}

/**
 * JSDoc description that must win over the table comment.
 * @namespace Core
 */
@Entity({ tableName: 'described_address', comment: 'Table comment that must not render' })
export class DescribedJsDocAddress extends TableCommentSoftDeletableBase {
  @Property({ type: 'string' })
  street!: string;
}
