import {
  type PlexResource,
  PlexTvError,
} from '@root/types/plex-server.types.js'
import { PLEX_CLIENT_IDENTIFIER, USER_AGENT } from '@utils/version.js'

const PLEX_RESOURCES_TIMEOUT_MS = 10_000

interface PlexResourcesOptions {
  ownedOnly?: boolean
}

/** Every plex.tv resource that provides a server, and throws when plex.tv cannot be read. */
export async function getAllPlexResources(
  token: string,
  { ownedOnly = false }: PlexResourcesOptions = {},
): Promise<PlexResource[]> {
  const url = new URL('https://plex.tv/api/v2/resources')
  url.searchParams.append('includeHttps', '1')

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'X-Plex-Token': token,
      'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
    },
    signal: AbortSignal.timeout(PLEX_RESOURCES_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new PlexTvError(
      `Plex.tv resources request failed: ${response.status} ${response.statusText}`,
      response.status,
    )
  }

  const resources = (await response.json()) as PlexResource[]
  return resources.filter(
    (resource) =>
      providesServer(resource) && (!ownedOnly || resource.owned === true),
  )
}

function providesServer(resource: PlexResource): boolean {
  return (resource.provides ?? '').split(',').includes('server')
}
