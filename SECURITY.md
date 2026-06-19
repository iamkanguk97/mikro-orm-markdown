# Security Policy

## Supported Versions

Security fixes are provided for the latest published version of `mikro-orm-markdown`.

## Reporting a Vulnerability

Please do not open a public issue with exploit details.

Use GitHub private vulnerability reporting if it is available for this repository. If a private channel is not available, open a public issue with a brief, non-sensitive summary and ask for a private contact path.

Helpful reports include:

- Affected package version
- Node.js and MikroORM versions
- Minimal reproduction steps
- Impact and expected behavior

The maintainer will review the report, coordinate a fix when needed, and publish release notes once the issue can be disclosed safely.

## Dependency advisories

The shipped runtime dependency tree is clean — `npm audit --omit=dev` reports **0 vulnerabilities**.

`npm audit` (including dev dependencies) currently reports advisories that come entirely from the test/build toolchain (the `vitest`/`vite`/`esbuild` chain and `@mikro-orm/sqlite`'s native-build helpers such as `node-gyp`/`tar`). These do not affect anyone installing the published package, since they are not part of the runtime dependency tree.

Remediation requires major upgrades that are breaking (e.g. `vitest` 4.x, `@mikro-orm/sqlite` 7.x — the latter would also change the supported MikroORM major) and is tracked for a dedicated maintenance pass rather than forced here.
