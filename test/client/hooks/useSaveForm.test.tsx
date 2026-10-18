import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { useSaveForm } from '@/hooks/useSaveForm'

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

interface Values {
  name: string
}

const schema = z.object({ name: z.string().min(1) })

function renderSaveForm(save: (values: Values) => Promise<unknown>) {
  return renderHook(
    () =>
      useSaveForm({
        source: { name: 'saved' },
        toValues: (source: Values) => source,
        save,
        latest: () => null,
        schema,
        saveErrorFallback: 'Not saved.',
      }),
    { wrapper: wrapperFor(new QueryClient()) },
  )
}

async function edit(
  result: { current: ReturnType<typeof renderSaveForm>['result']['current'] },
  name: string,
) {
  act(() => result.current.form.setFieldValue('name', name))
  await waitFor(() => expect(result.current.dirty).toBe(true))
}

describe('useSaveForm submit', () => {
  it('resolves false without saving when the form is clean', async () => {
    const save = vi.fn(async () => undefined)
    const { result } = renderSaveForm(save)

    let outcome: boolean | undefined
    await act(async () => {
      outcome = await result.current.submit()
    })

    expect(outcome).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })

  it('resolves true once the save succeeds', async () => {
    const save = vi.fn(async () => undefined)
    const { result } = renderSaveForm(save)
    await edit(result, 'changed')

    let outcome: boolean | undefined
    await act(async () => {
      outcome = await result.current.submit()
    })

    expect(outcome).toBe(true)
    expect(save).toHaveBeenCalledWith({ name: 'changed' })
  })

  it('resolves false and keeps the error when the save fails', async () => {
    const save = vi.fn(async () => {
      throw new Error('boom')
    })
    const { result } = renderSaveForm(save)
    await edit(result, 'changed')

    let outcome: boolean | undefined
    await act(async () => {
      outcome = await result.current.submit()
    })

    expect(outcome).toBe(false)
    expect(save).toHaveBeenCalledOnce()
    await waitFor(() => expect(result.current.errorMessage).not.toBeNull())
    expect(result.current.dirty).toBe(true)
  })

  it('resolves false without saving when validation blocks the submit', async () => {
    const save = vi.fn(async () => undefined)
    const { result } = renderSaveForm(save)
    await edit(result, '')

    let outcome: boolean | undefined
    await act(async () => {
      outcome = await result.current.submit()
    })

    expect(outcome).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })
})
