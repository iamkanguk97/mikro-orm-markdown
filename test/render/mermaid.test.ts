import { type EntityMetadata, ReferenceKind } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { loadEntityMetadata } from '../../src/metadata/load.js';
import { buildDiagramModel } from '../../src/model/diagram.js';
import type { ColumnModel, DiagramModel, RelationEdge } from '../../src/model/types.js';
import { normalizeType, renderErDiagram } from '../../src/render/mermaid.js';
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

  it('keeps the original parameterized type on the model, normalizing only at render (H4)', async () => {
    const model = await getModel();
    const author = model.entities.find((e) => e.className === 'Author');
    const nickname = author!.columns.find((c) => c.fieldName === 'nickname');

    // The model stores the raw type; normalizeType maps it to a generic type at render time.
    expect(nickname?.type).toBe('varchar(255)');
    expect(renderErDiagram(model)).toContain('string nickname');
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

  it('does not crash on a scalar with no type or an FK with no fieldNames (L4)', () => {
    const meta = Object.assign({} as EntityMetadata, {
      className: 'Loose',
      tableName: 'loose',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        // scalar with no `type`
        mystery: { name: 'mystery', fieldNames: ['mystery'], kind: ReferenceKind.SCALAR },
        // FK with no `fieldNames`
        owner: { name: 'owner', type: 'Loose', kind: ReferenceKind.MANY_TO_ONE },
      },
    });

    let model: ReturnType<typeof buildDiagramModel>;
    expect(() => {
      model = buildDiagramModel([meta]);
      renderErDiagram(model);
    }).not.toThrow();

    const cols = model!.entities[0]!.columns;
    expect(cols.find((c) => c.propName === 'mystery')!.type).toBe('unknown');
    // FK with no fieldNames falls back to `<prop>_id`.
    expect(cols.find((c) => c.propName === 'owner')!.fieldName).toBe('owner_id');
  });

  it('captures @Enum allowed values on the column (M5)', () => {
    const meta = Object.assign({} as EntityMetadata, {
      className: 'Account',
      tableName: 'account',
      properties: {
        status: {
          name: 'status',
          fieldNames: ['status'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
          enum: true,
          items: ['active', 'banned'],
        },
      },
    });

    const model = buildDiagramModel([meta]);
    const status = model.entities[0]!.columns.find((c) => c.propName === 'status');
    expect(status!.enumItems).toEqual(['active', 'banned']);
  });

  it('coerces a non-string formula return value to a string (M4)', () => {
    const meta = Object.assign({} as EntityMetadata, {
      className: 'Rep',
      tableName: 'rep',
      properties: {
        score: {
          name: 'score',
          fieldNames: ['score'],
          type: 'integer',
          kind: ReferenceKind.SCALAR,
          // misbehaving formula that returns a number instead of a SQL string
          formula: () => 42 as unknown as string,
        },
      },
    });

    const model = buildDiagramModel([meta]);
    const score = model.entities[0]!.columns.find((c) => c.propName === 'score');

    expect(score!.formula).toBe('42');
    // Downstream string handling (markdown inline code) must not crash.
    expect(() => renderErDiagram(model)).not.toThrow();
  });
});

