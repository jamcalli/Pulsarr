import type { Query } from '@tanstack/react-query'
import { toast } from '@/components/ui/toast'
import { notifyBackgroundRefreshError } from '@/lib/queryClient'

vi.mock('@/components/ui/toast', () => ({ toast: { add: vi.fn() } }))

function queryWith(data: unknown): Pick<Query<unknown, unknown>, 'state'> {
  return { state: { data } } as Pick<Query<unknown, unknown>, 'state'>
}

describe('notifyBackgroundRefreshError', () => {
  beforeEach(() => {
    vi.mocked(toast.add).mockClear()
  })

  it('stays quiet when the query never loaded', () => {
    notifyBackgroundRefreshError(new Error('down'), queryWith(undefined))
    expect(toast.add).not.toHaveBeenCalled()
  })

  it('toasts a failed refresh of loaded data with the API message', () => {
    notifyBackgroundRefreshError(
      {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Database is locked',
      },
      queryWith({ items: [] }),
    )
    expect(toast.add).toHaveBeenCalledWith({
      id: 'background-refresh-error',
      type: 'error',
      title: 'Could not refresh. Showing the last loaded data.',
      description: 'Database is locked',
    })
  })

  it('uses one toast id so several failing queries do not stack', () => {
    notifyBackgroundRefreshError(new Error('a'), queryWith(1))
    notifyBackgroundRefreshError(new Error('b'), queryWith(2))
    const ids = vi.mocked(toast.add).mock.calls.map(([options]) => options.id)
    expect(ids).toEqual([
      'background-refresh-error',
      'background-refresh-error',
    ])
  })
})
