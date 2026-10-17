import { DiscordDmTestPayloadSchema } from '@root/schemas/notifications/test-notification.schema'
import { useState } from 'react'
import { useSendTest } from '@/hooks/useSendTest'
import { testDiscordDm } from '@/lib/notification-tests'

const DiscordIdSchema = DiscordDmTestPayloadSchema.shape.discordId

/** A picked user sends their saved Discord ID, and without one the typed text is the ID. */
export function useDiscordDmTest() {
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [blurred, setBlurred] = useState(false)
  const typed = DiscordIdSchema.safeParse(text)
  const id = picked ?? (typed.success ? typed.data : text.trim())
  const test = useSendTest(testDiscordDm, id)
  const idError =
    picked !== null || typed.success || id === ''
      ? null
      : (typed.error.issues[0]?.message ?? null)

  return {
    text,
    picked,
    type: (next: string, pickedLabel: string | null) => {
      setText(next)
      if (picked !== null && next !== pickedLabel) setPicked(null)
    },
    pick: setPicked,
    clear: () => {
      setText('')
      setPicked(null)
    },
    blur: () => setBlurred(true),
    valid: picked !== null || typed.success,
    idError: blurred ? idError : null,
    testing: test.testing,
    outcome: test.outcome,
    send: () => test.run(id),
  }
}
