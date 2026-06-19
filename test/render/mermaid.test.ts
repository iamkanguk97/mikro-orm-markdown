import { type EntityMetadata, ReferenceKind } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { loadEntityMetadata } from '../../src/metadata/load.js';
import type { ColumnModel, DiagramModel, RelationEdge } from '../../src/model/types.js';
import { buildDiagramModel, renderErDiagram } from '../../src/render/mermaid.js';
import config from '../fixtures/mikro-orm.config.js';

// ─── buildDiagramModel (integration: uses real MikroORM metadata) ─────────────

describe('buildDiagramModel', () => {
  async function getModel(): Promise<DiagramModel> {
    const { metas } = await loadEntityMetadata(config);
    return buildDiagramModel(metas);
  }

  it('excludes pivot tables from entity boxes', async () => {
    const model = await getModel();
    const classNames = model.entities.map((e) => e.className);
    expect(classNames).not.toContain('post_tags');
    expect(classNames).toContain('Author');
    expect(classNames).toContain('Post');
    expect(classNames).toContain('Tag');
  });

  it('Author entity has correct columns', async () => {
    const model = await getModel();
    const author = model.entities.find((e) => e.className === 'Author');
    expect(author).toBeDefined();

    const colNames = author!.columns.map((c) => c.fieldName);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('email');

    const id = author!.columns.find((c) => c.fieldName === 'id');
    expect(id?.isPrimary).toBe(true);

    const email = author!.columns.find((c) => c.fieldName === 'email');
    expect(email?.isUnique).toBe(true);
    expect(email?.isForeignKey).toBe(false);
  });

  it('Post FK column uses DB field name, not property name', async () => {
    const model = await getModel();
    const post = model.entities.find((e) => e.className === 'Post');
    expect(post).toBeDefined();

    const fkCol = post!.columns.find((c) => c.isForeignKey);
    expect(fkCol).toBeDefined();
    // DB column name is author_id, TS property name is author
    expect(fkCol!.fieldName).toBe('author_id');
    expect(fkCol!.propName).toBe('author');
  });

  it('Post m:n tags property does NOT produce a column', async () => {
    const model = await getModel();
    const post = model.entities.find((e) => e.className === 'Post');
    const tagCol = post!.columns.find((c) => c.propName === 'tags');
    expect(tagCol).toBeUndefined();
  });

  it('produces 2 relation edges (Post m:1, Post m:n)', async () => {
    const model = await getModel();
    // Post.author (m:1), Post.tags (m:n owner)
    expect(model.relations).toHaveLength(2);
  });

  it('Post.author edge: many Posts → one Author (not nullable)', async () => {
    const model = await getModel();
    const edge = model.relations.find((r) => r.fromEntity === 'Post' && r.toEntity === 'Author');
    expect(edge).toBeDefined();
    expect(edge!.fromCardinality).toBe('}o');
    expect(edge!.toCardinality).toBe('||');
    expect(edge!.label).toBe('author');
  });

  it('Post.tags edge: many Posts ↔ many Tags', async () => {
    const model = await getModel();
    const edge = model.relations.find((r) => r.fromEntity === 'Post' && r.toEntity === 'Tag');
    expect(edge).toBeDefined();
    expect(edge!.fromCardinality).toBe('}o');
    expect(edge!.toCardinality).toBe('o{');
  });
});

// ─── buildDiagramModel — M3 MikroORM-specific concepts ───────────────────────

describe('buildDiagramModel — Embeddable', () => {
  async function getModel(): Promise<DiagramModel> {
    const { metas } = await loadEntityMetadata(config);
    return buildDiagramModel(metas);
  }

  it('excludes @Embeddable classes from entity boxes', async () => {
    const model = await getModel();
    const classNames = model.entities.map((e) => e.className);
    expect(classNames).not.toContain('Address');
    expect(classNames).toContain('Customer');
  });

  it('Customer entity contains flattened embedded columns with embeddedIn set', async () => {
    const model = await getModel();
    const customer = model.entities.find((e) => e.className === 'Customer');
    expect(customer).toBeDefined();

    const embeddedCols = customer!.columns.filter((c) => c.embeddedIn === 'Address');
    const fieldNames = embeddedCols.map((c) => c.fieldName);
    expect(fieldNames).toContain('address_street');
    expect(fieldNames).toContain('address_city');
    expect(fieldNames).toContain('address_zip_code');
  });

  it('Customer embedded columns are NOT marked as PK/FK', async () => {
    const model = await getModel();
    const customer = model.entities.find((e) => e.className === 'Customer');
    const embeddedCols = customer!.columns.filter((c) => c.embeddedIn !== undefined);
    for (const col of embeddedCols) {
      expect(col.isPrimary).toBe(false);
      expect(col.isForeignKey).toBe(false);
    }
  });

  it('EMBEDDED group reference property is not rendered as a column', async () => {
    const model = await getModel();
    const customer = model.entities.find((e) => e.className === 'Customer');
    // "address" (kind=embedded) should not appear as a direct column
    const addressGroupCol = customer!.columns.find((c) => c.fieldName === 'address');
    expect(addressGroupCol).toBeUndefined();
  });
});

