import {
  appriseRowError,
  discordWebhookRowError,
  firstRowError,
} from '@/lib/notification-urls'

const WEBHOOK = 'https://discord.com/api/webhooks/1/token'

describe('notification urls', () => {
  it('accepts Discord webhook URLs only', () => {
    expect(discordWebhookRowError(WEBHOOK)).toBeNull()
    expect(discordWebhookRowError('https://discord.com/api/webhook/1')).toBe(
      'Enter a Discord webhook URL starting https://discord.com/api/webhooks/.',
    )
  })

  it('accepts Apprise URLs and plain email addresses', () => {
    expect(appriseRowError('tgram://bot/chat')).toBeNull()
    expect(appriseRowError('admin@example.com')).toBeNull()
    expect(appriseRowError('example.com')).toBe(
      'Enter an Apprise URL with :// or an email address.',
    )
  })

  it('reports the first bad entry in a saved list', () => {
    expect(
      firstRowError(`${WEBHOOK}, nope, also-bad`, discordWebhookRowError),
    ).toBe(
      'Enter a Discord webhook URL starting https://discord.com/api/webhooks/.',
    )
    expect(firstRowError(`${WEBHOOK},`, discordWebhookRowError)).toBeNull()
    expect(firstRowError('', discordWebhookRowError)).toBeNull()
  })
})
