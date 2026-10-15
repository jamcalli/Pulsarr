import type { ConfigUpdate } from '@root/schemas/config/config.schema.js'
import { plexTokensChanged } from '@services/plex-watchlist/rss/token-feeds.js'
import type { FastifyBaseLogger } from 'fastify'
import { type PlexPingResult, pingPlex } from './client.js'

/** Thrown before a config save writes new tokens that plex.tv did not accept. */
export class PlexTokenCheckError extends Error {
  constructor(readonly result: Exclude<PlexPingResult, 'accepted'>) {
    super(
      result === 'rejected'
        ? 'Plex did not accept the token'
        : 'Plex could not be reached',
    )
    this.name = 'PlexTokenCheckError'
  }
}

/** Pings plex.tv with every new token in the update, and throws unless all are accepted. */
export async function assertPlexTokensAccepted(
  update: ConfigUpdate,
  currentTokens: readonly string[],
  log: FastifyBaseLogger,
): Promise<void> {
  if (!update.plexTokens || !plexTokensChanged(update, currentTokens)) return
  const results = await Promise.all(
    update.plexTokens.map((token) => pingPlex(token, log)),
  )
  if (results.includes('rejected')) throw new PlexTokenCheckError('rejected')
  if (results.includes('unreachable')) {
    throw new PlexTokenCheckError('unreachable')
  }
}
