import { matchRecipients } from '@/features/notifications/lib/recipients'

describe('matchRecipients', () => {
  it('matches recipients by name or the given id', () => {
    const recipients = [
      { discordId: '284519736420163584', name: 'Riley' },
      { discordId: '311852004712464384', name: 'Sam' },
    ]
    const discordId = (recipient: (typeof recipients)[number]) =>
      recipient.discordId
    expect(matchRecipients(recipients, 'ril', false, discordId)).toEqual([
      recipients[0],
    ])
    expect(matchRecipients(recipients, '3118', false, discordId)).toEqual([
      recipients[1],
    ])
    expect(matchRecipients(recipients, 'nobody', false, discordId)).toEqual([])
    expect(matchRecipients(recipients, 'Riley', true, discordId)).toEqual(
      recipients,
    )
    expect(matchRecipients(recipients, ' ', false, discordId)).toEqual(
      recipients,
    )
  })

  it('matches on name alone without an id', () => {
    const recipients = [
      { userId: 7, name: 'Riley' },
      { userId: 8, name: 'Sam' },
    ]
    expect(matchRecipients(recipients, 'sa', false)).toEqual([recipients[1]])
    expect(matchRecipients(recipients, '7', false)).toEqual([])
  })
})