describe('buildDiagramModel — self-reference', () => {
  function makeSelfReferencingManyToOne(): EntityMetadata {
    return Object.assign({} as EntityMetadata, {
      className: 'Employee',
      tableName: 'employee',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        manager: {
          name: 'manager',
          type: 'Employee',
          kind: ReferenceKind.MANY_TO_ONE,
          fieldNames: ['manager_id'],
          nullable: true,
        },
      },
    });
  }

  function makeSelfReferencingOneToOne(): EntityMetadata {
    return Object.assign({} as EntityMetadata, {
      className: 'Node',
      tableName: 'node',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        twin: {
          name: 'twin',
          type: 'Node',
          kind: ReferenceKind.ONE_TO_ONE,
          owner: true,
          fieldNames: ['twin_id'],
          unique: true,
          nullable: true,
        },
      },
    });
  }

  it('self-referencing m:1 produces no relation edge, only a "self-ref" column comment', () => {
    const model = buildDiagramModel([makeSelfReferencingManyToOne()]);

    expect(model.relations).toHaveLength(0);
    const managerCol = model.entities[0]!.columns.find((c) => c.propName === 'manager');
    expect(managerCol!.isSelfReference).toBe(true);
    expect(renderErDiagram(model)).toContain('integer manager_id "self-ref"');
  });

  it('self-referencing 1:1 produces no relation edge, only a "self-ref" column comment', () => {
    const model = buildDiagramModel([makeSelfReferencingOneToOne()]);

    expect(model.relations).toHaveLength(0);
    const twinCol = model.entities[0]!.columns.find((c) => c.propName === 'twin');
    expect(twinCol!.isSelfReference).toBe(true);
    const result = renderErDiagram(model);
    expect(result).toContain('integer twin_id UK "self-ref"');
    expect(result).not.toContain('Node ||');
  });

  it('non-self-referencing 1:1 still produces a relation edge as before', () => {
    const userMeta = Object.assign({} as EntityMetadata, {
      className: 'User',
      tableName: 'user',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        profile: {
          name: 'profile',
          type: 'Profile',
          kind: ReferenceKind.ONE_TO_ONE,
          owner: true,
          fieldNames: ['profile_id'],
          unique: true,
          nullable: false,
        },
      },
    });
    const profileMeta = Object.assign({} as EntityMetadata, {
      className: 'Profile',
      tableName: 'profile',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
      },
    });

    const model = buildDiagramModel([userMeta, profileMeta]);

    expect(model.relations).toHaveLength(1);
    expect(model.relations[0]).toMatchObject({
      fromEntity: 'User',
      toEntity: 'Profile',
      fromCardinality: '||',
      toCardinality: '||',
      label: 'profile',
    });
    expect(renderErDiagram(model)).toContain('User ||--|| Profile : "profile"');
  });
});

