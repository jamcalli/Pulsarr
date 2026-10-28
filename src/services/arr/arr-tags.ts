import { type ArrTag, HttpError } from '@root/types/arr-connection.types.js'
import {
  ArrInstanceCache,
  type ArrInstanceContext,
} from '@services/arr/arr-instance-cache.js'

export class ArrTags {
  private readonly cache: ArrInstanceCache<ArrTag[]>

  constructor(private readonly instance: ArrInstanceContext) {
    this.cache = new ArrInstanceCache(instance, 'tags', () =>
      instance.client().get<ArrTag[]>('tag'),
    )
  }

  list(): Promise<ArrTag[]> {
    return this.cache.read()
  }

  /** Returns the arr's existing tag when the label is already taken. */
  async create(label: string): Promise<ArrTag> {
    const { appName, log } = this.instance
    try {
      const result = await this.instance.client().post<ArrTag>('tag', { label })
      this.cache.invalidate()
      if (!result) throw new Error(`${appName} returned no tag for "${label}"`)
      return result
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        log.debug(
          `Tag "${label}" already exists in ${appName}, skipping creation`,
        )
        this.cache.invalidate()
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
    this.cache.invalidate()
  }
}
