import {
  NOTIFY_OPTION_LABELS,
  notifyOptions,
  UPDATE_NOTIFY_SELECT_OPTIONS,
} from '@/lib/notify-labels'

describe('notify labels', () => {
  it('offers the six channel options in schema order', () => {
    expect(UPDATE_NOTIFY_SELECT_OPTIONS.map((option) => option.value)).toEqual([
      'none',
      'all',
      'discord-only',
      'apprise-only',
      'webhook-only',
      'dm-only',
    ])
  })

  it('adds nothing for a stored canonical option', () => {
    expect(notifyOptions('webhook-only')).toEqual(UPDATE_NOTIFY_SELECT_OPTIONS)
  })

  it.each([
    ['discord-both', 'discord-only'],
    ['discord-webhook', 'webhook-only'],
    ['discord-message', 'dm-only'],
  ] as const)(
    'keeps the stored alias %s under the label of %s',
    (alias, equivalent) => {
      expect(notifyOptions(alias).at(-1)).toEqual({
        value: alias,
        label: NOTIFY_OPTION_LABELS[equivalent],
      })
    },
  )
})
