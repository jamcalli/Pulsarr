import type { WebhookContent } from '@root/schemas/webhooks/webhook-payloads.schema.js'
import type { Config } from '@root/types/config.types.js'
import type {
  MediaNotification,
  NotificationResult,
} from '@root/types/notification.types.js'
import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type { SonarrEpisodeSchema } from '@root/types/sonarr.types.js'
import { getTmdbUrl, parseGuids } from '@root/utils/guid-handler.js'
import { buildContentPayload } from '../templates/webhook-payloads.js'

export interface MediaInfo {
  type: 'movie' | 'show'
  guid: string
  title: string
  episodes?: SonarrEpisodeSchema[]
}

export interface MediaAvailableOptions {
  isBulkRelease: boolean
  instanceId?: number
  instanceType?: 'sonarr' | 'radarr'
  sequential?: boolean
}

export interface EnrichmentData {
  content: WebhookContent
  posterUrl: string | undefined
  guids: string[]
  tmdbUrl: string | undefined
  episodeDetails: MediaNotification['episodeDetails']
}

export type NotificationTypeInfo = NonNullable<
  ReturnType<typeof determineNotificationType>
>

export function determineNotificationType(
  mediaInfo: MediaInfo,
  isBulkRelease: boolean,
): {
  contentType: 'movie' | 'season' | 'episode'
  seasonNumber?: number
  episodeNumber?: number
} | null {
  if (mediaInfo.type === 'movie') {
    return { contentType: 'movie' }
  }

  if (mediaInfo.type === 'show' && mediaInfo.episodes?.length) {
    if (isBulkRelease) {
      return {
        contentType: 'season',
        seasonNumber: mediaInfo.episodes[0].seasonNumber,
      }
    }
    return {
      contentType: 'episode',
      seasonNumber: mediaInfo.episodes[0].seasonNumber,
      episodeNumber: mediaInfo.episodes[0].episodeNumber,
    }
  }

  return null
}

export function getPublicContentNotificationFlags(
  config: Config['publicContentNotifications'],
): { hasDiscordUrls: boolean; hasAppriseUrls: boolean } {
  return {
    hasDiscordUrls: Boolean(
      config?.discordWebhookUrls?.length ||
        config?.discordWebhookUrlsMovies?.length ||
        config?.discordWebhookUrlsShows?.length,
    ),
    hasAppriseUrls: Boolean(
      config?.appriseUrls?.length ||
        config?.appriseUrlsMovies?.length ||
        config?.appriseUrlsShows?.length,
    ),
  }
}

export const PUBLIC_USER_ID = -1

export function extractUserDiscordIds(
  notifications: NotificationResult[],
): string[] {
  return Array.from(
    new Set(
      notifications
        .map((r) =>
          r.user.id !== PUBLIC_USER_ID &&
          r.user.discord_id &&
          r.user.discord_id.trim() !== '' &&
          r.user.notify_discord_mention
            ? r.user.discord_id
            : null,
        )
        .filter((id): id is string => id !== null),
    ),
  )
}

function mergeGuids(watchlistItems: TokenWatchlistItem[]): string[] {
  const guids = new Set<string>()
  for (const item of watchlistItems) {
    for (const guid of parseGuids(item.guids)) {
      guids.add(guid)
    }
  }
  return Array.from(guids)
}

function episodeDetailsFor(
  mediaInfo: MediaInfo,
  typeInfo: NotificationTypeInfo,
): MediaNotification['episodeDetails'] {
  if (
    typeInfo.contentType === 'season' &&
    typeInfo.seasonNumber !== undefined
  ) {
    return { seasonNumber: typeInfo.seasonNumber }
  }
  const episode = mediaInfo.episodes?.[0]
  if (typeInfo.contentType !== 'episode' || !episode) return undefined
  return {
    title: episode.title,
    ...(episode.overview && { overview: episode.overview }),
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    airDateUtc: episode.airDateUtc,
  }
}

export function buildEnrichment(
  mediaInfo: MediaInfo,
  typeInfo: NotificationTypeInfo,
  watchlistItems: TokenWatchlistItem[],
): EnrichmentData {
  const rawThumb = watchlistItems.find((item) => item.thumb)?.thumb
  const guids = mergeGuids(watchlistItems)
  const episodeDetails = episodeDetailsFor(mediaInfo, typeInfo)
  const content = buildContentPayload({
    title: mediaInfo.title,
    type: mediaInfo.type,
    key: watchlistItems[0].key,
    guids,
    thumb: rawThumb,
  })
  return {
    content,
    posterUrl: content.posterUrl,
    guids,
    tmdbUrl: getTmdbUrl(guids, mediaInfo.type, episodeDetails),
    episodeDetails,
  }
}
