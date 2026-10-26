import type { MediaNotification } from '@root/types/notification.types.js'
import { episodeCode } from '@root/utils/episode-code.js'

export type MediaAvailability = 'episode' | 'season' | 'content' | 'movie'

export interface MediaDetail {
  label: string
  value: string
  inline: boolean
}

export interface MediaAvailableSummary {
  availability: MediaAvailability
  details: MediaDetail[]
}

export function summarizeMediaAvailable(
  notification: MediaNotification,
): MediaAvailableSummary {
  const episode = notification.episodeDetails
  if (notification.type !== 'show' || !episode) {
    return { availability: 'movie', details: [] }
  }

  if (
    episode.seasonNumber !== undefined &&
    episode.episodeNumber !== undefined
  ) {
    const episodeTitle = episode.title ? ` "${episode.title}"` : ''
    const details: MediaDetail[] = [
      {
        label: 'Episode',
        value: `${episodeCode(episode.seasonNumber, episode.episodeNumber)}${episodeTitle}`,
        inline: false,
      },
    ]
    if (episode.overview) {
      details.push({
        label: 'Overview',
        value: episode.overview,
        inline: false,
      })
    }
    if (episode.airDateUtc) {
      details.push({
        label: 'Air date',
        value: new Date(episode.airDateUtc).toLocaleDateString(),
        inline: true,
      })
    }
    return { availability: 'episode', details }
  }

  if (episode.seasonNumber !== undefined) {
    return {
      availability: 'season',
      details: [
        {
          label: 'Season added',
          value: `Season ${episode.seasonNumber}`,
          inline: true,
        },
      ],
    }
  }

  return { availability: 'content', details: [] }
}
