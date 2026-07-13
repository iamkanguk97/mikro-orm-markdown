import type { Options } from '@mikro-orm/core';
import { emitWarning, type WarnHandler } from './messages.js';

/** Proves that TsMorph checked both declaration and TypeScript sources and found neither. */
export class MissingTsMorphSourceError extends Error {
  constructor(readonly sourcePath: string) {
    super(`No TypeScript metadata source was found for '${sourcePath}'.`);
    this.name = 'MissingTsMorphSourceError';
  }
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
export async function withTsMorphMetadataProvider(options: Options, onWarn?: WarnHandler): Promise<Options> {
  if (options.metadataProvider !== undefined) {
    return options;
  }

  try {
    const { TsMorphMetadataProvider } = await import('@mikro-orm/reflection');
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
  } catch (err) {
    const code =
      err !== null && typeof err === 'object' && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
    const isNotInstalled = code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND';

    if (!isNotInstalled) {
      emitWarning(onWarn, {
        title: '@mikro-orm/reflection failed to load',
        detail: `@mikro-orm/reflection is installed but failed to load: ${err instanceof Error ? err.message : String(err)}.`,
        fix: 'Ensure all @mikro-orm/* packages are installed at the same version.',
      });
    }

    return options;
  }
}
