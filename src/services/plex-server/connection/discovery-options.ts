import { PLEX_DEFAULT_PORT } from '@root/schemas/plex/configure-notifications.schema.js'
import type { ServerCandidates } from './candidates.js'

export interface DiscoveryOption {
  name: string
  uri: string
  host: string
  port: number
  useSsl: boolean
  local: boolean
  machineId: string
}

const HTTPS_DEFAULT_PORT = 443
const HTTP_DEFAULT_PORT = 80

/** Each candidate's URI as Plex lists it and, unless the server requires https, its plain http address too. */
export function discoveryOptions(
  servers: ServerCandidates[],
): DiscoveryOption[] {
  const options = new Map<string, DiscoveryOption>()
  const add = (option: DiscoveryOption) => {
    if (!options.has(option.uri)) options.set(option.uri, option)
  }
  for (const { resource, connections } of servers) {
    for (const connection of connections) {
      const parsed = parseUri(connection.uri)
      if (!parsed) continue
      const useSsl = parsed.protocol === 'https:'
      add({
        name: `${resource.name} (${parsed.hostname})`,
        uri: parsed.origin,
        host: parsed.hostname,
        port: parsed.port
          ? Number(parsed.port)
          : useSsl
            ? HTTPS_DEFAULT_PORT
            : HTTP_DEFAULT_PORT,
        useSsl,
        local: connection.local,
        machineId: resource.clientIdentifier,
      })
      if (connection.address && !connection.IPv6 && !resource.httpsRequired) {
        const port = connection.port || PLEX_DEFAULT_PORT
        add({
          name: `${resource.name} (${connection.address})`,
          uri: `http://${connection.address}:${port}`,
          host: connection.address,
          port,
          useSsl: false,
          local: connection.local,
          machineId: resource.clientIdentifier,
        })
      }
    }
  }
  return [...options.values()]
}

function parseUri(uri: string): URL | null {
  try {
    return new URL(uri)
  } catch {
    return null
  }
}
