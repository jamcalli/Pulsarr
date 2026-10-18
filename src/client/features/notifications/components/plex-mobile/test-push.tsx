import { RecipientPickerTest } from '@/features/notifications/components/recipient-picker-test'
import {
  type RecipientUser,
  useRecipients,
} from '@/features/notifications/hooks/useRecipients'
import { useRecipientTest } from '@/features/notifications/hooks/useRecipientTest'
import type { Recipient } from '@/features/notifications/lib/recipients'
import { testUserChannel } from '@/lib/notification-tests'
import { displayName } from '@/lib/user-naming'

function toPlexRecipient(user: RecipientUser): Recipient<number> {
  return { id: user.id, name: displayName(user) }
}

function sendPush(userId: number) {
  return testUserChannel(userId, 'plex-mobile')
}

export function TestPush({
  unavailableReason,
  disabled = false,
}: {
  unavailableReason: string | null
  disabled?: boolean
}) {
  const recipients = useRecipients(toPlexRecipient)
  const test = useRecipientTest(sendPush)

  return (
    <RecipientPickerTest
      title="Send a test push"
      description="Pushes to one user's Plex app."
      recipients={recipients}
      test={test}
      placeholder="Pick a user"
      emptyText="No users yet."
      unavailableReason={unavailableReason}
      disabled={disabled}
    />
  )
}
