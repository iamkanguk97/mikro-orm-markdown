import { describe, expect, it } from 'vitest';
import { loadEntityMetadata } from '../../src/metadata/load.js';
import type { ColumnModel, DiagramModel, RelationEdge } from '../../src/model/types.js';
import { buildDiagramModel, renderErDiagram } from '../../src/render/mermaid.js';
import config from '../fixtures/mikro-orm.config.js';

// ─── buildDiagramModel (integration: uses real MikroORM metadata) ─────────────

describe('buildDiagramModel', () => {
  async function getModel(): Promise<DiagramModel> {
    const metas = await loadEntityMetadata(config);
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

  it('produces exactly 2 relation edges (m:1 and m:n)', async () => {
    const model = await getModel();
    // Post.author (m:1) and Post.tags (m:n owner)
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
        },
      ],
      relations: [],
    };
    expect(renderErDiagram(model)).toContain('string email UK');
  });

  it('renders a FK column with propName comment when names differ', () => {
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
        },
      ],
      relations: [],
    };
    const result = renderErDiagram(model);
    // Shows DB column name + FK qualifier + TS property name as comment
    expect(result).toContain('integer author_id FK "author"');
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
});
