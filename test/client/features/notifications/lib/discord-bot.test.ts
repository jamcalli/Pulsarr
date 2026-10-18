import {
  botRestartNeeded,
  dmUnavailableReason,
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
})