describe('buildDiagramModel — @Formula', () => {
  async function getModel(): Promise<DiagramModel> {
    const { metas } = await loadEntityMetadata(config);
    return buildDiagramModel(metas);
  }

  it('Customer nameLength column has formula set', async () => {
    const model = await getModel();
    const customer = model.entities.find((e) => e.className === 'Customer');
    const nameLengthCol = customer!.columns.find((c) => c.propName === 'nameLength');
    expect(nameLengthCol).toBeDefined();
    expect(nameLengthCol!.formula).toBeDefined();
  });

  it('formula column SQL expression is resolved correctly', async () => {
    const model = await getModel();
    const customer = model.entities.find((e) => e.className === 'Customer');
    const nameLengthCol = customer!.columns.find((c) => c.propName === 'nameLength');
    // @Formula('LENGTH(name)') → should resolve to the SQL expression
    expect(nameLengthCol!.formula).toBe('LENGTH(name)');
  });

  it('formula column fieldName follows NamingStrategy (camelCase → snake_case)', async () => {
    const model = await getModel();
    const customer = model.entities.find((e) => e.className === 'Customer');
    const nameLengthCol = customer!.columns.find((c) => c.propName === 'nameLength');
    // MikroORM applies NamingStrategy to formula properties too: nameLength → name_length
    expect(nameLengthCol!.fieldName).toBe('name_length');
  });

  it('uses a visible fallback when formula resolution fails', () => {
    const meta = Object.assign({} as EntityMetadata, {
      className: 'Report',
      tableName: 'report',
      properties: {
        brokenFormula: {
          name: 'brokenFormula',
          fieldNames: ['broken_formula'],
          type: 'integer',
          kind: ReferenceKind.SCALAR,
          formula: () => {
            throw new Error('Cannot resolve formula');
          },
        },
      },
    });

    const model = buildDiagramModel([meta]);
    const report = model.entities.find((e) => e.className === 'Report');
    const brokenFormula = report!.columns.find((c) => c.propName === 'brokenFormula');

    expect(brokenFormula!.formula).toBe('<unresolved>');
    expect(renderErDiagram(model)).toContain('integer broken_formula "formula: <unresolved>"');
  });
});

describe('buildDiagramModel — STI (Single Table Inheritance)', () => {
  async function getModel(): Promise<DiagramModel> {
    const { metas } = await loadEntityMetadata(config);
    return buildDiagramModel(metas);
  }

  it('STI root (Animal) has discriminatorColumn set', async () => {
    const model = await getModel();
    const animal = model.entities.find((e) => e.className === 'Animal');
    expect(animal).toBeDefined();
    expect(animal!.discriminatorColumn).toBe('type');
  });

  it('STI root (Animal) excludes child-only columns (breed, indoor)', async () => {
    const model = await getModel();
    const animal = model.entities.find((e) => e.className === 'Animal');
    const colNames = animal!.columns.map((c) => c.propName);
    expect(colNames).not.toContain('breed');
    expect(colNames).not.toContain('indoor');
    // but contains its own columns
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('type');
  });

  it('STI root discriminator column is marked as isDiscriminator', async () => {
    const model = await getModel();
    const animal = model.entities.find((e) => e.className === 'Animal');
    const typeCol = animal!.columns.find((c) => c.propName === 'type');
    expect(typeCol).toBeDefined();
    expect(typeCol!.isDiscriminator).toBe(true);
  });

  it('STI child (Dog) has extendsEntity pointing to Animal', async () => {
    const model = await getModel();
    const dog = model.entities.find((e) => e.className === 'Dog');
    expect(dog).toBeDefined();
    expect(dog!.extendsEntity).toBe('Animal');
  });

  it('STI child (Dog) includes all columns (own + inherited)', async () => {
    const model = await getModel();
    const dog = model.entities.find((e) => e.className === 'Dog');
    const colNames = dog!.columns.map((c) => c.propName);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('breed');
  });

  it('STI entities produce no extends edges', async () => {
    const model = await getModel();
    const extendsEdge = model.relations.find((r) => r.label === 'extends');
    expect(extendsEdge).toBeUndefined();
  });
});

