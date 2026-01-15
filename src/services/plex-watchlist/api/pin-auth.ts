import { USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS } from './helpers.js'

const PLEX_CLIENT_IDENTIFIER = 'pulsarr'
const PLEX_PRODUCT_NAME = 'Pulsarr'

export interface PlexPin {
  id: number
  code: string
  qr: string
  expiresAt: string
}

export interface PlexPinPollResult {
  authToken: string | null
  expiresIn: number
}

/**
 * Generates a new Plex PIN for device authorization.
 *
 * Creates a PIN that users can enter at plex.tv/link to authorize
 * Pulsarr to access their Plex account. Returns a 4-character code
 * by default.
 *
 * @param log - Fastify logger instance
 * @returns PIN details including id, code, QR URL, and expiration
 */
export async function generatePlexPin(
  log: FastifyBaseLogger,
): Promise<PlexPin> {
  try {
    const response = await fetch('https://plex.tv/api/v2/pins', {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'X-Plex-Product': PLEX_PRODUCT_NAME,
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
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

    log.info({ pinId: data.id }, 'Generated Plex PIN for authentication')

    return {
      id: data.id,
      code: data.code,
      qr: data.qr,
      expiresAt: data.expiresAt,
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
 * @param log - Fastify logger instance
 * @returns authToken if authorized, null otherwise, plus expiration info
 */
export async function pollPlexPin(
  pinId: number,
  log: FastifyBaseLogger,
): Promise<PlexPinPollResult> {
  try {
    const response = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

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
