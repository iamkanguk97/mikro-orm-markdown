import { createRequire } from 'node:module';
import type { Options } from '@mikro-orm/core';

/** Proves that TsMorph checked both declaration and TypeScript sources and found neither. */
export class MissingTsMorphSourceError extends Error {
  constructor(readonly sourcePath: string) {
    super(`No TypeScript metadata source was found for '${sourcePath}'.`);
    this.name = 'MissingTsMorphSourceError';
  }
}

interface ReflectionProviderRuntime {
  resolve(specifier: string): string;
  load(): Promise<typeof import('@mikro-orm/reflection')>;
}

function createReflectionProviderRuntime(): ReflectionProviderRuntime {
  const require = createRequire(import.meta.url);
  return {
    resolve: (specifier: string): string => require.resolve(specifier),
    load: () => import('@mikro-orm/reflection'),
  };
}

/**
 * When the config does not choose a metadata provider, opt into
 * `TsMorphMetadataProvider` if `@mikro-orm/reflection` is installed.
 *
 * The CLI loads `.ts` configs through `tsx` (esbuild), which strips
 * `emitDecoratorMetadata`, so MikroORM's default `ReflectMetadataProvider`
 * cannot infer types for entities that omit explicit `type:`/`entity:`
 * attributes. `TsMorphMetadataProvider` reads types from the TypeScript sources
 * instead. When the optional package is absent the original options are kept.
 */
export async function withTsMorphMetadataProvider(
  options: Options,
  runtime?: ReflectionProviderRuntime
): Promise<Options> {
  if (options.metadataProvider !== undefined) {
    return options;
  }

  const reflection = runtime ?? createReflectionProviderRuntime();
  try {
    reflection.resolve('@mikro-orm/reflection/package.json');
  } catch (err) {
    const code =
      err !== null && typeof err === 'object' && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === 'MODULE_NOT_FOUND') {
      return options;
    }

    throw err;
  }

  const { TsMorphMetadataProvider } = await reflection.load();
  type ReflectionSourceFile = ReturnType<InstanceType<typeof TsMorphMetadataProvider>['getExistingSourceFile']>;
  class FallbackAwareTsMorphMetadataProvider extends TsMorphMetadataProvider {
    override getExistingSourceFile(path: string, ext?: string, validate = true): ReflectionSourceFile {
      const source =
        ext === undefined
          ? ((super.getExistingSourceFile(path, '.d.ts', false) as ReflectionSourceFile | undefined) ??
            (super.getExistingSourceFile(path, '.ts', false) as ReflectionSourceFile | undefined))
          : (super.getExistingSourceFile(path, ext, false) as ReflectionSourceFile | undefined);

      if (source === undefined && validate) {
        throw new MissingTsMorphSourceError(path);
      }

      return source as ReflectionSourceFile;
    }
  }

  return { ...options, metadataProvider: FallbackAwareTsMorphMetadataProvider };
}
