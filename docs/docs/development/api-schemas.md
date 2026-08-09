---
sidebar_position: 3
---

# API Schemas & Client Types

Pulsarr's API contract flows from Zod schemas to everything else: server validation, response serialization, the OpenAPI spec, the generated API docs, and the typed client the frontend uses. The Zod schema is the single source of truth - nothing else is written by hand.

```
src/schemas/**/*.schema.ts   (Zod route schemas - source of truth)
        │
        ├─→ server validation + response serialization (fastify-zod-openapi)
        │
        └─→ docs/static/openapi.json          (bun run openapi:generate)
                    │
                    ├─→ src/client/types/api.d.ts   (bun run openapi:types)
                    │        └─→ typed client ($api / apiFetch)
                    │
                    └─→ API docs on the docs site   (generated in CI only)
```

## Adding or changing an endpoint

1. **Write the Zod route schema** in `src/schemas/<feature>/<name>.schema.ts`. Include `operationId`, `tags`, `summary`, and typed `response` entries - these drive both the docs and the generated client types. Give reused or client-consumed shapes a `.meta({ id, description })` so they become named components (`.meta()` only - `.describe()` chained after it destroys the id). Inferred types are for server-side use; the client gets its types from the generated contract instead.

2. **Wire the route** in `src/routes/v1/...` using the schema (`FastifyPluginAsyncZodOpenApi` pattern - copy a sibling route).

3. **Regenerate the spec and client types:**

   ```bash
   bun run openapi:dev
   ```

   This runs `openapi:generate` (boots a stripped app, writes `docs/static/openapi.json`) followed by `openapi:types` (writes `src/client/types/api.d.ts`). Both files are checked in.

4. **Consume it from the client** through the typed client in `src/client/lib/tanstackApi.ts`:

   ```typescript
   // Queries - the query key is derived automatically as [method, path, params]
   const query = useMinLoading(
     $api.useQuery('get', '/v1/feature/things', {
       params: { query: { limit } },
     }),
   )

   // Mutations - typed fetch inside a plain useMutation
   const { data, error } = await apiFetch.POST('/v1/feature/things', { body })
   if (error) throw error
   ```

   Paths, params, request bodies, and response shapes are all checked against the generated types - a typo or a stale type is a compile error, not a runtime surprise.

   When client code needs to name a shape (props, state, payload builders), alias the named component locally in the file that uses it:

   ```typescript
   import type { components } from '@/types/api.js'

   type RouterRule = components['schemas']['RouterRule']
   ```

   Do not import `z.infer` types from `@root/schemas` into the client - they carry the schema's output types, which diverge from the wire contract on transformed fields. If the shape has no named component yet, add a `.meta({ id })` to its schema and regenerate.

5. **Verify and commit everything together:** `bun run typecheck`, then commit the schema, route, `openapi.json`, and `api.d.ts` in the same commit so the contract never drifts from the code.

## Rules of the road

- **Never edit `src/client/types/api.d.ts` or `docs/static/openapi.json` by hand** - they are generated artifacts. If a type looks wrong, fix the Zod schema and regenerate.
- **Do not run the Docusaurus API doc generation locally** (`docusaurus gen-api-docs`). CI owns that step; it regenerates hundreds of files.
- **No client-side response validation is needed.** Responses are serialized through the Zod schema on the server (`serializerCompiler` in `src/app.ts`), so the emitted JSON always matches the declared shape the types were generated from.
- **Cache invalidation uses the derived key shape.** `['get', '/v1/feature/things']` as a query key prefix invalidates every params variant of that path. Feature hooks export their prefixes as key constants - reuse those instead of writing literals.
- **Skeleton loading:** wrap query results in `useMinLoading` (and mutation results in `useMinLoadingMutation`) from `src/client/lib/useMinLoading.ts` to keep the minimum-duration loading behavior consistent across the app.

## Why the codegen lives in `scripts/openapi-codegen/`

`openapi-typescript` requires the TypeScript 5 compiler API, while the repo uses the native TypeScript 7 compiler. The subpackage pins its own `typescript@5` so the two never conflict; `bun run openapi:types` installs and runs it in isolation automatically.
