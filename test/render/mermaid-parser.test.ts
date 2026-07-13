import { describe, expect, it } from 'vitest';
import { generateMarkdown } from '../../src/index.js';
import type { ColumnModel, DiagramModel, EntityModel, RelationEdge } from '../../src/model/types.js';
import { renderErDiagram } from '../../src/render/mermaid.js';
import config from '../fixtures/mikro-orm.config.js';
import { parseMermaidDiagram, parseMermaidErSnapshot, parseMermaidFences } from './mermaid-parser.js';

function makeColumn(fieldName: string): ColumnModel {
  return {
    propName: fieldName,
    fieldName,
    type: 'string',
    isPrimary: false,
    isForeignKey: false,
    isUnique: false,
    isNullable: false,
  };
}

function makeEntity(className: string, fieldNames: string[]): EntityModel {
  return {
    className,
    tableName: className,
    columns: fieldNames.map(makeColumn),
    isPivot: false,
    isEmbeddable: false,
    constraints: [],
  };
}

function makeRelation(fromEntity: string, toEntity: string, label: string): RelationEdge {
  return {
    fromEntity,
    toEntity,
    fromCardinality: '}o',
    toCardinality: '||',
    label,
  };
}

describe('official Mermaid parser contract', () => {
  it('parses every generated Mermaid fence as an ER diagram', async () => {
    const markdown = await generateMarkdown({ orm: config, title: 'Parser Contract' });

    const results = await parseMermaidFences(markdown);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.diagramType === 'er')).toBe(true);
  });

  it('parses generated Mermaid fences with supported frontmatter options', async () => {
    const markdown = await generateMarkdown({
      orm: config,
      title: 'Frontmatter Parser Contract',
      mermaid: { layout: 'elk', theme: 'forest' },
    });

    const results = await parseMermaidFences(markdown);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.diagramType === 'er')).toBe(true);
  });

  it('rejects invalid Mermaid syntax', async () => {
    await expect(parseMermaidDiagram('erDiagram\n  USER {')).rejects.toBeDefined();
  });

  it('keeps Unicode and sanitized entity and column collisions distinct in the parsed ER database', async () => {
    const model: DiagramModel = {
      entities: [
        makeEntity('사용자', ['이름', '$이름', '-이름', '_이름']),
        makeEntity('고객', ['id']),
        makeEntity('User$Profile', ['profile$value', 'profile-value', 'profile_value']),
        makeEntity('User-Profile', ['id']),
        makeEntity('User_Profile', ['id']),
      ],
      relations: [
        makeRelation('사용자', '고객', 'unicode-target'),
        makeRelation('User$Profile', 'User-Profile', 'dollar-to-hyphen'),
        makeRelation('User_Profile', 'User$Profile', 'underscore-to-dollar'),
      ],
    };

    const source = renderErDiagram(model);
    expect(renderErDiagram(model)).toBe(source);

    const snapshot = await parseMermaidErSnapshot(source);
    const entityByDisplayName = new Map(snapshot.entities.map((entity) => [entity.displayName, entity]));
    const displayNameById = new Map(snapshot.entities.map((entity) => [entity.id, entity.displayName]));

    expect([...entityByDisplayName.keys()]).toEqual(['사용자', '고객', 'User$Profile', 'User-Profile', 'User_Profile']);
    expect(new Set(entityByDisplayName.get('사용자')?.attributes)).toHaveLength(4);
    expect(new Set(entityByDisplayName.get('User$Profile')?.attributes)).toHaveLength(3);
    expect(entityByDisplayName.get('User_Profile')?.internalName).toBe('User_Profile');
    expect(entityByDisplayName.get('User$Profile')?.attributes).toContain('profile_value');
    expect(
      snapshot.relationships.map((relationship) => ({
        from: displayNameById.get(relationship.fromEntityId),
        to: displayNameById.get(relationship.toEntityId),
        label: relationship.label,
      }))
    ).toEqual([
      { from: '사용자', to: '고객', label: 'unicode-target' },
      { from: 'User$Profile', to: 'User-Profile', label: 'dollar-to-hyphen' },
      { from: 'User_Profile', to: 'User$Profile', label: 'underscore-to-dollar' },
    ]);
  });

  it('keeps already-safe ASCII Mermaid output byte-for-byte unchanged', () => {
    const model: DiagramModel = {
      entities: [makeEntity('UserProfile', ['id', 'display_name']), makeEntity('Account', ['id'])],
      relations: [makeRelation('UserProfile', 'Account', 'account')],
    };

    expect(renderErDiagram(model)).toBe(
      [
        'erDiagram',
        '  UserProfile {',
        '    string id',
        '    string display_name',
        '  }',
        '  Account {',
        '    string id',
        '  }',
        '  UserProfile }o--|| Account : "account"',
      ].join('\n')
    );
  });
});
