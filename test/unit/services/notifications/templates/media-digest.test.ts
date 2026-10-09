import type { MediaDigestEntry } from '@root/types/discord.types.js'
import { createMediaDigestHtml } from '@services/notifications/templates/apprise-html.js'
import {
  createMediaDigestEmbed,
  EMBED_COLOR,
} from '@services/notifications/templates/discord-embeds.js'
import { describe, expect, it } from 'vitest'

const show: MediaDigestEntry = {
  type: 'show',
  title: 'Show X',
  detail: 'S02E01–E08',
  posterUrl: 'https://img/show.jpg',
  tmdbUrl: 'https://www.themoviedb.org/tv/1',
}

const movie: MediaDigestEntry = {
  type: 'movie',
  title: 'Movie <Y>',
  posterUrl: 'https://img/movie.jpg',
}

describe('createMediaDigestEmbed', () => {
  it('renders one show as a card with the episode range', () => {
    const embed = createMediaDigestEmbed([show])

    expect(embed.title).toBe('Show X')
    expect(embed.description).toBe('New episodes available for Show X! 📺')
    expect(embed.color).toBe(EMBED_COLOR)
    expect(embed.image).toEqual({ url: 'https://img/show.jpg' })
    expect(embed.fields).toEqual([
      { name: 'Episodes', value: 'S02E01–E08', inline: false },
      {
        name: 'More Info',
        value: '[View on TMDB](https://www.themoviedb.org/tv/1)',
        inline: true,
      },
    ])
  })

  it('lists several titles in one embed', () => {
    const embed = createMediaDigestEmbed([show, movie])

    expect(embed.title).toBe('2 new titles available')
    expect(embed.description).toBe(
      '📺 **[Show X](https://www.themoviedb.org/tv/1)** — S02E01–E08\n🎬 **Movie <Y>**',
    )
    expect(embed.thumbnail).toEqual({ url: 'https://img/show.jpg' })
    expect(embed.image).toBeUndefined()
  })

  it('escapes markdown in titles', () => {
    const embed = createMediaDigestEmbed([
      { type: 'movie', title: 'Mr_Robot*' },
      movie,
    ])
    expect(embed.description).toContain('**Mr\\_Robot\\***')
  })

  it('stays within the description limit and counts what was left out', () => {
    const entries: MediaDigestEntry[] = Array.from({ length: 200 }, (_, i) => ({
      type: 'show',
      title: `A fairly long show title number ${i}`,
      detail: 'S01E01–E10',
    }))
    const embed = createMediaDigestEmbed(entries)
    const description = embed.description ?? ''

    expect(description.length).toBeLessThanOrEqual(4096)
    const shown = description.split('\n').filter((l) => l.startsWith('📺'))
    expect(description).toMatch(
      new RegExp(`…and ${entries.length - shown.length} more$`),
    )
  })
})

describe('createMediaDigestHtml', () => {
  it('renders one show with its episode range', () => {
    const { title, textBody, htmlBody } = createMediaDigestHtml([show])

    expect(title).toBe('📺 Show X')
    expect(textBody).toBe(
      'New Episodes Available\n\nShow X\nEpisodes: S02E01–E08\nTMDB: https://www.themoviedb.org/tv/1',
    )
    expect(htmlBody).toContain('S02E01–E08')
    expect(htmlBody).toContain('https://img/show.jpg')
  })

  it('renders several titles as one digest', () => {
    const { title, textBody, htmlBody } = createMediaDigestHtml([show, movie])

    expect(title).toBe('🍿 2 New Titles Available')
    expect(textBody).toBe(
      '2 New Titles Available\n\n📺 Show X — S02E01–E08\n   TMDB: https://www.themoviedb.org/tv/1\n🎬 Movie <Y>',
    )
    expect(htmlBody).toContain('2 New Titles Available')
    expect(htmlBody).toContain('Movie &lt;Y&gt;')
    expect(htmlBody).not.toContain('Movie <Y>')
  })
})
