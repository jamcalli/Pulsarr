import type { ArrWebhookResults } from '@root/schemas/config/config.schema.js'
import type { FastifyInstance } from 'fastify'

/** Asks every real arr instance to call Pulsarr back at the candidate address. Stores nothing. */
export async function testArrWebhookAddress(
  fastify: FastifyInstance,
  address: { baseUrl: string; port: number },
): Promise<ArrWebhookResults> {
  const [radarr, sonarr] = await Promise.all([
    fastify.radarrManager.testWebhookAddress(address.baseUrl, address.port),
    fastify.sonarrManager.testWebhookAddress(address.baseUrl, address.port),
  ])
  return { radarr, sonarr }
}

export async function registerArrWebhooks(
  fastify: FastifyInstance,
): Promise<ArrWebhookResults> {
  const [radarr, sonarr] = await Promise.all([
    fastify.radarrManager.resyncWebhooks(),
    fastify.sonarrManager.resyncWebhooks(),
  ])
  return { radarr, sonarr }
}

export function hasCallbackFailure(results: ArrWebhookResults): boolean {
  return [...results.radarr, ...results.sonarr].some(
    (result) => result.code === 'callback_failed',
  )
}
