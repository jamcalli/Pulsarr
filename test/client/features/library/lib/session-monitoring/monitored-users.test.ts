import { monitoredUserOptions } from '@/features/library/lib/session-monitoring/monitored-users'

describe('monitoredUserOptions', () => {
  it('keys by user id and adds the username to a shared display name', () => {
    expect(
      monitoredUserOptions([
        { id: 1, name: 'Maya R.', username: 'mayar88' },
        { id: 2, name: 'Lukas', username: 'lukas.admin' },
        { id: 3, name: 'Maya R.', username: 'maya.rivera' },
      ]),
    ).toEqual([
      { value: '1', label: 'Maya R. (mayar88)' },
      { value: '2', label: 'Lukas' },
      { value: '3', label: 'Maya R. (maya.rivera)' },
    ])
  })
})
