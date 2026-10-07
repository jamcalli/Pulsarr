import type { ContentRouterDeps } from '@services/content-router/types.js'
import { createMockLogger } from './logger.js'

type ShallowPartial<T> = { [K in keyof T]?: Partial<T[K]> }

export type ContentRouterDepsOverrides = ShallowPartial<
  Omit<ContentRouterDeps, 'logger' | 'config'>
>

/** Reads config through fastify.config on every access, the way the service getter does. */
export function createContentRouterDeps(
  overrides: ContentRouterDepsOverrides = {},
): ContentRouterDeps {
  const { fastify = {}, ...rest } = overrides
  // the only place tests widen partial fakes into the real dependency types
  return {
    logger: createMockLogger(),
    db: {},
    rules: {},
    radarrManager: {},
    sonarrManager: {},
    approvalService: {},
    quotaService: {},
    notifications: {},
    progress: {},
    ...rest,
    fastify,
    get config() {
      return fastify.config ?? {}
    },
  } as unknown as ContentRouterDeps
}
