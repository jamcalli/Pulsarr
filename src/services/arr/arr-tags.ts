import { type ArrTag, HttpError } from '@root/types/arr-connection.types.js'
import {
  type ArrCache,
  type ArrCacheReadOptions,
  type ArrInstanceContext,
  readArrCache,
} from '@services/arr/arr-caches.js'
import type { ArrClient } from '@services/arr/arr-client.js'
import type { ArrProduct } from '@services/arr/arr-product.js'
import { allSettledOrThrow } from '@utils/all-settled-or-throw.js'
import type { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'

const BULK_TAG_CONCURRENCY = 4

export interface ArrItemTagUpdate {
  itemId: number
  tagIds: number[]
}

export type ArrApplyTags = 'add' | 'remove' | 'replace'

export class ArrTags {
  constructor(
    private readonly instance: ArrInstanceContext,
    private readonly cache: ArrCache<ArrTag[]>,
  ) {}

  list(options?: ArrCacheReadOptions): Promise<ArrTag[]> {
    return readArrCache(
      this.cache,
      this.instance,
      () => this.instance.client().get<ArrTag[]>('tag'),
      options,
    )
  }

  private invalidate(): void {
    const instanceId = this.instance.instanceId()
    if (instanceId !== undefined) this.cache.entries.delete(instanceId)
  }

  /** Returns the arr's existing tag when the label is already taken. */
  async create(label: string): Promise<ArrTag> {
    const { appName, log } = this.instance
    try {
      const result = await this.instance.client().post<ArrTag>('tag', { label })
      this.invalidate()
      if (!result) throw new Error(`${appName} returned no tag for "${label}"`)
      return result
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        log.debug(
          `Tag "${label}" already exists in ${appName}, skipping creation`,
        )
        this.invalidate()
        const existing = (await this.list()).find((tag) => tag.label === label)
        if (existing) return existing
      }
      throw error
    }
  }

  /** Keeps the requested tags (ids or labels) that exist on the arr, or the instance default ids when none are requested. */
  async resolveForAdd(
    requested: string[] | undefined,
    defaults: string[],
  ): Promise<{ ids: string[]; existing: ArrTag[] }> {
    const { appName, log } = this.instance
    const useRequested = requested !== undefined && requested.length > 0
    const inputs = useRequested ? requested : defaults
    if (inputs.length === 0) return { ids: [], existing: [] }

    const existing = await this.list()
    const ids = new Set<string>()
    for (const input of inputs) {
      const byId = !useRequested || /^\d+$/.test(input)
      const tag = byId
        ? existing.find((t) => t.id.toString() === input)
        : existing.find((t) => t.label === input)
      if (tag) {
        ids.add(tag.id.toString())
        continue
      }
      log.warn(
        byId
          ? `${useRequested ? 'Tag' : 'Config tag'} ID ${input} not found in ${appName} - skipping this tag`
          : `Tag "${input}" not found in ${appName} - skipping this tag`,
      )
    }
    return { ids: [...ids], existing }
  }

  async delete(tagId: number): Promise<void> {
    await this.instance.client().delete(`tag/${tagId}`)
    this.invalidate()
  }
}

/** Sends one editor request per distinct tag set, so items sharing tags go in one call. */
export async function bulkUpdateItemTags(
  client: ArrClient,
  product: ArrProduct,
  log: FastifyBaseLogger,
  updates: ArrItemTagUpdate[],
  applyTags: ArrApplyTags,
): Promise<void> {
  if (updates.length === 0) return
  const { itemsLabel } = product

  const groups = new Map<string, { tagIds: number[]; itemIds: number[] }>()
  for (const update of updates) {
    const tagIds = [...new Set(update.tagIds)].sort((a, b) => a - b)
    const key = tagIds.join(',')
    const group = groups.get(key)
    if (group) group.itemIds.push(update.itemId)
    else groups.set(key, { tagIds, itemIds: [update.itemId] })
  }

  try {
    const limit = pLimit({
      concurrency: BULK_TAG_CONCURRENCY,
      rejectOnClear: true,
    })
    await allSettledOrThrow(
      [...groups.values()].map(({ tagIds, itemIds }) =>
        limit(async () => {
          try {
            await client.put(`${product.itemEndpoint}/editor`, {
              [product.editorIdsKey]: itemIds,
              tags: tagIds,
              applyTags,
            })
          } catch (error) {
            limit.clearQueue()
            throw error
          }
          log.debug(
            `Bulk updated ${itemIds.length} ${itemsLabel} with tags [${tagIds.join(', ')}] (mode: ${applyTags})`,
          )
        }),
      ),
    )
    log.debug(
      `Bulk updated tags for ${updates.length} ${itemsLabel} across ${groups.size} tag groups (mode: ${applyTags})`,
    )
  } catch (error) {
    log.error({ error }, `Failed to bulk update ${itemsLabel} tags`)
    throw error
  }
}
