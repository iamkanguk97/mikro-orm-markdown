import type { EntityMetadata } from '@mikro-orm/core';
import { loadJsDoc } from '../../src/docs/jsdoc.js';
import { loadEntityMetadata } from '../../src/metadata/load.js';
import { buildDocumentModel, type DocumentModel } from '../../src/model/build.js';
import { buildDiagramModel } from '../../src/model/diagram.js';
import type { DiagramModel } from '../../src/model/types.js';
import { renderMarkdown } from '../../src/render/markdown.js';
import config from '../fixtures/mikro-orm.config.js';

/** Discovered metadata for the shared fixture entities (test/fixtures/entities). */
export async function getFixtureMetas(): Promise<EntityMetadata[]> {
  const { metas } = await loadEntityMetadata(config);
  return metas;
}

/** DiagramModel built from the shared fixture entities. */
export async function getFixtureDiagramModel(): Promise<DiagramModel> {
  return buildDiagramModel(await getFixtureMetas());
}

/** DocumentModel built through the full load → JSDoc → build pipeline over the shared fixtures. */
export async function getFixtureDocModel(title = 'Test DB'): Promise<DocumentModel> {
  const { metas, sourcePaths } = await loadEntityMetadata(config);
  const jsDocResult = loadJsDoc(sourcePaths);
  return buildDocumentModel(metas, jsDocResult, title);
}

/** Markdown rendered from the shared-fixture DocumentModel. */
export async function getFixtureMarkdown(title = 'Test DB'): Promise<string> {
  return renderMarkdown(await getFixtureDocModel(title));
}
