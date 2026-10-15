import { useMutation } from '@tanstack/react-query'
import { generateFeeds } from '@/features/system/lib/plex-connection/plex-requests'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { mutationErrorMessage } from '@/lib/tanstackApi'

export function useGenerateFeeds() {
  const mutation = useMinLoadingMutation(
    useMutation({ mutationFn: () => withMinDuration(generateFeeds()) }),
  )

  return {
    generate: () => mutation.mutate(),
    pending: mutation.isPending,
    errorMessage: mutation.isError
      ? mutationErrorMessage(
          mutation.error,
          'The feeds were not generated. Try again.',
        )
      : null,
  }
}
