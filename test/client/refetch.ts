import type { QueryKey } from '@tanstack/react-query'
import { act } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { queryClient } from '@/lib/queryClient'

export function serverError() {
  return HttpResponse.json(
    { statusCode: 500, error: 'Internal Server Error', message: 'Down' },
    { status: 500 },
  )
}

/** Resolves once the refetch settled and components rendered its result, one tick past the query cache's batched notify. */
export async function refetchAndRender(queryKey?: QueryKey) {
  await act(async () => {
    await queryClient.refetchQueries(queryKey ? { queryKey } : undefined)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
