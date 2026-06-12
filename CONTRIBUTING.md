# Contributing to mikro-orm-markdown

## Prerequisites

- Node.js >= 18
- npm >= 9

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
npm run typecheck
npm run test
npm run build
```

All four must pass before opening a PR.

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

## Pull Request Process

1. Fork the repository and create a branch from `main`.
2. Make your changes and ensure all checks pass.
3. Open a PR against `main` — fill in the PR template.
4. A maintainer will review and merge.

## Reporting Bugs / Requesting Features

Use the GitHub Issue templates.
