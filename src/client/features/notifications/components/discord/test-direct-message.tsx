import { DiscordDmTestPayloadSchema } from '@root/schemas/notifications/test-notification.schema'
import { RecipientPickerTest } from '@/features/notifications/components/recipient-picker-test'
import {
  type RecipientUser,
  useRecipients,
} from '@/features/notifications/hooks/useRecipients'
import {
  type TypedRecipient,
  useRecipientTest,
} from '@/features/notifications/hooks/useRecipientTest'
import { dmUnavailableReason } from '@/features/notifications/lib/discord-bot'
import type { Recipient } from '@/features/notifications/lib/recipients'
import { useDiscordBotStatus } from '@/hooks/useDiscordBotStatus'
import { testDiscordDm } from '@/lib/notification-tests'
import { displayName } from '@/lib/user-naming'

const DiscordIdSchema = DiscordDmTestPayloadSchema.shape.discordId

function toDiscordRecipient(user: RecipientUser): Recipient<string> | null {
  return user.discord_id
    ? { id: user.discord_id, name: displayName(user) }
    : null
}

function parseDiscordId(text: string): TypedRecipient<string> {
  const typed = DiscordIdSchema.safeParse(text)
  return typed.success
    ? { id: typed.data }
    : { error: typed.error.issues[0]?.message ?? null }
}

export function TestDirectMessage() {
  const status = useDiscordBotStatus()
  const recipients = useRecipients(toDiscordRecipient)
  const test = useRecipientTest(testDiscordDm, parseDiscordId)

  return (
    <RecipientPickerTest
      title="Send a test direct message"
      description="Messages one Discord user through the bot."
      recipients={recipients}
      test={test}
      placeholder="Pick a user or type a Discord ID"
      emptyText="No users have a Discord ID saved."
      typedIds
      unavailableReason={dmUnavailableReason(status)}
    />
  )
}
