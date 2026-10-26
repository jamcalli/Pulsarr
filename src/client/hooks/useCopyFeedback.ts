import { useState } from 'react'
import { useTransientFlag } from '@/hooks/useTransientFlag'
import { copyText } from '@/lib/clipboard'
import { COPY_FEEDBACK_DELAY } from '@/lib/constants'

export const COPIED_LABEL = 'Copied'

export function useCopyFeedback() {
  const [done, setDone] = useState(false)
  const copied = useTransientFlag(done, COPY_FEEDBACK_DELAY)

  return {
    copied,
    copy: async (text: string) => {
      setDone(false)
      setDone(await copyText(text))
    },
  }
}