describe('buildDiagramModel — Constraints', () => {
  async function getModel(): Promise<DiagramModel> {
    const { metas } = await loadEntityMetadata(config);
    return buildDiagramModel(metas);
  }

  it('Animal entity has index constraint collected', async () => {
    const model = await getModel();
    const animal = model.entities.find((e) => e.className === 'Animal');
    const indexConstraint = animal!.constraints.find((c) => c.type === 'index');
    expect(indexConstraint).toBeDefined();
    expect(indexConstraint!.name).toBe('animal_name_idx');
    expect(indexConstraint!.properties).toContain('name');
  });
});

describe('buildDiagramModel — composite foreign keys', () => {
  it('expands every FK fieldName and preserves referenced PK types', () => {
    const tenantMeta = Object.assign({} as EntityMetadata, {
      className: 'TenantAccount',
      tableName: 'tenant_account',
      primaryKeys: ['regionCode', 'accountId'],
      properties: {
        regionCode: {
          name: 'regionCode',
          fieldNames: ['region_code'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
          primary: true,
        },
        accountId: {
          name: 'accountId',
          fieldNames: ['account_id'],
          type: 'integer',
          kind: ReferenceKind.SCALAR,
          primary: true,
        },
      },
    });
    const auditLogMeta = Object.assign({} as EntityMetadata, {
      className: 'AuditLog',
      tableName: 'audit_log',
      properties: {
        tenant: {
          name: 'tenant',
          type: 'TenantAccount',
          kind: ReferenceKind.MANY_TO_ONE,
          fieldNames: ['tenant_region_code', 'tenant_account_id'],
          referencedColumnNames: ['region_code', 'account_id'],
          primary: true,
          nullable: false,
        },
      },
    });

    const model = buildDiagramModel([tenantMeta, auditLogMeta]);
    const auditLog = model.entities.find((entity) => entity.className === 'AuditLog');

    expect(auditLog?.columns).toEqual([
      expect.objectContaining({
        propName: 'tenant',
        fieldName: 'tenant_region_code',
        type: 'string',
        isPrimary: true,
        isForeignKey: true,
      }),
      expect.objectContaining({
        propName: 'tenant',
        fieldName: 'tenant_account_id',
        type: 'integer',
        isPrimary: true,
        isForeignKey: true,
      }),
    ]);

    expect(renderErDiagram(model)).toContain('string tenant_region_code PK');
    expect(renderErDiagram(model)).toContain('integer tenant_account_id PK');
  });
});

describe('renderErDiagram — M3 rendering', () => {
  function makeCol(overrides: Partial<ColumnModel> = {}): ColumnModel {
    return {
      propName: 'field',
      fieldName: 'field',
      type: 'string',
      isPrimary: false,
      isForeignKey: false,
      isUnique: false,
      isNullable: false,
      ...overrides,
    };
  }

  it('renders formula column with "formula: <expr>" comment', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'Customer',
          tableName: 'customer',
          columns: [
            makeCol({
              propName: 'nameLength',
              fieldName: 'nameLength',
              type: 'integer',
              formula: 'LENGTH(name)',
            }),
          ],
          isPivot: false,
          isEmbeddable: false,
          constraints: [],
        },
      ],
      relations: [],
    };
    expect(renderErDiagram(model)).toContain('integer nameLength "formula: LENGTH(name)"');
  });

  it('renders discriminator column with "discriminator" comment', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'Animal',
          tableName: 'animal',
          columns: [makeCol({ propName: 'type', fieldName: 'type', type: 'string', isDiscriminator: true })],
          isPivot: false,
          isEmbeddable: false,
          discriminatorColumn: 'type',
          constraints: [],
        },
      ],
      relations: [],
    };
    expect(renderErDiagram(model)).toContain('string type "discriminator"');
  });

  it('renders embedded column with "[EmbeddableType]" comment', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'Customer',
          tableName: 'customer',
          columns: [
            makeCol({
              propName: 'address_street',
              fieldName: 'address_street',
              type: 'string',
              embeddedIn: 'Address',
            }),
          ],
          isPivot: false,
          isEmbeddable: false,
          constraints: [],
        },
      ],
      relations: [],
    };
    expect(renderErDiagram(model)).toContain('string address_street "[Address]"');
  });

  it('renders STI extends edge correctly', () => {
    const model: DiagramModel = {
      entities: [],
      relations: [
        {
          fromEntity: 'Dog',
          toEntity: 'Animal',
          fromCardinality: '||',
          toCardinality: '||',
          label: 'extends',
        },
      ],
    };
    expect(renderErDiagram(model)).toContain('Dog ||--|| Animal : "extends"');
  });
});

