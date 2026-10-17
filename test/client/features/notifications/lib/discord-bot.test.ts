import {
  botRestartNeeded,
  dmUnavailableReason,
  matchRecipients,
} from '@/features/notifications/lib/discord-bot'

describe('discord bot', () => {
  it.each([
    ['running', null],
    ['starting', 'Wait for the bot to finish starting.'],
    ['stopping', 'Start the bot to send direct messages.'],
    ['stopped', 'Start the bot to send direct messages.'],
    [null, 'Start the bot to send direct messages.'],
  ] as const)('gives the test message reason while %s', (status, reason) => {
    expect(dmUnavailableReason(status)).toBe(reason)
  })

  it('needs a restart only for a live bot with unsaved credentials', () => {
    expect(botRestartNeeded('running', true)).toBe(true)
    expect(botRestartNeeded('starting', true)).toBe(true)
    expect(botRestartNeeded('running', false)).toBe(false)
    expect(botRestartNeeded('stopped', true)).toBe(false)
  })

  it('matches recipients by name or Discord ID', () => {
    const recipients = [
      { discordId: '284519736420163584', name: 'Riley' },
      { discordId: '311852004712464384', name: 'Sam' },
    ]
    expect(matchRecipients(recipients, 'ril', false)).toEqual([recipients[0]])
    expect(matchRecipients(recipients, '3118', false)).toEqual([recipients[1]])
    expect(matchRecipients(recipients, 'nobody', false)).toEqual([])
    expect(matchRecipients(recipients, 'Riley', true)).toEqual(recipients)
    expect(matchRecipients(recipients, ' ', false)).toEqual(recipients)
  })
})
