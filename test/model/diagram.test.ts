import { type EntityMetadata, type FormulaTable, type IndexCallback, ReferenceKind } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { buildDiagramModel } from '../../src/model/diagram.js';
import type { EntityModel } from '../../src/model/types.js';
import { renderErDiagram } from '../../src/render/mermaid.js';
import { makeEntityMeta, makeSimpleEntityMeta, pkProperty } from '../helpers/entity-meta.js';
import { getFixtureDiagramModel } from '../helpers/pipeline.js';

// ─── buildDiagramModel (integration: uses real MikroORM metadata) ─────────────

describe('buildDiagramModel', () => {
  it('excludes pivot tables from entity boxes', async () => {
    const model = await getFixtureDiagramModel();
    const classNames = model.entities.map((e) => e.className);
    expect(classNames).not.toContain('post_tags');
    expect(classNames).toContain('Author');
    expect(classNames).toContain('Post');
    expect(classNames).toContain('Tag');
  });

  it('Author entity has correct columns', async () => {
    const model = await getFixtureDiagramModel();
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
    const model = await getFixtureDiagramModel();
    const post = model.entities.find((e) => e.className === 'Post');
    expect(post).toBeDefined();

    const fkCol = post!.columns.find((c) => c.isForeignKey);
    expect(fkCol).toBeDefined();
    // DB column name is author_id, TS property name is author
    expect(fkCol!.fieldName).toBe('author_id');
    expect(fkCol!.propName).toBe('author');
  });

  it('keeps the original parameterized type on the model, normalizing only at render (H4)', async () => {
    const model = await getFixtureDiagramModel();
    const author = model.entities.find((e) => e.className === 'Author');
    const nickname = author!.columns.find((c) => c.fieldName === 'nickname');

    // The model stores the raw type; normalizeType maps it to a generic type at render time.
    expect(nickname?.type).toBe('varchar(255)');
    expect(renderErDiagram(model)).toContain('string nickname');
  });

  it('Post m:n tags property does NOT produce a column', async () => {
    const model = await getFixtureDiagramModel();
    const post = model.entities.find((e) => e.className === 'Post');
    const tagCol = post!.columns.find((c) => c.propName === 'tags');
    expect(tagCol).toBeUndefined();
  });

  it('produces 2 relation edges (Post m:1, Post m:n)', async () => {
    const model = await getFixtureDiagramModel();
    // Post.author (m:1), Post.tags (m:n owner)
    expect(model.relations).toHaveLength(2);
  });

  it('Post.author edge: many Posts → one Author (not nullable)', async () => {
    const model = await getFixtureDiagramModel();
    const edge = model.relations.find((r) => r.fromEntity === 'Post' && r.toEntity === 'Author');
    expect(edge).toBeDefined();
    expect(edge!.fromCardinality).toBe('}o');
    expect(edge!.toCardinality).toBe('||');
    expect(edge!.label).toBe('author');
  });

  it('Post.tags edge: many Posts ↔ many Tags', async () => {
    const model = await getFixtureDiagramModel();
    const edge = model.relations.find((r) => r.fromEntity === 'Post' && r.toEntity === 'Tag');
    expect(edge).toBeDefined();
    expect(edge!.fromCardinality).toBe('}o');
    expect(edge!.toCardinality).toBe('o{');
  });

  it('does not crash on a scalar with no type or an FK with no fieldNames (L4)', () => {
    const meta = makeEntityMeta({
      className: 'Loose',
      tableName: 'loose',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
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
    const meta = makeEntityMeta({
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
});

// ─── buildDiagramModel — M3 MikroORM-specific concepts ───────────────────────

describe('buildDiagramModel — Embeddable', () => {
  it('excludes @Embeddable classes from entity boxes', async () => {
    const model = await getFixtureDiagramModel();
    const classNames = model.entities.map((e) => e.className);
    expect(classNames).not.toContain('Address');
    expect(classNames).toContain('Customer');
  });

  it('Customer entity contains flattened embedded columns with embeddedIn set', async () => {
    const model = await getFixtureDiagramModel();
    const customer = model.entities.find((e) => e.className === 'Customer');
    expect(customer).toBeDefined();

    const embeddedCols = customer!.columns.filter((c) => c.embeddedIn === 'Address');
    const fieldNames = embeddedCols.map((c) => c.fieldName);
    expect(fieldNames).toContain('address_street');
    expect(fieldNames).toContain('address_city');
    expect(fieldNames).toContain('address_zip_code');
  });

  it('Customer embedded columns are NOT marked as PK/FK', async () => {
    const model = await getFixtureDiagramModel();
    const customer = model.entities.find((e) => e.className === 'Customer');
    const embeddedCols = customer!.columns.filter((c) => c.embeddedIn !== undefined);
    for (const col of embeddedCols) {
      expect(col.isPrimary).toBe(false);
      expect(col.isForeignKey).toBe(false);
    }
  });

  it('EMBEDDED group reference property is not rendered as a column', async () => {
    const model = await getFixtureDiagramModel();
    const customer = model.entities.find((e) => e.className === 'Customer');
    // "address" (kind=embedded) should not appear as a direct column
    const addressGroupCol = customer!.columns.find((c) => c.fieldName === 'address');
    expect(addressGroupCol).toBeUndefined();
  });
});

describe('buildDiagramModel — @Formula', () => {
  it('Customer nameLength column has formula set', async () => {
    const model = await getFixtureDiagramModel();
    const customer = model.entities.find((e) => e.className === 'Customer');
    const nameLengthCol = customer!.columns.find((c) => c.propName === 'nameLength');
    expect(nameLengthCol).toBeDefined();
    expect(nameLengthCol!.formula).toBeDefined();
  });

  it('formula column SQL expression is resolved correctly', async () => {
    const model = await getFixtureDiagramModel();
    const customer = model.entities.find((e) => e.className === 'Customer');
    const nameLengthCol = customer!.columns.find((c) => c.propName === 'nameLength');
    // @Formula('LENGTH(name)') → should resolve to the SQL expression
    expect(nameLengthCol!.formula).toBe('LENGTH(name)');
  });

  it('formula column fieldName follows NamingStrategy (camelCase → snake_case)', async () => {
    const model = await getFixtureDiagramModel();
    const customer = model.entities.find((e) => e.className === 'Customer');
    const nameLengthCol = customer!.columns.find((c) => c.propName === 'nameLength');
    // MikroORM applies NamingStrategy to formula properties too: nameLength → name_length
    expect(nameLengthCol!.fieldName).toBe('name_length');
  });

  it('resolves formula callbacks with physical table, schema, and column metadata', () => {
    const meta = makeEntityMeta({
      className: 'SalesOrder',
      tableName: 'sales_order',
      schema: 'billing',
      properties: {
        grossTotal: {
          name: 'grossTotal',
          fieldNames: ['gross_total', 'currency_code'],
          type: 'decimal',
          kind: ReferenceKind.SCALAR,
        },
        displayTotal: {
          name: 'displayTotal',
          fieldNames: ['display_total'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
          formula: (table: FormulaTable, columns: Record<string, string>) =>
            `${table.name}.${columns.grossTotal}|${table.schema}|${table.qualifiedName}|${table.alias}|${String(table)}`,
        },
      },
    });

    const model = buildDiagramModel([meta]);
    const displayTotal = model.entities[0]!.columns.find((column) => column.propName === 'displayTotal');

    expect(displayTotal!.formula).toBe('sales_order.gross_total|billing|billing.sales_order|e0|e0');
  });

  it('keeps a dynamic wildcard schema out of the qualified table name', () => {
    const meta = makeEntityMeta({
      className: 'TenantRecord',
      tableName: 'tenant_record',
      schema: '*',
      properties: {
        computed: {
          name: 'computed',
          fieldNames: ['computed'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
          formula: (table: FormulaTable) => `${table.schema}|${table.qualifiedName}`,
        },
      },
    });

    const model = buildDiagramModel([meta]);
    const computed = model.entities[0]!.columns.find((column) => column.propName === 'computed');

    expect(computed!.formula).toBe('undefined|tenant_record');
  });

  it('uses a visible fallback when formula resolution fails', () => {
    const meta = makeEntityMeta({
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

  it('coerces a non-string formula return value to a string (M4)', () => {
    const meta = makeEntityMeta({
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
    return makeEntityMeta({
      className: 'Employee',
      tableName: 'employee',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
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
    return makeEntityMeta({
      className: 'Node',
      tableName: 'node',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
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

  it('non-null owning 1:1 keeps inverse participation optional', () => {
    const userMeta = makeEntityMeta({
      className: 'User',
      tableName: 'user',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
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
    const profileMeta = makeEntityMeta({
      className: 'Profile',
      tableName: 'profile',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
      },
    });

    const model = buildDiagramModel([userMeta, profileMeta]);

    expect(model.relations).toHaveLength(1);
    expect(model.relations[0]).toMatchObject({
      fromEntity: 'User',
      toEntity: 'Profile',
      fromCardinality: 'o|',
      toCardinality: '||',
      label: 'profile',
    });
    expect(renderErDiagram(model)).toContain('User o|--|| Profile : "profile"');
  });

  it('nullable owning 1:1 keeps both inverse participation and target optional', () => {
    const userMeta = makeEntityMeta({
      className: 'User',
      tableName: 'user',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
        profile: {
          name: 'profile',
          type: 'Profile',
          kind: ReferenceKind.ONE_TO_ONE,
          owner: true,
          fieldNames: ['profile_id'],
          unique: true,
          nullable: true,
        },
      },
    });
    const profileMeta = makeEntityMeta({
      className: 'Profile',
      tableName: 'profile',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
      },
    });

    const model = buildDiagramModel([userMeta, profileMeta]);

    expect(model.relations).toHaveLength(1);
    expect(model.relations[0]).toMatchObject({
      fromEntity: 'User',
      toEntity: 'Profile',
      fromCardinality: 'o|',
      toCardinality: 'o|',
      label: 'profile',
    });
    expect(renderErDiagram(model)).toContain('User o|--o| Profile : "profile"');
  });
});

describe('buildDiagramModel — persist: false (shadow properties)', () => {
  it('excludes a shadow property (persist: false, no formula) from the columns', () => {
    const meta = makeEntityMeta({
      className: 'User',
      tableName: 'user',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
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
    const meta = makeEntityMeta({
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
  it('STI root (Animal) has discriminatorColumn set', async () => {
    const model = await getFixtureDiagramModel();
    const animal = model.entities.find((e) => e.className === 'Animal');
    expect(animal).toBeDefined();
    expect(animal!.discriminatorColumn).toBe('type');
  });

  it('STI root (Animal) excludes child-only columns (breed, indoor)', async () => {
    const model = await getFixtureDiagramModel();
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
    const model = await getFixtureDiagramModel();
    const animal = model.entities.find((e) => e.className === 'Animal');
    const typeCol = animal!.columns.find((c) => c.propName === 'type');
    expect(typeCol).toBeDefined();
    expect(typeCol!.isDiscriminator).toBe(true);
  });

  it('STI child (Dog) has extendsEntity pointing to Animal', async () => {
    const model = await getFixtureDiagramModel();
    const dog = model.entities.find((e) => e.className === 'Dog');
    expect(dog).toBeDefined();
    expect(dog!.extendsEntity).toBe('Animal');
  });

  it('STI child (Dog) includes all columns (own + inherited)', async () => {
    const model = await getFixtureDiagramModel();
    const dog = model.entities.find((e) => e.className === 'Dog');
    const colNames = dog!.columns.map((c) => c.propName);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('breed');
  });

  it('STI entities produce no extends edges', async () => {
    const model = await getFixtureDiagramModel();
    const extendsEdge = model.relations.find((r) => r.label === 'extends');
    expect(extendsEdge).toBeUndefined();
  });

  // MikroORM v6 stores the ancestor's class name in `meta.extends`, v7 the
  // ancestor class itself. An unnormalized class leaks into extendsEntity and
  // crashes the markdown renderer on `value.replace`.
  it('resolves extendsEntity to a class name when metadata carries the ancestor class', () => {
    class Animal {}
    const model = buildDiagramModel([
      makeEntityMeta({
        className: 'Animal',
        tableName: 'animals',
        discriminatorColumn: 'type',
        primaryKeys: ['id'],
        properties: { id: pkProperty() },
      }),
      makeEntityMeta({
        className: 'Dog',
        tableName: 'animals',
        extends: Animal,
        discriminatorValue: 'dog',
        primaryKeys: ['id'],
        properties: { id: pkProperty() },
      }),
    ]);

    expect(model.entities.find((e) => e.className === 'Dog')?.extendsEntity).toBe('Animal');
    // The root must still read as a root, not as its own child.
    expect(model.entities.find((e) => e.className === 'Animal')?.discriminatorColumn).toBe('type');
  });
});

describe('buildDiagramModel — table comment', () => {
  it('copies the entity table comment into the entity model', () => {
    const model = buildDiagramModel([
      makeEntityMeta({
        className: 'Account',
        tableName: 'account',
        comment: 'Each row represents a customer account',
        primaryKeys: ['id'],
        properties: { id: pkProperty() },
      }),
    ]);

    expect(model.entities[0]?.comment).toBe('Each row represents a customer account');
  });

  it('leaves comment unset when the entity has no table comment', () => {
    const model = buildDiagramModel([makeSimpleEntityMeta('Account')]);

    expect(model.entities[0]).not.toHaveProperty('comment');
  });
});

describe('buildDiagramModel — Constraints', () => {
  function makePropertyUniqueMetas(): EntityMetadata[] {
    const account = makeEntityMeta({
      className: 'Account',
      tableName: 'account',
      primaryKeys: ['id'],
      uniques: [
        { name: 'entity_email_uq', properties: ['email'] },
        { name: 'property_email_uq', properties: ['email'] },
      ],
      properties: {
        id: pkProperty(),
        legacyCode: {
          name: 'legacyCode',
          fieldNames: ['legacy_code'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
          unique: true,
        },
        transientCode: {
          name: 'transientCode',
          fieldNames: ['transient_code'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
          persist: false,
          unique: 'transient_code_uq',
        },
        email: {
          name: 'email',
          fieldNames: ['email_address'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
          unique: 'property_email_uq',
        },
        settings: {
          name: 'settings',
          fieldNames: ['settings_json'],
          type: 'Settings',
          kind: ReferenceKind.EMBEDDED,
          object: true,
          unique: 'account_settings_uq',
        },
        organization: {
          name: 'organization',
          fieldNames: ['organization_id'],
          referencedColumnNames: ['id'],
          type: 'Organization',
          kind: ReferenceKind.MANY_TO_ONE,
          unique: 'account_org_uq',
        },
        compositeProfile: {
          name: 'compositeProfile',
          fieldNames: ['profile_tenant_id', 'profile_id'],
          referencedColumnNames: ['tenant_id', 'id'],
          type: 'CompositeProfile',
          kind: ReferenceKind.ONE_TO_ONE,
          owner: true,
          unique: 'account_profile_uq',
        },
      },
    });
    const organization = makeEntityMeta({
      className: 'Organization',
      tableName: 'organization',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
      },
    });
    const compositeProfile = makeEntityMeta({
      className: 'CompositeProfile',
      tableName: 'composite_profile',
      primaryKeys: ['tenant', 'id'],
      properties: {
        tenant: {
          name: 'tenant',
          fieldNames: ['tenant_id'],
          type: 'integer',
          kind: ReferenceKind.SCALAR,
          primary: true,
        },
        id: pkProperty(),
      },
    });

    return [account, organization, compositeProfile];
  }

  it('Animal entity has index constraint collected', async () => {
    const model = await getFixtureDiagramModel();
    const animal = model.entities.find((e) => e.className === 'Animal');
    const indexConstraint = animal!.constraints.find((c) => c.type === 'index');
    expect(indexConstraint).toBeDefined();
    expect(indexConstraint!.name).toBe('animal_name_idx');
    expect(indexConstraint!.properties).toContain('name');
  });

  it('uses DB field names for index and unique constraint properties', () => {
    const meta = makeEntityMeta({
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

  it('marks boolean and named single-field property uniques across column kinds', () => {
    const account = buildDiagramModel(makePropertyUniqueMetas()).entities.find(
      (entity) => entity.className === 'Account'
    )!;

    expect(account.columns.find((column) => column.propName === 'legacyCode')?.isUnique).toBe(true);
    expect(account.columns.find((column) => column.propName === 'email')?.isUnique).toBe(true);
    expect(account.columns.find((column) => column.propName === 'settings')?.isUnique).toBe(true);
    expect(account.columns.find((column) => column.propName === 'organization')?.isUnique).toBe(true);
    expect(account.columns.find((column) => column.propName === 'transientCode')).toBeUndefined();
    expect(
      account.columns.filter((column) => column.propName === 'compositeProfile').map((column) => column.isUnique)
    ).toEqual([false, false]);
  });

  it('preserves distinct named unique identities and deduplicates only an exact tuple', () => {
    const account = buildDiagramModel(makePropertyUniqueMetas()).entities.find(
      (entity) => entity.className === 'Account'
    )!;

    expect(account.constraints.filter((constraint) => constraint.type === 'unique')).toEqual([
      { type: 'unique', properties: ['email_address'], name: 'entity_email_uq' },
      { type: 'unique', properties: ['email_address'], name: 'property_email_uq' },
      { type: 'unique', properties: ['settings_json'], name: 'account_settings_uq' },
      { type: 'unique', properties: ['organization_id'], name: 'account_org_uq' },
      {
        type: 'unique',
        properties: ['profile_tenant_id', 'profile_id'],
        name: 'account_profile_uq',
      },
    ]);
    expect(account.constraints.some((constraint) => constraint.name === 'transient_code_uq')).toBe(false);
  });

  it('models composite owning one-to-one uniqueness as one ordered constraint', () => {
    const owner = makeEntityMeta({
      className: 'Account',
      tableName: 'account',
      uniques: [{ name: 'account_named_profile_uq', properties: ['namedProfile'] }],
      properties: {
        namedProfile: {
          name: 'namedProfile',
          fieldNames: ['named_tenant_id', 'named_profile_id'],
          referencedColumnNames: ['tenant_id', 'id'],
          type: 'CompositeProfile',
          kind: ReferenceKind.ONE_TO_ONE,
          owner: true,
          unique: 'account_named_profile_uq',
        },
        implicitProfile: {
          name: 'implicitProfile',
          fieldNames: ['implicit_tenant_id', 'implicit_profile_id'],
          referencedColumnNames: ['tenant_id', 'id'],
          type: 'CompositeProfile',
          kind: ReferenceKind.ONE_TO_ONE,
          owner: true,
          unique: true,
        },
        singleProfile: {
          name: 'singleProfile',
          fieldNames: ['single_profile_id'],
          referencedColumnNames: ['id'],
          type: 'SingleProfile',
          kind: ReferenceKind.ONE_TO_ONE,
          owner: true,
          unique: true,
        },
      },
    });
    const compositeProfile = makeEntityMeta({
      className: 'CompositeProfile',
      tableName: 'composite_profile',
      primaryKeys: ['tenant', 'id'],
      properties: {
        tenant: {
          name: 'tenant',
          fieldNames: ['tenant_id'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
          primary: true,
        },
        id: pkProperty(),
      },
    });
    const singleProfile = makeEntityMeta({
      className: 'SingleProfile',
      tableName: 'single_profile',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
      },
    });

    const account = buildDiagramModel([owner, compositeProfile, singleProfile]).entities.find(
      (entity) => entity.className === 'Account'
    )!;

    expect(
      account.columns.filter((column) => column.propName === 'namedProfile').map((column) => column.isUnique)
    ).toEqual([false, false]);
    expect(
      account.columns.filter((column) => column.propName === 'implicitProfile').map((column) => column.isUnique)
    ).toEqual([false, false]);
    expect(
      account.columns.filter((column) => column.propName === 'singleProfile').map((column) => column.isUnique)
    ).toEqual([true]);
    expect(account.constraints.filter((constraint) => constraint.type === 'unique')).toEqual([
      {
        type: 'unique',
        name: 'account_named_profile_uq',
        properties: ['named_tenant_id', 'named_profile_id'],
      },
      { type: 'unique', properties: ['implicit_tenant_id', 'implicit_profile_id'] },
    ]);
  });

  it('preserves single-field property indexes and deduplicates only an exact tuple', () => {
    const meta = makeEntityMeta({
      className: 'IndexedAccount',
      tableName: 'indexed_account',
      indexes: [
        { name: 'email_property_idx', properties: ['email'] },
        { name: 'email_entity_idx', properties: ['email'] },
        { name: 'email_entity_idx', properties: ['email'] },
        { name: 'ordered_idx', properties: ['firstOrder', 'secondOrder'] },
        { name: 'ordered_idx', properties: ['secondOrder', 'firstOrder'] },
        { expression: 'lower(email_address)' },
        { expression: 'upper(email_address)' },
      ],
      properties: {
        email: {
          name: 'email',
          fieldNames: ['email_address'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
          index: 'email_property_idx',
        },
        active: {
          name: 'active',
          fieldNames: ['is_active'],
          type: 'boolean',
          kind: ReferenceKind.SCALAR,
          index: true,
        },
        preferences: {
          name: 'preferences',
          fieldNames: ['preferences_json'],
          type: 'Preferences',
          kind: ReferenceKind.EMBEDDED,
          object: true,
          index: 'preferences_idx',
        },
        organization: {
          name: 'organization',
          fieldNames: ['organization_id'],
          type: 'Organization',
          kind: ReferenceKind.MANY_TO_ONE,
          index: 'organization_idx',
        },
        transientSearch: {
          name: 'transientSearch',
          fieldNames: ['transient_search'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
          persist: false,
          index: 'transient_search_idx',
        },
        compositeRelation: {
          name: 'compositeRelation',
          fieldNames: ['relation_tenant_id', 'relation_id'],
          type: 'CompositeTarget',
          kind: ReferenceKind.MANY_TO_ONE,
          index: 'composite_relation_idx',
        },
        firstOrder: {
          name: 'firstOrder',
          fieldNames: ['first_order'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
        },
        secondOrder: {
          name: 'secondOrder',
          fieldNames: ['second_order'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
        },
      },
    });

    const indexedAccount = buildDiagramModel([meta]).entities[0]!;
    const indexes = indexedAccount.constraints.filter((constraint) => constraint.type === 'index');

    expect(indexes).toEqual([
      { type: 'index', properties: ['email_address'], name: 'email_property_idx' },
      { type: 'index', properties: ['email_address'], name: 'email_entity_idx' },
      { type: 'index', properties: ['first_order', 'second_order'], name: 'ordered_idx' },
      { type: 'index', properties: ['second_order', 'first_order'], name: 'ordered_idx' },
      { type: 'index', properties: [], expression: 'lower(email_address)' },
      { type: 'index', properties: [], expression: 'upper(email_address)' },
      { type: 'index', properties: ['is_active'] },
      { type: 'index', properties: ['preferences_json'], name: 'preferences_idx' },
      { type: 'index', properties: ['organization_id'], name: 'organization_idx' },
    ]);
    expect(indexes.some((constraint) => constraint.name === 'transient_search_idx')).toBe(false);
    expect(indexes.some((constraint) => constraint.name === 'composite_relation_idx')).toBe(false);
  });

  it('resolves expression indexes or records an explicit unresolved state', () => {
    const callbackExpression: IndexCallback<Record<string, unknown>> = (
      table: { name: string; schema?: string; toString: () => string },
      columns: Record<string, string>,
      indexName: string
    ): string => `create index ${indexName} on ${table} (${columns.email})`;
    const meta = makeEntityMeta({
      className: 'Account',
      tableName: 'account_entry',
      schema: 'audit',
      indexes: [
        { name: 'lower_email_idx', expression: 'lower(email_address)' },
        { name: 'callback_email_idx', expression: callbackExpression },
        {
          name: 'failing_email_idx',
          expression: () => {
            throw new Error('cannot resolve index');
          },
        },
        { name: 'non_string_email_idx', expression: () => ({ sql: 'lower(email_address)' }) as unknown as string },
        { name: 'ordinary_email_idx', properties: ['email'] },
      ],
      properties: {
        email: {
          name: 'email',
          fieldNames: ['email_address'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
        },
      },
    });

    const account = buildDiagramModel([meta]).entities[0]!;

    expect(account.constraints).toEqual([
      { type: 'index', name: 'lower_email_idx', properties: [], expression: 'lower(email_address)' },
      {
        type: 'index',
        name: 'callback_email_idx',
        properties: [],
        expression: 'create index callback_email_idx on audit.account_entry (email_address)',
      },
      { type: 'index', name: 'failing_email_idx', properties: [], isExpressionUnresolved: true },
      { type: 'index', name: 'non_string_email_idx', properties: [], isExpressionUnresolved: true },
      { type: 'index', name: 'ordinary_email_idx', properties: ['email_address'] },
    ]);
  });

  it('preserves partial-index predicates independently from fields and expressions', () => {
    const activePredicate = {
      query: "  SELECT * WHERE deleted_at IS NULL AND status = 'active'  ",
      toQuery(): string {
        return this.query;
      },
    };
    const archivedPredicate = {
      toQuery: (): string => "select * where status = 'archived'",
    };
    const meta = makeEntityMeta({
      className: 'Account',
      tableName: 'account',
      indexes: [
        { name: 'shared_email_idx', properties: ['email'] },
        { name: 'shared_email_idx', properties: ['email'], type: { predicate: activePredicate } },
        { name: 'shared_email_idx', properties: ['email'], type: { predicate: archivedPredicate } },
        {
          name: 'lower_active_email_idx',
          expression: 'lower(email_address)',
          type: { predicate: activePredicate },
        },
        { name: 'options_are_not_predicates_idx', properties: ['email'], options: { where: 'discard me' } },
        {
          name: 'invalid_predicate_idx',
          properties: ['email'],
          type: { predicate: { toQuery: (): string => 'select *' } },
        },
        {
          name: 'throwing_predicate_idx',
          properties: ['email'],
          type: {
            predicate: {
              toQuery: (): string => {
                throw new Error('cannot serialize predicate');
              },
            },
          },
        },
      ],
      properties: {
        email: {
          name: 'email',
          fieldNames: ['email_address'],
          type: 'string',
          kind: ReferenceKind.SCALAR,
        },
      },
    });

    const account = buildDiagramModel([meta]).entities[0]!;

    expect(account.constraints).toEqual([
      { type: 'index', name: 'shared_email_idx', properties: ['email_address'] },
      {
        type: 'index',
        name: 'shared_email_idx',
        properties: ['email_address'],
        predicate: "deleted_at IS NULL AND status = 'active'",
      },
      {
        type: 'index',
        name: 'shared_email_idx',
        properties: ['email_address'],
        predicate: "status = 'archived'",
      },
      {
        type: 'index',
        name: 'lower_active_email_idx',
        properties: [],
        expression: 'lower(email_address)',
        predicate: "deleted_at IS NULL AND status = 'active'",
      },
      { type: 'index', name: 'options_are_not_predicates_idx', properties: ['email_address'] },
      { type: 'index', name: 'invalid_predicate_idx', properties: ['email_address'] },
      { type: 'index', name: 'throwing_predicate_idx', properties: ['email_address'] },
    ]);
  });
});

describe('buildDiagramModel — non-abstract STI root (M1)', () => {
  // A non-abstract STI root is assigned its own discriminatorValue by MikroORM,
  // and its property list includes the child-only columns marked inherited=true.
  function makeNonAbstractStiRoot(): EntityMetadata {
    return makeEntityMeta({
      className: 'Vehicle',
      tableName: 'vehicle',
      discriminatorColumn: 'type',
      discriminatorValue: 'vehicle',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
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

describe('buildDiagramModel — STI root skips child-only relations and constraints', () => {
  // MikroORM copies every child-only property onto the STI root, flagged
  // inherited=true and forced nullable. The root does not own those columns,
  // so it must not draw edges or list constraints for them.
  function childOnlyProperties(copiedOntoRoot: boolean): Record<string, Record<string, unknown>> {
    const copyFlags = copiedOntoRoot ? { inherited: true, nullable: true } : {};
    return {
      owner: { name: 'owner', fieldNames: ['owner_id'], type: 'User', kind: ReferenceKind.MANY_TO_ONE, ...copyFlags },
      plate: {
        name: 'plate',
        fieldNames: ['plate_id'],
        type: 'Plate',
        kind: ReferenceKind.ONE_TO_ONE,
        owner: true,
        unique: true,
        ...copyFlags,
      },
      tags: { name: 'tags', type: 'Tag', kind: ReferenceKind.MANY_TO_MANY, owner: true, ...copyFlags },
      vin: {
        name: 'vin',
        fieldNames: ['vin'],
        type: 'string',
        kind: ReferenceKind.SCALAR,
        index: 'car_vin_idx',
        ...copyFlags,
      },
      serial: {
        name: 'serial',
        fieldNames: ['serial'],
        type: 'string',
        kind: ReferenceKind.SCALAR,
        unique: 'car_serial_uq',
        ...copyFlags,
      },
    };
  }

  function rootOwnProperties(): Record<string, Record<string, unknown>> {
    return {
      id: pkProperty(),
      type: { name: 'type', fieldNames: ['type'], type: 'string', kind: ReferenceKind.SCALAR },
      garage: {
        name: 'garage',
        fieldNames: ['garage_id'],
        type: 'Garage',
        kind: ReferenceKind.MANY_TO_ONE,
        nullable: true,
      },
      name: {
        name: 'name',
        fieldNames: ['name'],
        type: 'string',
        kind: ReferenceKind.SCALAR,
        index: 'vehicle_name_idx',
      },
    };
  }

  function makeVehicleHierarchy(rootInit: Record<string, unknown> = {}): EntityMetadata[] {
    return [
      makeSimpleEntityMeta('User'),
      makeSimpleEntityMeta('Plate'),
      makeSimpleEntityMeta('Tag'),
      makeSimpleEntityMeta('Garage'),
      makeEntityMeta({
        className: 'Vehicle',
        tableName: 'vehicle',
        discriminatorColumn: 'type',
        primaryKeys: ['id'],
        properties: { ...rootOwnProperties(), ...childOnlyProperties(true) },
        ...rootInit,
      }),
      makeEntityMeta({
        className: 'Car',
        tableName: 'vehicle',
        extends: 'Vehicle',
        discriminatorValue: 'car',
        primaryKeys: ['id'],
        properties: { ...rootOwnProperties(), ...childOnlyProperties(false) },
      }),
    ];
  }

  function edgeLabelsFrom(model: ReturnType<typeof buildDiagramModel>, className: string): string[] {
    return model.relations.filter((r) => r.fromEntity === className).map((r) => r.label);
  }

  function constraintNamesOf(model: ReturnType<typeof buildDiagramModel>, className: string): (string | undefined)[] {
    return model.entities.find((e) => e.className === className)!.constraints.map((c) => c.name);
  }

  it('draws no root edge for child-only m:1, owning 1:1, or owning m:n properties', () => {
    const model = buildDiagramModel(makeVehicleHierarchy());

    expect(edgeLabelsFrom(model, 'Vehicle')).toEqual(['garage']);
  });

  it('keeps the root edge for a relation the root declares itself', () => {
    const model = buildDiagramModel(makeVehicleHierarchy());

    expect(model.relations).toContainEqual({
      fromEntity: 'Vehicle',
      toEntity: 'Garage',
      fromCardinality: '}o',
      toCardinality: 'o|',
      label: 'garage',
    });
  });

  it('draws the child-only relations from the child with their real cardinality', () => {
    const model = buildDiagramModel(makeVehicleHierarchy());
    const carEdges = model.relations.filter((r) => r.fromEntity === 'Car');

    expect(carEdges.map((r) => r.label)).toEqual(['garage', 'owner', 'plate', 'tags']);
    expect(carEdges.find((r) => r.label === 'owner')).toMatchObject({ toEntity: 'User', toCardinality: '||' });
    expect(carEdges.find((r) => r.label === 'plate')).toMatchObject({ toEntity: 'Plate', toCardinality: '||' });
    expect(carEdges.find((r) => r.label === 'tags')).toMatchObject({ toEntity: 'Tag', toCardinality: 'o{' });
  });

  it('lists no child-only index or unique on the root, while the child keeps them', () => {
    const model = buildDiagramModel(makeVehicleHierarchy());

    expect(constraintNamesOf(model, 'Vehicle')).toEqual(['vehicle_name_idx']);
    expect(constraintNamesOf(model, 'Car')).toEqual(['vehicle_name_idx', 'car_vin_idx', 'car_serial_uq']);
  });

  it('keeps a property MikroORM reports as root-owned, even when only subclasses declare it', () => {
    // MikroORM v6 (and v7 before 7.1.5) clears the flag once a second sibling
    // declares the same property. That is indistinguishable from a property
    // the root really declares, so it stays — documented as a known limitation.
    const owner = { name: 'owner', fieldNames: ['owner_id'], type: 'User', kind: ReferenceKind.MANY_TO_ONE };
    const metas = makeVehicleHierarchy({
      properties: { ...rootOwnProperties(), owner: { ...owner, inherited: false, nullable: true } },
    });

    expect(edgeLabelsFrom(buildDiagramModel(metas), 'Vehicle')).toEqual(['garage', 'owner']);
  });

  it('applies the same rules to a non-abstract root with its own discriminatorValue', () => {
    const model = buildDiagramModel(makeVehicleHierarchy({ discriminatorValue: 'vehicle' }));

    expect(edgeLabelsFrom(model, 'Vehicle')).toEqual(['garage']);
    expect(constraintNamesOf(model, 'Vehicle')).toEqual(['vehicle_name_idx']);
  });
});

describe('buildDiagramModel — STI root that extends a base class', () => {
  // A root keeps `extends` when it inherits from a shared base — an abstract
  // @Entity or a plain undecorated class. MikroORM lists neither in the
  // metadata, and the root is still the one member carrying discriminatorColumn.
  const copiedOntoRoot = { inherited: true, nullable: true };
  const owner = { name: 'owner', fieldNames: ['owner_id'], type: 'User', kind: ReferenceKind.MANY_TO_ONE };
  const breed = { name: 'breed', fieldNames: ['breed'], type: 'string', kind: ReferenceKind.SCALAR };

  function sharedProperties(): Record<string, Record<string, unknown>> {
    return {
      id: pkProperty(),
      name: { name: 'name', fieldNames: ['name'], type: 'string', kind: ReferenceKind.SCALAR },
      type: { name: 'type', fieldNames: ['type'], type: 'string', kind: ReferenceKind.SCALAR },
    };
  }

  function makeAnimalFamily(rootInit: Record<string, unknown> = {}): EntityMetadata[] {
    return [
      makeSimpleEntityMeta('User'),
      makeEntityMeta({
        className: 'Animal',
        tableName: 'animal',
        extends: 'BaseEntity',
        discriminatorColumn: 'type',
        primaryKeys: ['id'],
        properties: {
          ...sharedProperties(),
          breed: { ...breed, ...copiedOntoRoot },
          owner: { ...owner, ...copiedOntoRoot },
        },
        indexes: [{ name: 'dog_breed_idx', properties: ['breed'] }],
        ...rootInit,
      }),
      makeEntityMeta({
        className: 'Dog',
        tableName: 'animal',
        extends: 'Animal',
        discriminatorValue: 'dog',
        primaryKeys: ['id'],
        properties: { ...sharedProperties(), breed, owner },
        indexes: [{ name: 'dog_breed_idx', properties: ['breed'] }],
      }),
    ];
  }

  function entityOf(model: ReturnType<typeof buildDiagramModel>, className: string): EntityModel {
    return model.entities.find((e) => e.className === className)!;
  }

  it('recognizes the root by its discriminatorColumn', () => {
    const model = buildDiagramModel(makeAnimalFamily());

    expect(entityOf(model, 'Animal').discriminatorColumn).toBe('type');
  });

  it('keeps child-only columns out of the root box', () => {
    const model = buildDiagramModel(makeAnimalFamily());

    expect(entityOf(model, 'Animal').columns.map((c) => c.fieldName)).toEqual(['id', 'name', 'type']);
  });

  it('draws the child-only relation from the child alone', () => {
    const model = buildDiagramModel(makeAnimalFamily());

    expect(model.relations.map((r) => `${r.fromEntity}.${r.label}`)).toEqual(['Dog.owner']);
  });

  it('drops a class-level index on a child-only property from the root', () => {
    const model = buildDiagramModel(makeAnimalFamily());

    expect(entityOf(model, 'Animal').constraints).toEqual([]);
    expect(entityOf(model, 'Dog').constraints.map((c) => c.name)).toEqual(['dog_breed_idx']);
  });

  it('does not label the root as an STI child of its base class', () => {
    const model = buildDiagramModel(makeAnimalFamily({ discriminatorValue: 'animal' }));
    const root = entityOf(model, 'Animal');

    expect(root.discriminatorColumn).toBe('type');
    expect(root.extendsEntity).toBeUndefined();
    expect(root.discriminatorValue).toBeUndefined();
  });

  it('still labels the child as extending the root', () => {
    const model = buildDiagramModel(makeAnimalFamily());

    expect(entityOf(model, 'Dog')).toMatchObject({ extendsEntity: 'Animal', discriminatorValue: 'dog' });
  });
});

describe('buildDiagramModel — STI subclass that repeats discriminatorColumn', () => {
  // A subclass may repeat `discriminatorColumn` in its own @Entity options.
  // MikroORM keeps the option on the subclass metadata and still treats the
  // topmost class as the root (verified on v6: `Dog.root` is `Animal`).
  const breed = { name: 'breed', fieldNames: ['breed'], type: 'string', kind: ReferenceKind.SCALAR };
  const indoor = { name: 'indoor', fieldNames: ['indoor'], type: 'boolean', kind: ReferenceKind.SCALAR };
  const catIndex = { name: 'cat_indoor_idx', properties: ['indoor'] };

  function shared(): Record<string, Record<string, unknown>> {
    return {
      id: pkProperty(),
      type: { name: 'type', fieldNames: ['type'], type: 'string', kind: ReferenceKind.SCALAR },
    };
  }

  function member(className: string, init: Record<string, unknown>): EntityMetadata {
    return makeEntityMeta({ className, tableName: 'animal', primaryKeys: ['id'], indexes: [catIndex], ...init });
  }

  function makeFamily(): EntityMetadata[] {
    const copiedOntoRoot = { inherited: true, nullable: true };

    return [
      member('Animal', {
        discriminatorColumn: 'type',
        properties: { ...shared(), breed: { ...breed, ...copiedOntoRoot }, indoor: { ...indoor, ...copiedOntoRoot } },
      }),
      member('Dog', {
        extends: 'Animal',
        discriminatorColumn: 'type',
        discriminatorValue: 'dog',
        properties: { ...shared(), breed },
      }),
      member('Puppy', { extends: 'Dog', discriminatorValue: 'puppy', properties: { ...shared(), breed } }),
      member('Cat', { extends: 'Animal', discriminatorValue: 'cat', properties: { ...shared(), indoor } }),
    ];
  }

  function entityOf(className: string): EntityModel {
    return buildDiagramModel(makeFamily()).entities.find((e) => e.className === className)!;
  }

  it('labels the subclass as an STI child, not as a second root', () => {
    const dog = entityOf('Dog');

    expect(dog).toMatchObject({ extendsEntity: 'Animal', discriminatorValue: 'dog' });
    expect(dog.discriminatorColumn).toBeUndefined();
  });

  it('keeps the topmost class as the root', () => {
    const root = entityOf('Animal');

    expect(root.discriminatorColumn).toBe('type');
    expect(root.extendsEntity).toBeUndefined();
  });

  it("keeps a sibling's class-level index off the subclass and its own children", () => {
    expect(entityOf('Dog').constraints).toEqual([]);
    expect(entityOf('Puppy').constraints).toEqual([]);
    expect(entityOf('Cat').constraints.map((c) => c.name)).toEqual(['cat_indoor_idx']);
  });
});

describe('buildDiagramModel — STI root skips columns flattened from a child-only embedded', () => {
  // MikroORM flags the copied @Embedded property itself as inherited, then
  // flattens it on the root into fresh properties that carry no flag of their
  // own — only `embedded: [parentName, fieldName]` links them back. A nested
  // embeddable repeats that one level down (`engine_gear` → `engine_gear_count`).
  function scalar(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { name, fieldNames: [name], type: 'string', kind: ReferenceKind.SCALAR, ...extra };
  }

  function embedded(name: string, type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { name, type, kind: ReferenceKind.EMBEDDED, ...extra };
  }

  function rootDeclaredProperties(): Record<string, Record<string, unknown>> {
    return {
      id: pkProperty(),
      type: scalar('type'),
      garage: embedded('garage', 'Address'),
      garage_city: scalar('garage_city', { embedded: ['garage', 'city'] }),
    };
  }

  function engineProperties(
    copy: Record<string, unknown>,
    flattened: Record<string, unknown>
  ): Record<string, Record<string, unknown>> {
    return {
      engine: embedded('engine', 'Engine', copy),
      engine_model: scalar('engine_model', { embedded: ['engine', 'model'], index: 'engine_model_idx', ...flattened }),
      engine_gear: embedded('engine_gear', 'Gear', { embedded: ['engine', 'gear'], ...flattened }),
      engine_gear_count: scalar('engine_gear_count', { embedded: ['engine_gear', 'count'], ...flattened }),
    };
  }

  function makeVehicleFamily(): EntityMetadata[] {
    const indexes = [{ name: 'car_engine_model_class_idx', properties: ['engine_model'] }];

    return [
      makeEntityMeta({
        className: 'Vehicle',
        tableName: 'vehicle',
        discriminatorColumn: 'type',
        primaryKeys: ['id'],
        properties: {
          ...rootDeclaredProperties(),
          ...engineProperties({ inherited: true, nullable: true }, { nullable: true }),
        },
        indexes,
      }),
      makeEntityMeta({
        className: 'Car',
        tableName: 'vehicle',
        extends: 'Vehicle',
        discriminatorValue: 'car',
        primaryKeys: ['id'],
        properties: { ...rootDeclaredProperties(), ...engineProperties({}, {}) },
        indexes,
      }),
      makeEntityMeta({
        className: 'Truck',
        tableName: 'vehicle',
        extends: 'Vehicle',
        discriminatorValue: 'truck',
        primaryKeys: ['id'],
        properties: rootDeclaredProperties(),
        indexes,
      }),
    ];
  }

  function entityOf(className: string): EntityModel {
    return buildDiagramModel(makeVehicleFamily()).entities.find((e) => e.className === className)!;
  }

  it('keeps the flattened child-only columns out of the root box, nested ones included', () => {
    expect(entityOf('Vehicle').columns.map((c) => c.fieldName)).toEqual(['id', 'type', 'garage_city']);
  });

  it('keeps them on the child that declares the embedded', () => {
    expect(entityOf('Car').columns.map((c) => c.fieldName)).toEqual([
      'id',
      'type',
      'garage_city',
      'engine_model',
      'engine_gear_count',
    ]);
  });

  it('keeps the columns of an embedded the root declares itself', () => {
    expect(entityOf('Vehicle').columns.find((c) => c.fieldName === 'garage_city')).toMatchObject({
      embeddedIn: 'Address',
      embeddedPropName: 'city',
    });
  });

  it('lists an index declared inside the child-only embeddable on the child alone', () => {
    expect(entityOf('Vehicle').constraints.map((c) => c.name)).not.toContain('engine_model_idx');
    expect(entityOf('Car').constraints.map((c) => c.name)).toContain('engine_model_idx');
  });

  it('drops a class-level index naming a flattened child-only column from the root and siblings', () => {
    expect(entityOf('Vehicle').constraints.map((c) => c.name)).not.toContain('car_engine_model_class_idx');
    expect(entityOf('Truck').constraints.map((c) => c.name)).not.toContain('car_engine_model_class_idx');
    expect(entityOf('Car').constraints.map((c) => c.name)).toContain('car_engine_model_class_idx');
  });
});

describe('buildDiagramModel — abstract class in the middle of an STI family', () => {
  // `OwnedVehicle extends Vehicle` is abstract, so it has no discriminatorValue.
  // MikroORM hands such a member a copy of every root property, including the
  // `inherited: true` copies that came up from its sibling (Bike) — and it
  // flattens a copied @Embedded there too, without a flag on the flat column.
  const copied = { inherited: true, nullable: true };
  const owner = { name: 'owner', fieldNames: ['owner_id'], type: 'User', kind: ReferenceKind.MANY_TO_ONE };
  const shop = { name: 'shop', fieldNames: ['shop_id'], type: 'Shop', kind: ReferenceKind.MANY_TO_ONE, index: true };
  const frame = { name: 'frame', type: 'Frame', kind: ReferenceKind.EMBEDDED };
  const indexes = [{ name: 'bike_gears_idx', properties: ['gears'] }];

  function scalar(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { name, fieldNames: [name], type: 'string', kind: ReferenceKind.SCALAR, ...extra };
  }

  function shared(): Record<string, Record<string, unknown>> {
    return { id: pkProperty(), name: scalar('name'), type: scalar('type') };
  }

  /** Bike's properties as MikroORM copies them onto the root and the abstract member. */
  function copiedFromBike(): Record<string, Record<string, unknown>> {
    return {
      gears: scalar('gears', copied),
      shop: { ...shop, ...copied },
      frame: { ...frame, ...copied },
      frame_size: scalar('frame_size', { embedded: ['frame', 'size'], nullable: true }),
    };
  }

  function makeVehicleFamily(): EntityMetadata[] {
    const member = { tableName: 'vehicle', primaryKeys: ['id'], indexes };

    return [
      makeSimpleEntityMeta('User'),
      makeSimpleEntityMeta('Shop'),
      makeEntityMeta({
        ...member,
        className: 'Vehicle',
        abstract: true,
        discriminatorColumn: 'type',
        properties: { ...shared(), owner: { ...owner, ...copied }, ...copiedFromBike() },
      }),
      makeEntityMeta({
        ...member,
        className: 'OwnedVehicle',
        abstract: true,
        extends: 'Vehicle',
        properties: { ...shared(), owner, ...copiedFromBike() },
      }),
      makeEntityMeta({
        ...member,
        className: 'Car',
        extends: 'OwnedVehicle',
        discriminatorValue: 'car',
        properties: { ...shared(), owner },
      }),
      makeEntityMeta({
        ...member,
        className: 'Bike',
        extends: 'Vehicle',
        discriminatorValue: 'bike',
        properties: {
          ...shared(),
          gears: scalar('gears'),
          shop,
          frame,
          frame_size: scalar('frame_size', { embedded: ['frame', 'size'] }),
        },
      }),
    ];
  }

  function entityOf(className: string): EntityModel {
    return buildDiagramModel(makeVehicleFamily()).entities.find((e) => e.className === className)!;
  }

  it('keeps sibling-only columns out of the abstract member, flattened embedded ones included', () => {
    expect(entityOf('OwnedVehicle').columns.map((c) => c.fieldName)).toEqual(['id', 'name', 'type', 'owner_id']);
  });

  it('draws no relation from the abstract member for a sibling-only property', () => {
    const edges = buildDiagramModel(makeVehicleFamily()).relations.filter((r) => r.fromEntity === 'OwnedVehicle');

    expect(edges.map((r) => `${r.label} → ${r.toEntity}`)).toEqual(['owner → User']);
  });

  it('drops sibling-only indexes from the abstract member, class-level and property-level', () => {
    expect(entityOf('OwnedVehicle').constraints).toEqual([]);
  });

  it('labels the abstract member as extending the root, without a discriminator value', () => {
    const ownedVehicle = entityOf('OwnedVehicle');

    expect(ownedVehicle.extendsEntity).toBe('Vehicle');
    expect(ownedVehicle.discriminatorValue).toBeUndefined();
    expect(ownedVehicle.discriminatorColumn).toBeUndefined();
  });

  it('keeps the sibling that declares the properties intact', () => {
    const bike = entityOf('Bike');

    expect(bike.columns.map((c) => c.fieldName)).toEqual(['id', 'name', 'type', 'gears', 'shop_id', 'frame_size']);
    expect(bike.constraints.map((c) => c.name ?? c.properties.join('+'))).toEqual(['bike_gears_idx', 'shop_id']);
  });

  it('keeps the concrete child labelled as extending the abstract member', () => {
    expect(entityOf('Car')).toMatchObject({ extendsEntity: 'OwnedVehicle', discriminatorValue: 'car' });
  });

  it('does not label a subclass outside any STI family as an STI child', () => {
    const model = buildDiagramModel([
      makeSimpleEntityMeta('Person'),
      makeEntityMeta({
        className: 'Admin',
        tableName: 'admin',
        extends: 'Person',
        primaryKeys: ['id'],
        properties: { id: pkProperty() },
      }),
    ]);

    expect(model.entities.find((e) => e.className === 'Admin')!.extendsEntity).toBeUndefined();
  });
});

describe('buildDiagramModel — STI class-level constraints follow the properties they name', () => {
  // MikroORM merges every class-level index, unique, and check of an STI family
  // into one list that the root and all children share, without recording which
  // class declared it. The fixture mirrors that: every member carries the same
  // lists, and only the properties tell the members apart.
  const copiedOntoRoot = { inherited: true, nullable: true };

  function scalar(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { name, fieldNames: [name], type: 'string', kind: ReferenceKind.SCALAR, ...extra };
  }

  function sharedConstraintLists(): Record<string, unknown> {
    return {
      indexes: [
        { name: 'vehicle_name_idx', properties: ['name'] },
        { name: 'car_owner_plate_idx', properties: ['owner', 'plate'] },
        { name: 'car_plate_idx', properties: 'plate' },
        { name: 'sports_turbo_idx', properties: ['turbo'] },
        { name: 'car_expr_idx', expression: 'create index car_expr_idx on vehicle (lower(plate))' },
        { name: 'car_engine_idx', properties: ['engine.model'] },
      ],
      uniques: [{ name: 'car_vin_uniq', properties: ['vin'] }],
      checks: [
        { name: 'car_plate_check', expression: 'length(plate) > 0' },
        { name: 'car_vin_check', property: 'vin', expression: 'length(vin) = 17' },
      ],
    };
  }

  function makeVehicleFamily(): EntityMetadata[] {
    const shared = { id: pkProperty(), name: scalar('name'), type: scalar('type') };
    const owner = { name: 'owner', fieldNames: ['owner_id'], type: 'User', kind: ReferenceKind.MANY_TO_ONE };
    const carOnly = { owner, plate: scalar('plate'), vin: scalar('vin') };

    return [
      makeSimpleEntityMeta('User'),
      makeEntityMeta({
        className: 'Vehicle',
        tableName: 'vehicle',
        discriminatorColumn: 'type',
        primaryKeys: ['id'],
        properties: {
          ...shared,
          owner: { ...owner, ...copiedOntoRoot },
          plate: scalar('plate', copiedOntoRoot),
          vin: scalar('vin', copiedOntoRoot),
          turbo: scalar('turbo', copiedOntoRoot),
          payload: scalar('payload', copiedOntoRoot),
        },
        ...sharedConstraintLists(),
      }),
      makeEntityMeta({
        className: 'Car',
        tableName: 'vehicle',
        extends: 'Vehicle',
        discriminatorValue: 'car',
        primaryKeys: ['id'],
        properties: { ...shared, ...carOnly },
        ...sharedConstraintLists(),
      }),
      makeEntityMeta({
        className: 'SportsCar',
        tableName: 'vehicle',
        extends: 'Car',
        discriminatorValue: 'sports',
        primaryKeys: ['id'],
        properties: { ...shared, ...carOnly, turbo: scalar('turbo') },
        ...sharedConstraintLists(),
      }),
      makeEntityMeta({
        className: 'Truck',
        tableName: 'vehicle',
        extends: 'Vehicle',
        discriminatorValue: 'truck',
        primaryKeys: ['id'],
        properties: { ...shared, payload: scalar('payload') },
        ...sharedConstraintLists(),
      }),
    ];
  }

  function constraintNamesOf(className: string): (string | undefined)[] {
    const model = buildDiagramModel(makeVehicleFamily());
    return model.entities.find((e) => e.className === className)!.constraints.map((c) => c.name);
  }

  const FAMILY = ['Vehicle', 'Car', 'SportsCar', 'Truck'];

  it('drops a class-level index or unique from the root when it names a child-only property', () => {
    const names = constraintNamesOf('Vehicle');

    expect(names).not.toContain('car_plate_idx');
    expect(names).not.toContain('car_owner_plate_idx');
    expect(names).not.toContain('car_vin_uniq');
  });

  it('drops it from a sibling child that does not have the property', () => {
    const names = constraintNamesOf('Truck');

    expect(names).not.toContain('car_plate_idx');
    expect(names).not.toContain('car_owner_plate_idx');
    expect(names).not.toContain('car_vin_uniq');
  });

  it('keeps it on the child that has every named property', () => {
    const names = constraintNamesOf('Car');

    expect(names).toContain('car_plate_idx');
    expect(names).toContain('car_owner_plate_idx');
    expect(names).toContain('car_vin_uniq');
  });

  it('drops a grandchild-only index from the intermediate parent but keeps it on the grandchild', () => {
    expect(constraintNamesOf('Car')).not.toContain('sports_turbo_idx');
    expect(constraintNamesOf('SportsCar')).toContain('sports_turbo_idx');
  });

  it('keeps a parent-declared index on a grandchild that inherits the property', () => {
    expect(constraintNamesOf('SportsCar')).toContain('car_plate_idx');
  });

  it('drops a check bound to a child-only property from the root and siblings only', () => {
    expect(constraintNamesOf('Vehicle')).not.toContain('car_vin_check');
    expect(constraintNamesOf('Truck')).not.toContain('car_vin_check');
    expect(constraintNamesOf('Car')).toContain('car_vin_check');
  });

  it.each(FAMILY)('keeps an index on a root-owned property on %s', (className) => {
    expect(constraintNamesOf(className)).toContain('vehicle_name_idx');
  });

  it.each(FAMILY)('keeps a raw SQL expression index and check on %s, since they name no property', (className) => {
    const names = constraintNamesOf(className);

    expect(names).toContain('car_expr_idx');
    expect(names).toContain('car_plate_check');
  });

  it.each(FAMILY)('keeps an index whose property name no family member declares on %s', (className) => {
    expect(constraintNamesOf(className)).toContain('car_engine_idx');
  });

  it('lists the surviving root constraints in declaration order', () => {
    expect(constraintNamesOf('Vehicle')).toEqual([
      'vehicle_name_idx',
      'car_expr_idx',
      'car_engine_idx',
      'car_plate_check',
    ]);
  });
});

describe('buildDiagramModel — object/array embedded as single JSON column (M2)', () => {
  function makeOrgWithObjectEmbeddeds(): EntityMetadata {
    return makeEntityMeta({
      className: 'Org',
      tableName: 'org',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty(),
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
    const tenantMeta = makeEntityMeta({
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
    const auditLogMeta = makeEntityMeta({
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
    const entityA = makeEntityMeta({
      className: 'EntityA',
      tableName: 'entity_a',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty('id', 'uuid'),
      },
    });
    const entityB = makeEntityMeta({
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
    const entityC = makeEntityMeta({
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
    const entityA = makeEntityMeta({
      className: 'EntityA',
      tableName: 'entity_a',
      primaryKeys: ['id1', 'id2'],
      properties: {
        id1: pkProperty('id1', 'uuid'),
        id2: pkProperty('id2', 'integer'),
      },
    });
    const entityB = makeEntityMeta({
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

describe('buildDiagramModel — composite FK-as-PK type resolution', () => {
  it('preserves mixed scalar types across multiple composite FK hops', () => {
    const entityA = makeEntityMeta({
      className: 'EntityA',
      tableName: 'entity_a',
      primaryKeys: ['id1', 'id2'],
      properties: {
        id1: pkProperty('id1', 'uuid'),
        id2: pkProperty('id2', 'integer'),
      },
    });
    const entityB = makeEntityMeta({
      className: 'EntityB',
      tableName: 'entity_b',
      primaryKeys: ['entityA'],
      properties: {
        entityA: {
          name: 'entityA',
          fieldNames: ['b1', 'b2'],
          referencedColumnNames: ['id1', 'id2'],
          type: 'EntityA',
          kind: ReferenceKind.MANY_TO_ONE,
          primary: true,
        },
      },
    });
    const entityC = makeEntityMeta({
      className: 'EntityC',
      tableName: 'entity_c',
      primaryKeys: ['entityB'],
      properties: {
        entityB: {
          name: 'entityB',
          fieldNames: ['c1', 'c2'],
          referencedColumnNames: ['b1', 'b2'],
          type: 'EntityB',
          kind: ReferenceKind.MANY_TO_ONE,
          primary: true,
        },
      },
    });

    const model = buildDiagramModel([entityA, entityB, entityC]);
    const entityBTypes = model.entities.find((entity) => entity.className === 'EntityB')?.columns.map((c) => c.type);
    const entityCTypes = model.entities.find((entity) => entity.className === 'EntityC')?.columns.map((c) => c.type);

    expect(entityBTypes).toEqual(['uuid', 'integer']);
    expect(entityCTypes).toEqual(['uuid', 'integer']);
  });

  it('preserves reordered referenced-column types at the next composite FK hop', () => {
    const entityA = makeEntityMeta({
      className: 'EntityA',
      tableName: 'entity_a',
      primaryKeys: ['id1', 'id2'],
      properties: {
        id1: pkProperty('id1', 'uuid'),
        id2: pkProperty('id2', 'integer'),
      },
    });
    const entityB = makeEntityMeta({
      className: 'EntityB',
      tableName: 'entity_b',
      primaryKeys: ['entityA'],
      properties: {
        entityA: {
          name: 'entityA',
          fieldNames: ['b_id2', 'b_id1'],
          referencedColumnNames: ['id2', 'id1'],
          type: 'EntityA',
          kind: ReferenceKind.MANY_TO_ONE,
          primary: true,
        },
      },
    });
    const entityC = makeEntityMeta({
      className: 'EntityC',
      tableName: 'entity_c',
      primaryKeys: ['entityB'],
      properties: {
        entityB: {
          name: 'entityB',
          fieldNames: ['c_id2', 'c_id1'],
          referencedColumnNames: ['b_id2', 'b_id1'],
          type: 'EntityB',
          kind: ReferenceKind.MANY_TO_ONE,
          primary: true,
        },
      },
    });

    const model = buildDiagramModel([entityA, entityB, entityC]);
    const entityBTypes = model.entities.find((entity) => entity.className === 'EntityB')?.columns.map((c) => c.type);
    const entityCTypes = model.entities.find((entity) => entity.className === 'EntityC')?.columns.map((c) => c.type);

    expect(entityBTypes).toEqual(['integer', 'uuid']);
    expect(entityCTypes).toEqual(['integer', 'uuid']);
  });
});

describe('buildDiagramModel — cycle-aware FK-as-PK type resolution', () => {
  function createPkRelationMeta(
    className: string,
    targetClassName: string,
    fieldName: string,
    referencedColumnName: string
  ): EntityMetadata {
    return makeEntityMeta({
      className,
      tableName: className.toLowerCase(),
      primaryKeys: ['id'],
      properties: {
        id: {
          name: 'id',
          fieldNames: [fieldName],
          referencedColumnNames: [referencedColumnName],
          type: targetClassName,
          kind: ReferenceKind.MANY_TO_ONE,
          primary: true,
        },
      },
    });
  }

  it('resolves a UUID through six acyclic FK-as-PK hops', () => {
    const entityA = makeEntityMeta({
      className: 'EntityA',
      tableName: 'entity_a',
      primaryKeys: ['id'],
      properties: {
        id: pkProperty('id', 'uuid'),
      },
    });
    const chain = ['EntityB', 'EntityC', 'EntityD', 'EntityE', 'EntityF', 'EntityG'].map((className, index, names) =>
      createPkRelationMeta(className, index === 0 ? 'EntityA' : names[index - 1]!, 'id', 'id')
    );

    const model = buildDiagramModel([entityA, ...chain]);
    const finalColumns = model.entities
      .find((entity) => entity.className === 'EntityG')
      ?.columns.map(({ fieldName, type }) => ({ fieldName, type }));

    expect(finalColumns).toEqual([{ fieldName: 'id', type: 'uuid' }]);
  });

  it('renders both physical PK columns in a relation cycle as unknown', () => {
    const entityA = createPkRelationMeta('EntityA', 'EntityB', 'b_id', 'a_id');
    const entityB = createPkRelationMeta('EntityB', 'EntityA', 'a_id', 'b_id');

    const model = buildDiagramModel([entityA, entityB]);
    const physicalColumns = model.entities.map(({ className, columns }) => ({
      className,
      columns: columns.map(({ fieldName, type }) => ({ fieldName, type })),
    }));

    expect(physicalColumns).toEqual([
      { className: 'EntityA', columns: [{ fieldName: 'b_id', type: 'unknown' }] },
      { className: 'EntityB', columns: [{ fieldName: 'a_id', type: 'unknown' }] },
    ]);
  });
});
