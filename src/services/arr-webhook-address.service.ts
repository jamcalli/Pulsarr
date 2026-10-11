import type {
  ArrWebhookResult,
  ArrWebhookResults,
} from '@root/schemas/config/config.schema.js'
import { stripArrApiErrorPrefix } from '@utils/route-errors.js'
import type { FastifyInstance } from 'fastify'

function toResults(
  radarr: ArrWebhookResult[],
  sonarr: ArrWebhookResult[],
): ArrWebhookResults {
  return {
    radarr: radarr.map((result) => ({
      ...result,
      message: stripArrApiErrorPrefix('radarr', result.message),
    })),
    sonarr: sonarr.map((result) => ({
      ...result,
      message: stripArrApiErrorPrefix('sonarr', result.message),
    })),
  }
}

/** Asks every real arr instance to call Pulsarr back at the candidate address. Stores nothing. */
export async function testArrWebhookAddress(
  fastify: FastifyInstance,
  address: { baseUrl: string; port: number },
): Promise<ArrWebhookResults> {
  const [radarr, sonarr] = await Promise.all([
    fastify.radarrManager.testWebhookAddress(address.baseUrl, address.port),
    fastify.sonarrManager.testWebhookAddress(address.baseUrl, address.port),
  ])
  return toResults(radarr, sonarr)
}

export async function registerArrWebhooks(
  fastify: FastifyInstance,
): Promise<ArrWebhookResults> {
  const [radarr, sonarr] = await Promise.all([
    fastify.radarrManager.resyncWebhooks(),
    fastify.sonarrManager.resyncWebhooks(),
  ])
  return toResults(radarr, sonarr)
}

export function hasCallbackFailure(results: ArrWebhookResults): boolean {
  return [...results.radarr, ...results.sonarr].some(
    (result) => result.code === 'callback_failed',
  )
}
