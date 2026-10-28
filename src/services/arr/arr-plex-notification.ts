import type { ArrClient } from '@services/arr/arr-client.js'
import type { ArrProduct } from '@services/arr/arr-product.js'
import type { FastifyBaseLogger } from 'fastify'

export interface PlexServerSettings {
  plexToken: string
  plexHost: string
  plexPort: number
  useSsl: boolean
}

interface ArrNotificationImplementation {
  id: number
  implementation: string
}

function plexNotificationDefinition(
  product: ArrProduct,
  settings: PlexServerSettings,
) {
  return {
    ...product.plexNotification.flags,
    name: 'Plex Media Server',
    fields: [
      { name: 'host', value: settings.plexHost },
      { name: 'port', value: settings.plexPort },
      { name: 'useSsl', value: settings.useSsl },
      { name: 'authToken', value: settings.plexToken },
      { name: 'updateLibrary', value: true },
    ],
    implementationName: 'Plex Media Server',
    implementation: 'PlexServer',
    configContract: 'PlexServerSettings',
    infoLink: product.plexNotification.infoLink,
    tags: [],
  }
}

export async function findPlexNotification(
  client: ArrClient,
): Promise<ArrNotificationImplementation | undefined> {
  const notifications =
    await client.get<ArrNotificationImplementation[]>('notification')
  return notifications.find((n) => n.implementation === 'PlexServer')
}

/** Updates the existing Plex notification by id so a save the arr rejects never drops the working one. */
export async function configurePlexNotification(
  client: ArrClient,
  product: ArrProduct,
  settings: PlexServerSettings,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    const definition = plexNotificationDefinition(product, settings)
    const existing = await findPlexNotification(client)
    if (existing) {
      await client.put(`notification/${existing.id}`, {
        ...definition,
        id: existing.id,
      })
    } else {
      await client.post('notification', definition)
    }
    log.info(`Successfully configured Plex notification for ${product.appName}`)
  } catch (error) {
    log.error(
      { error },
      `Error configuring Plex notification for ${product.appName}:`,
    )
    throw error
  }
}

export async function removePlexNotification(
  client: ArrClient,
  product: ArrProduct,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    const existing = await findPlexNotification(client)
    if (!existing) {
      log.debug(`No Plex notification found to remove from ${product.appName}`)
      return
    }
    await client.delete(`notification/${existing.id}`)
    log.info(`Successfully removed Plex notification from ${product.appName}`)
  } catch (error) {
    log.error(
      { error },
      `Error removing Plex notification from ${product.appName}:`,
    )
    throw error
  }
}