// ─── renderErDiagram (unit: uses manually constructed models) ─────────────────

describe('renderErDiagram', () => {
  function makeCol(overrides: Partial<ColumnModel> = {}): ColumnModel {
    return {
      propName: 'field',
      fieldName: 'field',
      type: 'string',
      isPrimary: false,
      isForeignKey: false,
      isUnique: false,
      isNullable: false,
      ...overrides,
    };
  }

  function makeEdge(overrides: Partial<RelationEdge> = {}): RelationEdge {
    return {
      fromEntity: 'A',
      toEntity: 'B',
      fromCardinality: '}o',
      toCardinality: '||',
      label: 'rel',
      ...overrides,
    };
  }

  it('starts with "erDiagram"', () => {
    const result = renderErDiagram({ entities: [], relations: [] });
    expect(result).toBe('erDiagram');
  });

  it('renders a PK column correctly', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'User',
          tableName: 'user',
          columns: [makeCol({ propName: 'id', fieldName: 'id', type: 'integer', isPrimary: true })],
          isPivot: false,
          isEmbeddable: false,
          constraints: [],
        },
      ],
      relations: [],
    };
    const result = renderErDiagram(model);
    expect(result).toContain('integer id PK');
  });

  it('renders a UK column correctly', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'User',
          tableName: 'user',
          columns: [makeCol({ fieldName: 'email', type: 'string', isUnique: true })],
          isPivot: false,
          isEmbeddable: false,
          constraints: [],
        },
      ],
      relations: [],
    };
    expect(renderErDiagram(model)).toContain('string email UK');
  });

  it('does NOT add a TS property-name comment when names differ (kept out of the diagram)', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'Post',
          tableName: 'post',
          columns: [
            makeCol({
              propName: 'author',
              fieldName: 'author_id',
              type: 'integer',
              isForeignKey: true,
            }),
          ],
          isPivot: false,
          isEmbeddable: false,
          constraints: [],
        },
      ],
      relations: [],
    };
    const result = renderErDiagram(model);
    // DB column name + FK qualifier only; the TS property name lives in the markdown table.
    expect(result).toContain('integer author_id FK');
    expect(result).not.toContain('"author"');
  });

  it('does NOT add comment when field name equals prop name', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'User',
          tableName: 'user',
          columns: [makeCol({ propName: 'name', fieldName: 'name', type: 'string' })],
          isPivot: false,
          isEmbeddable: false,
          constraints: [],
        },
      ],
      relations: [],
    };
    const result = renderErDiagram(model);
    expect(result).toContain('string name\n');
    expect(result).not.toContain('"name"');
  });

  it('renders nullable m:1 edge with o| to-cardinality', () => {
    const model: DiagramModel = {
      entities: [],
      relations: [makeEdge({ fromCardinality: '}o', toCardinality: 'o|', label: 'author' })],
    };
    expect(renderErDiagram(model)).toContain('A }o--o| B : "author"');
  });

  it('renders 1:1 edge correctly', () => {
    const model: DiagramModel = {
      entities: [],
      relations: [makeEdge({ fromCardinality: '||', toCardinality: '||', label: 'profile' })],
    };
    expect(renderErDiagram(model)).toContain('A ||--|| B : "profile"');
  });

  it('renders m:n edge correctly', () => {
    const model: DiagramModel = {
      entities: [],
      relations: [
        makeEdge({
          fromEntity: 'Post',
          toEntity: 'Tag',
          fromCardinality: '}o',
          toCardinality: 'o{',
          label: 'tags',
        }),
      ],
    };
    expect(renderErDiagram(model)).toContain('Post }o--o{ Tag : "tags"');
  });

  it('sanitizes Mermaid identifiers and escapes quoted labels/comments', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'Order Item',
          tableName: 'order_item',
          columns: [
            makeCol({
              propName: 'full"name',
              fieldName: 'full name|raw',
              type: 'string',
              formula: 'concat("first", "last")\nline',
            }),
          ],
          isPivot: false,
          isEmbeddable: false,
          constraints: [],
        },
      ],
      relations: [
        makeEdge({
          fromEntity: 'Order Item',
          toEntity: 'User Account',
          label: 'created "by"\nuser',
        }),
      ],
    };

    const result = renderErDiagram(model);

    expect(result).toContain('Order_Item {');
    expect(result).toContain('string full_name_raw "formula: concat(\\"first\\", \\"last\\") line"');
    expect(result).toContain('Order_Item }o--|| User_Account : "created \\"by\\" user"');
  });
});
