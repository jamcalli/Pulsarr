import { useMutation } from '@tanstack/react-query'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { generateFeeds } from '@/lib/plex/plex-requests'
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
