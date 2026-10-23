# Pulsarr docs

The site at https://jamcalli.github.io/Pulsarr/, built with Fumadocs as a static export.

From the repository root:

- `bun run docs:start` runs the dev server on port 3001.
- `bun run docs:build` builds the site into `docs/out/`.
- `bun run docs:sync` copies shared files from `src/client`.

Files listed in `scripts/sync-docs-shared.ts` are copies. Edit them in `src/client`, then run `docs:sync`. CI fails if they drift.

`content/docs/api/` is generated from `public/openapi.json` at build time and is not committed.
