import type {
  ArrQualityProfile,
  ArrRootFolder,
} from '@root/types/arr-connection.types.js'
import {
  type ArrCache,
  type ArrInstanceContext,
  readArrCache,
} from '@services/arr/arr-caches.js'
import { parseQualityProfileId } from '@utils/quality-profile.js'

export class ArrQualityProfiles {
  constructor(
    private readonly instance: ArrInstanceContext,
    private readonly cache: ArrCache<ArrQualityProfile[]>,
  ) {}

  list(): Promise<ArrQualityProfile[]> {
    return readArrCache(this.cache, this.instance, () => this.fetch())
  }

  async fetch(): Promise<ArrQualityProfile[]> {
    try {
      return await this.instance
        .client()
        .get<ArrQualityProfile[]>('qualityprofile')
    } catch (error) {
      this.instance.log.error({ error }, 'Error fetching quality profiles')
      throw error
    }
  }
}

export async function fetchRootFolders(
  instance: ArrInstanceContext,
): Promise<ArrRootFolder[]> {
  try {
    return await instance.client().get<ArrRootFolder[]>('rootfolder')
  } catch (error) {
    instance.log.error({ error }, 'Error fetching root folders')
    throw error
  }
}

/** Picks the override, then the instance default, then the arr's first root folder. */
export async function resolveRootFolder(
  instance: ArrInstanceContext,
  configured: string | null,
  override?: string,
): Promise<string> {
  const rootFolderPath = override || configured
  if (rootFolderPath) return rootFolderPath

  const rootFolders = await fetchRootFolders(instance)
  if (rootFolders.length === 0) {
    throw new Error(`No root folders configured in ${instance.appName}`)
  }
  const defaultPath = rootFolders[0].path
  instance.log.debug(`Using root folder: ${defaultPath}`)
  return defaultPath
}

/** Matches the configured profile by id, then by name, and falls back to the arr's first profile. */
export function resolveQualityProfileId(
  instance: ArrInstanceContext,
  profiles: ArrQualityProfile[],
  configured: string | number | null,
): number {
  const { appName, log } = instance
  if (profiles.length === 0) {
    throw new Error(`No quality profiles configured in ${appName}`)
  }
  const [first] = profiles

  if (configured === null) {
    log.debug(`Using default quality profile: ${first.name} (ID: ${first.id})`)
    return first.id
  }

  const configuredId = parseQualityProfileId(configured)
  if (configuredId !== undefined) return configuredId

  const name = configured.toString().toLowerCase()
  const match = profiles.find((profile) => profile.name.toLowerCase() === name)
  if (match) {
    log.debug(`Using matched quality profile: ${match.name} (ID: ${match.id})`)
    return match.id
  }

  log.warn(
    `Could not find quality profile "${configured}". Available profiles: ${profiles.map((p) => p.name).join(', ')}`,
  )
  log.info(
    `Falling back to first quality profile: ${first.name} (ID: ${first.id})`,
  )
  return first.id
}
