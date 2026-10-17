import { useMutation } from '@tanstack/react-query'
import { withMinDuration } from '@/hooks/useMinLoading'
import {
  apiFetch,
  mutationErrorMessage,
  requireSuccess,
} from '@/lib/tanstackApi'

async function controlBot(action: 'start' | 'stop') {
  const { data, error } =
    action === 'start'
      ? await apiFetch.POST('/v1/notifications/discordstart')
      : await apiFetch.POST('/v1/notifications/discordstop')
  if (error) throw error
  return requireSuccess(data)
}

/** The live status arrives on the progress stream, so a request only reports whether the bot accepted it. */
export function useDiscordBotControl() {
  const mutation = useMutation({
    mutationFn: (action: 'start' | 'stop') =>
      withMinDuration(controlBot(action)),
  })

  return {
    pending: mutation.isPending,
    errorMessage: mutation.error
      ? mutationErrorMessage(
          mutation.error,
          'The bot did not respond. Try again.',
        )
      : null,
    start: () => mutation.mutate('start'),
    stop: () => mutation.mutate('stop'),
  }
}
