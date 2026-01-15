import { randomUUID } from 'node:crypto'
import {
  PLEX_CLIENT_IDENTIFIER,
  PLEX_PRODUCT_NAME,
  USER_AGENT,
} from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS } from './helpers.js'

export interface PlexPin {
  id: number
  code: string
  qr: string
  expiresAt: string
  clientId: string
}

export interface PlexPinPollResult {
  authToken: string | null
  expiresIn: number
}

/**
 * Generates a unique client identifier for this PIN auth session.
 *
 * Each PIN generation gets a unique identifier to ensure Plex treats
 * it as a new device, guaranteeing a fresh auth token. This is important
 * for re-authentication scenarios (e.g., after Plex token revocation).
 */
function generateClientId(): string {
  return `${PLEX_CLIENT_IDENTIFIER}-${randomUUID().slice(0, 8)}`
}

/**
 * Generates a new Plex PIN for device authorization.
 *
 * Creates a PIN that users can enter at plex.tv/link to authorize
 * Pulsarr to access their Plex account. Returns a 4-character code
 * by default.
 *
 * @param log - Fastify logger instance
 * @returns PIN details including id, code, QR URL, expiration, and clientId
 */
export async function generatePlexPin(
  log: FastifyBaseLogger,
): Promise<PlexPin> {
  const clientId = generateClientId()

  try {
    const response = await fetch('https://plex.tv/api/v2/pins', {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'X-Plex-Product': PLEX_PRODUCT_NAME,
        'X-Plex-Client-Identifier': clientId,
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    if (!response.ok) {
      log.error(
        `Failed to generate Plex PIN: ${response.status} ${response.statusText}`,
      )
      throw new Error(`Failed to generate Plex PIN: ${response.status}`)
    }

    const data = (await response.json()) as {
      id: number
      code: string
      qr: string
      expiresAt: string
    }

    log.info(
      { pinId: data.id, clientId },
      'Generated Plex PIN for authentication',
    )

    return {
      id: data.id,
      code: data.code,
      qr: data.qr,
      expiresAt: data.expiresAt,
      clientId,
    }
  } catch (error) {
    log.error({ error }, 'Failed to generate Plex PIN')
    throw error
  }
}

/**
 * Polls a Plex PIN to check if user has authorized.
 *
 * Should be called periodically (e.g., every 5 seconds) after generating
 * a PIN to check if the user has completed authorization at plex.tv/link.
 *
 * @param pinId - The PIN ID returned from generatePlexPin
 * @param clientId - The client identifier used when generating the PIN
 * @param log - Fastify logger instance
 * @returns authToken if authorized, null otherwise, plus expiration info
 */
export async function pollPlexPin(
  pinId: number,
  clientId: string,
  log: FastifyBaseLogger,
): Promise<PlexPinPollResult> {
  try {
    const response = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'X-Plex-Client-Identifier': clientId,
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    // 404 means PIN expired or not found - return expired state
    if (response.status === 404) {
      log.debug({ pinId }, 'Plex PIN expired or not found')
      return {
        authToken: null,
        expiresIn: -1,
      }
    }

    if (!response.ok) {
      log.error(
        `Failed to poll Plex PIN: ${response.status} ${response.statusText}`,
      )
      throw new Error(`Failed to poll Plex PIN: ${response.status}`)
    }

    const data = (await response.json()) as {
      authToken: string | null
      expiresIn: number
    }

    if (data.authToken) {
      log.info({ pinId }, 'Plex PIN authorized successfully')
    }

    return {
      authToken: data.authToken || null,
      expiresIn: data.expiresIn,
    }
  } catch (error) {
    log.error({ error, pinId }, 'Failed to poll Plex PIN')
    throw error
  }
}
