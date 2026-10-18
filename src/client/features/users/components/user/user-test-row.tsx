import { BusyLabel } from '@/components/busy-label'
import { ConnectionTest } from '@/components/connection-test'
import { ActionRow } from '@/components/settings/action-row'
import { Button } from '@/components/ui/button'
import { useUserChannelTest } from '@/features/users/hooks/user/useUserChannelTest'
import type { UserPageData } from '@/features/users/hooks/user/useUserPage'
import {
  USER_TEST_CHANNEL_LABELS,
  USER_TEST_CHANNELS,
  userTestChannelDisabled,
} from '@/features/users/lib/user/user-test-channels'
import { UNSAVED_CHANGES_REASON } from '@/lib/settings'

export function UserTestRow({
  user,
  dirty,
}: {
  user: UserPageData['user']
  dirty: boolean
}) {
  const test = useUserChannelTest(user.id)

  return (
    <ActionRow
      title="Send a test"
      description="Sends through the channels saved for them."
      running={test.running}
      unavailableReason={dirty ? UNSAVED_CHANGES_REASON : null}
      actions={USER_TEST_CHANNELS.map((channel) => (
        <Button
          key={channel}
          type="button"
          variant="neutral"
          size="sm"
          disabled={
            dirty || test.running || userTestChannelDisabled(user, channel)
          }
          onClick={() => test.run(channel)}
        >
          <BusyLabel
            busy={test.runningChannel === channel}
            label={USER_TEST_CHANNEL_LABELS[channel]}
            busyLabel="Sending..."
          />
        </Button>
      ))}
      result={
        <ConnectionTest size="inline" testing={false} outcome={test.outcome} />
      }
      live={
        test.running ? (
          <ConnectionTest size="inline" testing outcome={null} />
        ) : undefined
      }
    />
  )
}
