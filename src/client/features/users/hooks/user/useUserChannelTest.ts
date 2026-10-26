import { useState } from 'react'
import type { UserTestChannel } from '@/features/users/lib/user/user-test-channels'
import { useSendTest } from '@/hooks/useSendTest'
import { testUserChannel } from '@/lib/notification-tests'

export function useUserChannelTest(userId: number) {
  const [current, setCurrent] = useState<UserTestChannel | null>(null)
  const test = useSendTest(
    (channel: UserTestChannel) => testUserChannel(userId, channel),
    current,
  )

  return {
    run: (channel: UserTestChannel) => {
      setCurrent(channel)
      test.run(channel)
    },
    running: test.testing,
    runningChannel: test.testing ? current : null,
    outcome: test.outcome,
  }
}
