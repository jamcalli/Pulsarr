import type { WebhookQueue } from '@root/types/webhook.types.js'

export const webhookQueue: WebhookQueue = {}

/**
 * Determines whether a specific episode is already present in the webhook queue for a given TVDB ID and season.
 *
 * @param tvdbId - The TVDB identifier for the show.
 * @param seasonNumber - The season number of the episode.
 * @param episodeNumber - The episode number within the season.
 * @returns `true` if the episode is already queued; otherwise, `false`.
 */
export function isEpisodeAlreadyQueued(
  tvdbId: string,
  seasonNumber: number,
  episodeNumber: number,
): boolean {
  if (!webhookQueue[tvdbId]?.seasons[seasonNumber]?.episodes) {
    return false
  }

  return webhookQueue[tvdbId].seasons[seasonNumber].episodes.some(
    (episode) =>
      episode.seasonNumber === seasonNumber &&
      episode.episodeNumber === episodeNumber,
  )
}
