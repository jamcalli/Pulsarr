import {
  PUBLIC_APPRISE,
  publicContentSaveError,
} from '@/features/notifications/lib/public-content'

const EMPTY = {
  enabled: true,
  discordWebhookUrls: '',
  discordWebhookUrlsMovies: '',
  discordWebhookUrlsShows: '',
  appriseUrls: '',
  appriseUrlsMovies: '',
  appriseUrlsShows: '',
}

describe('public-content', () => {
  it('checks each list with its own channel check', () => {
    expect(
      publicContentSaveError(
        {
          ...EMPTY,
          discordWebhookUrls: 'https://discord.com/api/webhooks/1/a',
          appriseUrlsShows: 'tgram://bot/chat,name@example.com',
        },
        'all',
      ),
    ).toBeNull()
    expect(
      publicContentSaveError(
        {
          ...EMPTY,
          discordWebhookUrlsMovies: 'tgram://bot/chat',
        },
        'movies',
      ),
    ).toBe(
      'Enter a Discord webhook URL starting https://discord.com/api/webhooks/.',
    )
    expect(
      publicContentSaveError(
        { ...EMPTY, appriseUrlsMovies: 'not a url' },
        'movies',
      ),
    ).toBe('Enter an Apprise URL with :// or an email address.')
  })

  it('prefixes an error on another tab with that tab label', () => {
    const values = { ...EMPTY, discordWebhookUrlsMovies: 'tgram://bot/chat' }
    expect(publicContentSaveError(values, 'all')).toBe(
      'Movies: Enter a Discord webhook URL starting https://discord.com/api/webhooks/.',
    )
    expect(publicContentSaveError(values, 'shows')).toBe(
      'Movies: Enter a Discord webhook URL starting https://discord.com/api/webhooks/.',
    )
    expect(
      publicContentSaveError({ ...EMPTY, appriseUrls: 'not a url' }, 'shows'),
    ).toBe('All content: Enter an Apprise URL with :// or an email address.')
  })

  it('skips the lists of a locked channel', () => {
    const values = { ...EMPTY, appriseUrls: 'not a url' }
    expect(publicContentSaveError(values, 'all', [PUBLIC_APPRISE])).toBeNull()
  })
})
