# Contributing to mikro-orm-markdown

## Prerequisites

- Node.js `^22.22.1 || ^24.11.0 || >=26.0.0` (required by development tools such as tsup and lint-staged)
- npm >= 9

This is a development requirement only. The published package still runs on Node.js >= 22.17 (`engines` in `package.json`), and CI checks that floor against the packed tarball.

### Node.js support policy

`engines.node` is the runtime floor promised to users. Raise it only when:

- its Node.js release line reaches end-of-life (Node.js 22: 2027-04-30); move it to the oldest LTS line still supported, or
- a runtime dependency, or a Node.js API used in `src/`, needs a newer version.

Development tooling never moves it on its own; list such requirements above instead. Raising the floor is a breaking change, so it ships in a major release, bundled with other breaking changes where possible.

## Setup

```bash
git clone https://github.com/iamkanguk97/mikro-orm-markdown.git
cd mikro-orm-markdown
npm install
```

## Development

```bash
npm run dev        # watch mode build
npm run test:watch # watch mode tests
```

## Verification

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
npm run test:pack
```

All checks must pass before opening a PR. `test:pack` verifies the npm tarball export and CLI binary after `build`.

## Commit Messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/).

| Prefix      | When to use        |
| ----------- | ------------------ |
| `feat:`     | New feature        |
| `fix:`      | Bug fix            |
| `docs:`     | Documentation only |
| `test:`     | Tests only         |
| `refactor:` | No behavior change |
| `chore:`    | CI, deps, config   |
| `ci:`       | CI configuration   |
| `build:`    | Build system       |
| `perf:`     | Performance        |
| `style:`    | Formatting only    |
| `revert:`   | Revert a commit    |
| `wip:`      | Work in progress   |

Commit subjects must not include issue or ticket IDs. Add references in the footer instead:

```text
Refs: #123
Refs: ECOM-123
```

Pull requests are squash-merged, and the PR title becomes the commit message on `main`.
CI checks the PR title against these rules. Commits inside a PR are not checked, so if
the check fails, edit the PR title — no need to rewrite your commits.

## Pull Request Process

1. Fork the repository and create a branch from `main`.
2. Make your changes and ensure all checks pass.
3. Open a PR against `main` — fill in the PR template.
4. A maintainer will review and merge.

## Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please). Contributors don't need to do anything beyond using a Conventional Commit PR title.

- **Version.** After CI passes on `main`, release-please opens or updates a release PR titled `chore: release x.y.z`. It picks the version from the commit titles merged since the last release: `fix:` bumps the patch, `feat:` bumps the minor, and `!` after the type (`feat!:`) or a `BREAKING CHANGE:` footer bumps the major.
- **Changelog.** The release PR writes the version into `package.json` and `.release-please-manifest.json`, and adds a `CHANGELOG.md` entry. `feat` titles go under Added, `perf` under Changed, and `fix` under Fixed. Other types stay out of the changelog. To add a summary paragraph or reword an entry, edit `CHANGELOG.md` on the release PR branch before merging.
- **Merging (maintainer).** The release PR is opened with the workflow's `GITHUB_TOKEN`, so GitHub does not run CI on it, and its required checks never report. A maintainer merges it with admin bypass ("Merge without waiting for requirements to be met"). The code it releases has already passed CI on `main`, and the PR itself changes only the version and the changelog.
- **Publishing.** When CI passes on the merge commit, the Release workflow tags `vx.y.z`, creates the GitHub Release, and publishes to npm. If publishing fails, for example because `NPM_TOKEN` expired, fix the cause and use "Re-run failed jobs" on that workflow run. The tag and the GitHub Release already exist, so a re-run only retries the publish.

## Reporting Bugs / Requesting Features

Use the GitHub Issue templates.
