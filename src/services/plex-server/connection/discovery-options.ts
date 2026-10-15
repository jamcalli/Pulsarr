import { PLEX_DEFAULT_PORT } from '@root/schemas/plex/configure-notifications.schema.js'
import type { ServerCandidates } from './candidates.js'

export interface DiscoveryOption {
  name: string
  uri: string
  host: string
  port: number
  useSsl: boolean
  local: boolean
}

/** Each candidate as its own address and, unless the server requires https, its plain http address too. */
export function discoveryOptions(
  servers: ServerCandidates[],
): DiscoveryOption[] {
  const options = new Map<string, DiscoveryOption>()
  for (const { resource, connections } of servers) {
    for (const connection of connections) {
      const parsed = parseUri(connection.uri)
      if (!parsed) continue
      const port = connection.port || Number(parsed.port) || PLEX_DEFAULT_PORT
      const entries = [
        { host: parsed.hostname, useSsl: parsed.protocol === 'https:' },
      ]
      if (connection.address && !connection.IPv6 && !resource.httpsRequired) {
        entries.push({ host: connection.address, useSsl: false })
      }
      for (const { host, useSsl } of entries) {
        const uri = `${useSsl ? 'https' : 'http'}://${host}:${port}`
        if (options.has(uri)) continue
        options.set(uri, {
          name: `${resource.name} (${host})`,
          uri,
          host,
          port,
          useSsl,
          local: connection.local,
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