describe('buildDiagramModel — persist: false (shadow properties)', () => {
  it('excludes a shadow property (persist: false, no formula) from the columns', () => {
    const meta = Object.assign({} as EntityMetadata, {
      className: 'User',
      tableName: 'user',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        email: { name: 'email', fieldNames: ['email'], type: 'string', kind: ReferenceKind.SCALAR },
        // Shadow property: exists on the entity, but MikroORM never persists it.
        fullNameCache: {
          name: 'fullNameCache',
          fieldNames: ['full_name_cache'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
          persist: false,
        },
      },
    });

    const model = buildDiagramModel([meta]);
    const user = model.entities.find((e) => e.className === 'User')!;

    const fieldNames = user.columns.map((c) => c.fieldName);
    expect(fieldNames).toEqual(['id', 'email']);
    expect(fieldNames).not.toContain('full_name_cache');
  });

  it('still renders an @Formula column even though it is also persist: false', () => {
    // @Formula properties are persist: false internally too, but they are a real,
    // documented feature (a SELECT-time expression) and must keep rendering.
    const meta = Object.assign({} as EntityMetadata, {
      className: 'Customer',
      tableName: 'customer',
      properties: {
        nameLength: {
          name: 'nameLength',
          fieldNames: ['name_length'],
          type: 'integer',
          kind: ReferenceKind.SCALAR,
          persist: false,
          formula: () => 'LENGTH(name)',
        },
      },
    });

    const model = buildDiagramModel([meta]);
    const customer = model.entities.find((e) => e.className === 'Customer')!;
    const nameLengthCol = customer.columns.find((c) => c.propName === 'nameLength');

    expect(nameLengthCol).toBeDefined();
    expect(nameLengthCol!.formula).toBe('LENGTH(name)');
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

  it('uses DB field names for index and unique constraint properties', () => {
    const meta = Object.assign({} as EntityMetadata, {
      className: 'Invoice',
      tableName: 'invoice',
      indexes: [{ name: 'invoice_issued_at_idx', properties: ['issuedAt'] }],
      uniques: [{ name: 'invoice_reference_uq', properties: ['externalReference'] }],
      properties: {
        issuedAt: {
          name: 'issuedAt',
          fieldNames: ['issued_at'],
          type: 'datetime',
          kind: ReferenceKind.SCALAR,
        },
        externalReference: {
          name: 'externalReference',
          fieldNames: ['external_reference'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
        },
      },
    });

    const model = buildDiagramModel([meta]);
    const invoice = model.entities.find((e) => e.className === 'Invoice')!;

    expect(invoice.constraints.find((c) => c.name === 'invoice_issued_at_idx')?.properties).toEqual(['issued_at']);
    expect(invoice.constraints.find((c) => c.name === 'invoice_reference_uq')?.properties).toEqual([
      'external_reference',
    ]);
  });
});

describe('buildDiagramModel — non-abstract STI root (M1)', () => {
  // A non-abstract STI root is assigned its own discriminatorValue by MikroORM,
  // and its property list includes the child-only columns marked inherited=true.
  function makeNonAbstractStiRoot(): EntityMetadata {
    return Object.assign({} as EntityMetadata, {
      className: 'Vehicle',
      tableName: 'vehicle',
      discriminatorColumn: 'type',
      discriminatorValue: 'vehicle',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        name: { name: 'name', fieldNames: ['name'], type: 'string', kind: ReferenceKind.SCALAR },
        type: { name: 'type', fieldNames: ['type'], type: 'string', kind: ReferenceKind.SCALAR },
        // child-only column that MikroORM surfaces on the root as inherited
        doors: { name: 'doors', fieldNames: ['doors'], type: 'string', kind: ReferenceKind.SCALAR, inherited: true },
      },
    });
  }

  it('marks the root as an STI root and excludes inherited child columns', () => {
    const model = buildDiagramModel([makeNonAbstractStiRoot()]);
    const root = model.entities.find((e) => e.className === 'Vehicle')!;

    expect(root.discriminatorColumn).toBe('type');
    const fieldNames = root.columns.map((c) => c.fieldName);
    expect(fieldNames).toEqual(['id', 'name', 'type']);
    expect(fieldNames).not.toContain('doors');
  });
});

describe('buildDiagramModel — object/array embedded as single JSON column (M2)', () => {
  function makeOrgWithObjectEmbeddeds(): EntityMetadata {
    return Object.assign({} as EntityMetadata, {
      className: 'Org',
      tableName: 'org',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
        // object embedded → single JSON column "addr"
        addr: { name: 'addr', fieldNames: ['addr'], type: 'Addr', kind: ReferenceKind.EMBEDDED, object: true },
        'addr~street': {
          name: 'addr~street',
          fieldNames: ['street'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
          object: true,
          embedded: ['addr', 'street'],
        },
        'addr~city': {
          name: 'addr~city',
          fieldNames: ['city'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
          object: true,
          embedded: ['addr', 'city'],
        },
        // array embedded → single JSON column "history"
        history: {
          name: 'history',
          fieldNames: ['history'],
          type: 'Addr',
          kind: ReferenceKind.EMBEDDED,
          object: true,
          array: true,
        },
      },
    });
  }

  it('renders one JSON column per object/array embedded and drops the leaf fields', () => {
    const model = buildDiagramModel([makeOrgWithObjectEmbeddeds()]);
    const org = model.entities.find((e) => e.className === 'Org')!;

    expect(org.columns.map((c) => c.fieldName)).toEqual(['id', 'addr', 'history']);

    const addr = org.columns.find((c) => c.fieldName === 'addr')!;
    expect(addr.type).toBe('json');
    expect(addr.embeddedIn).toBe('Addr');

    const history = org.columns.find((c) => c.fieldName === 'history')!;
    expect(history.type).toBe('json');
    expect(history.embeddedIn).toBe('Addr[]');
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

describe('buildDiagramModel — FK-as-PK chain (supertype-subtype)', () => {
  it('resolves the scalar type through a two-level FK-as-PK chain', () => {
    // EntityA: id uuid (scalar PK)
    // EntityB: id PK+FK → EntityA  (B's PK is A's class name until resolved)
    // EntityC: id PK+FK → EntityB  (C should ultimately resolve to uuid, not 'EntityB')
    const entityA = Object.assign({} as EntityMetadata, {
      className: 'EntityA',
      tableName: 'entity_a',
      primaryKeys: ['id'],
      properties: {
        id: { name: 'id', fieldNames: ['id'], type: 'uuid', kind: ReferenceKind.SCALAR, primary: true },
      },
    });
    const entityB = Object.assign({} as EntityMetadata, {
      className: 'EntityB',
      tableName: 'entity_b',
      properties: {
        entityA: {
          name: 'entityA',
          fieldNames: ['id'],
          type: 'EntityA',
          kind: ReferenceKind.ONE_TO_ONE,
          owner: true,
          primary: true,
          nullable: false,
        },
      },
    });
    const entityC = Object.assign({} as EntityMetadata, {
      className: 'EntityC',
      tableName: 'entity_c',
      properties: {
        entityB: {
          name: 'entityB',
          fieldNames: ['id'],
          type: 'EntityB',
          kind: ReferenceKind.ONE_TO_ONE,
          owner: true,
          primary: true,
          nullable: false,
        },
      },
    });

    const model = buildDiagramModel([entityA, entityB, entityC]);

    const cEntity = model.entities.find((e) => e.className === 'EntityC')!;
    expect(cEntity.columns.find((c) => c.fieldName === 'id')?.type).toBe('uuid');

    const bEntity = model.entities.find((e) => e.className === 'EntityB')!;
    expect(bEntity.columns.find((c) => c.fieldName === 'id')?.type).toBe('uuid');
  });
});

describe('buildDiagramModel — composite FK-as-PK chain', () => {
  it('preserves composite key column type alignment through a FK-as-PK chain', () => {
    // A has composite PK (id1: uuid, id2: integer).
    // B's composite PK is FK-as-PK to A — B.b1 → A.id1, B.b2 → A.id2.
    // resolveFkTypes for B must return [uuid, integer] in order, not [uuid, uuid].
    const entityA = Object.assign({} as EntityMetadata, {
      className: 'EntityA',
      tableName: 'entity_a',
      primaryKeys: ['id1', 'id2'],
      properties: {
        id1: { name: 'id1', fieldNames: ['id1'], type: 'uuid', kind: ReferenceKind.SCALAR, primary: true },
        id2: { name: 'id2', fieldNames: ['id2'], type: 'integer', kind: ReferenceKind.SCALAR, primary: true },
      },
    });
    const entityB = Object.assign({} as EntityMetadata, {
      className: 'EntityB',
      tableName: 'entity_b',
      properties: {
        rel: {
          name: 'rel',
          type: 'EntityA',
          kind: ReferenceKind.MANY_TO_ONE,
          fieldNames: ['b1', 'b2'],
          referencedColumnNames: ['id1', 'id2'],
          primary: true,
          nullable: false,
        },
      },
    });

    const model = buildDiagramModel([entityA, entityB]);
    const bEntity = model.entities.find((e) => e.className === 'EntityB')!;

    const b1 = bEntity.columns.find((c) => c.fieldName === 'b1')!;
    const b2 = bEntity.columns.find((c) => c.fieldName === 'b2')!;
    expect(b1.type).toBe('uuid');
    expect(b2.type).toBe('integer');
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
    // DB column name only; FK qualifier is omitted (relationship lines convey FK relationships).
    // The TS property name lives in the markdown table, not the diagram.
    expect(result).toContain('integer author_id');
    expect(result).not.toContain('author_id FK');
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

// ─── renderErDiagram — Mermaid frontmatter ────────────────────────────────────

describe('renderErDiagram — Mermaid frontmatter', () => {
  const emptyModel: DiagramModel = { entities: [], relations: [] };

  it('emits no frontmatter when no options are provided', () => {
    expect(renderErDiagram(emptyModel)).toBe('erDiagram');
  });

  it('emits no frontmatter when an empty options object is provided', () => {
    expect(renderErDiagram(emptyModel, {})).toBe('erDiagram');
  });

  it('emits layout frontmatter when layout is set', () => {
    const result = renderErDiagram(emptyModel, { layout: 'elk' });
    expect(result).toBe('---\nconfig:\n  layout: elk\n---\nerDiagram');
  });

  it('emits theme frontmatter when theme is set', () => {
    const result = renderErDiagram(emptyModel, { theme: 'forest' });
    expect(result).toBe('---\nconfig:\n  theme: forest\n---\nerDiagram');
  });

  it('emits both layout and theme frontmatter when both are set', () => {
    const result = renderErDiagram(emptyModel, { layout: 'elk', theme: 'forest' });
    expect(result).toBe('---\nconfig:\n  layout: elk\n  theme: forest\n---\nerDiagram');
  });

  it('frontmatter precedes erDiagram body content', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'User',
          tableName: 'user',
          columns: [
            {
              propName: 'id',
              fieldName: 'id',
              type: 'integer',
              isPrimary: true,
              isForeignKey: false,
              isUnique: false,
              isNullable: false,
            },
          ],
          isPivot: false,
          isEmbeddable: false,
          constraints: [],
        },
      ],
      relations: [],
    };
    const result = renderErDiagram(model, { layout: 'dagre' });
    const lines = result.split('\n');
    expect(lines[0]).toBe('---');
    expect(lines).toContain('erDiagram');
    const erdIndex = lines.indexOf('erDiagram');
    const dashIndex = lines.lastIndexOf('---');
    expect(dashIndex).toBeLessThan(erdIndex);
  });

  it('entity body appears after frontmatter and erDiagram when both are present', () => {
    const model: DiagramModel = {
      entities: [
        {
          className: 'User',
          tableName: 'user',
          columns: [
            {
              propName: 'id',
              fieldName: 'id',
              type: 'integer',
              isPrimary: true,
              isForeignKey: false,
              isUnique: false,
              isNullable: false,
            },
          ],
          isPivot: false,
          isEmbeddable: false,
          constraints: [],
        },
      ],
      relations: [],
    };
    const result = renderErDiagram(model, { layout: 'elk', theme: 'neutral' });
    expect(result).toContain('---\nconfig:\n  layout: elk\n  theme: neutral\n---\nerDiagram');
    expect(result).toContain('User {');
  });
});

// ─── normalizeType ────────────────────────────────────────────────────────────

describe('normalizeType', () => {
  it.each([
    ['varchar(255)', 'string'],
    ['character varying', 'string'],
    ['character varying(255)', 'string'],
    ['character', 'string'],
    ['character(36)', 'string'],
    ['char(36)', 'string'],
    ['tinytext', 'string'],
    ['mediumtext', 'string'],
    ['longtext', 'string'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeType(input)).toBe(expected);
  });

  it.each([
    ['numeric', 'float'],
    ['numeric(10,2)', 'float'],
    ['decimal(10,2)', 'float'],
    ['double(8,2)', 'float'],
    ['float(8,2)', 'float'],
    ['real', 'float'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeType(input)).toBe(expected);
  });

  it.each([
    ['tinyint', 'integer'],
    ['tinyint(4)', 'integer'],
    ['mediumint', 'integer'],
    ['smallint unsigned', 'integer'],
    ['int unsigned', 'integer'],
    ['bigint(20) unsigned', 'integer'],
    ['serial', 'integer'],
    ['bigserial', 'integer'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeType(input)).toBe(expected);
  });

  it.each([
    ['datetime(3)', 'datetime'],
    ['timestamp(6)', 'datetime'],
    ['timestamptz(6)', 'datetime'],
  ])('normalizes parameterized %s to %s', (input, expected) => {
    expect(normalizeType(input)).toBe(expected);
  });

  it('normalizes the MySQL boolean declaration tinyint(1) to boolean, unlike other tinyint widths', () => {
    expect(normalizeType('tinyint(1)')).toBe('boolean');
    expect(normalizeType('tinyint (1)')).toBe('boolean');
    expect(normalizeType(' TINYINT ( 1 ) ')).toBe('boolean');
    expect(normalizeType('tinyint(2)')).toBe('integer');
  });

  it('does not confuse interval with the int family', () => {
    expect(normalizeType('interval')).toBe('interval');
    expect(normalizeType('interval(6)')).toBe('interval(6)');
  });

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(normalizeType(' CHARACTER VARYING(255) ')).toBe('string');
    expect(normalizeType('DECIMAL(10,2)')).toBe('float');
  });

  it.each([
    ['uuid', 'string'],
    ['text', 'string'],
    ['string', 'string'],
    ['timestamptz', 'datetime'],
    ['timestamp', 'datetime'],
    ['datetime', 'datetime'],
    ['integer', 'integer'],
    ['int', 'integer'],
    ['bigint', 'integer'],
    ['smallint', 'integer'],
    ['DoubleType', 'float'],
    ['double precision', 'float'],
    ['double', 'float'],
    ['float', 'float'],
    ['decimal', 'float'],
    ['boolean', 'boolean'],
    ['bool', 'boolean'],
    ['jsonb', 'json'],
  ])('keeps existing mapping of %s to %s', (input, expected) => {
    expect(normalizeType(input)).toBe(expected);
  });

  it.each([
    'bytea',
    'blob',
    'geometry',
    "enum('a','b')",
    'text[]',
    'unknown',
  ])('passes unrecognized type %s through unchanged', (input) => {
    expect(normalizeType(input)).toBe(input);
  });
});
