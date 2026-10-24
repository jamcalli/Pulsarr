import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import {
  type ConfigLogLevel,
  restoreLevel,
} from '@/features/system/lib/logs/log-levels'
import {
  type InitialLines,
  parseInitialLines,
} from '@/features/system/lib/logs/log-prefs'
import { updateConfig } from '@/hooks/useConfig'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { useAppForm } from '@/lib/form'

const SAVE_ERROR = "Couldn't change the log level."

export function useLogSettings({
  savedLevel,
  initialLines,
  onInitialLinesChange,
}: {
  savedLevel: ConfigLogLevel
  initialLines: InitialLines
  onInitialLinesChange: (next: InitialLines) => void
}) {
  const [restore, setRestore] = useState(() => restoreLevel(savedLevel))
  const save = useMinLoadingMutation(
    useMutation({
      mutationFn: (logLevel: ConfigLogLevel) =>
        withMinDuration(updateConfig({ logLevel })),
    }),
  )
  const form = useAppForm({
    defaultValues: {
      logLevel: savedLevel,
      initialLines: String(initialLines),
    },
  })

  const changeLevel = (next: ConfigLogLevel) => {
    if (next === savedLevel) return
    const previous = savedLevel
    save.mutate(next, {
      onSuccess: () => setRestore((current) => restoreLevel(previous, current)),
      onError: () => form.setFieldValue('logLevel', previous),
    })
  }

  const changeInitialLines = (value: string) => {
    const next = parseInitialLines(value)
    if (next !== undefined) onInitialLinesChange(next)
  }

  return {
    form,
    restore,
    saving: save.isPending,
    errorMessage: save.isError ? SAVE_ERROR : null,
    changeLevel,
    changeInitialLines,
  }
}
