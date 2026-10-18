import { useState } from 'react'
import type { InlineTestOutcome } from '@/components/connection-test'
import { useSendTest } from '@/hooks/useSendTest'
import type { components } from '@/types/api.js'

export type TypedRecipient<Id> = { id: Id } | { error: string | null }

export interface RecipientTest<Id> {
  text: string
  picked: Id | null
  /** `edited` false keeps the pick, for the label the picker writes on an item press. */
  type: (next: string, pickedLabel: string | null, edited?: boolean) => void
  pick: (id: Id | null) => void
  clear: () => void
  blur: () => void
  valid: boolean
  idError: string | null
  testing: boolean
  outcome: InlineTestOutcome | null
  send: () => void
}

/** The test goes to the picked recipient, and without one to the id `parseTyped` reads from the text, so without `parseTyped` text only filters. */
export function useRecipientTest<Id>(
  send: (id: Id) => Promise<components['schemas']['TestResult']>,
  parseTyped?: (text: string) => TypedRecipient<Id>,
): RecipientTest<Id> {
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<Id | null>(null)
  const [blurred, setBlurred] = useState(false)
  const typed =
    picked === null && parseTyped && text.trim() !== ''
      ? parseTyped(text)
      : null
  const id = picked ?? (typed && 'id' in typed ? typed.id : null)
  const test = useSendTest(send, id)
  const idError = typed && 'error' in typed ? typed.error : null

  return {
    text,
    picked,
    type: (next, pickedLabel, edited = true) => {
      setText(next)
      if (edited && picked !== null && next !== pickedLabel) setPicked(null)
    },
    pick: setPicked,
    clear: () => {
      setText('')
      setPicked(null)
    },
    blur: () => setBlurred(true),
    valid: id !== null,
    idError: blurred ? idError : null,
    testing: test.testing,
    outcome: test.outcome,
    send: () => {
      if (id !== null) test.run(id)
    },
  }
}
