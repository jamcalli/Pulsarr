import type { ProgressEvent } from '@root/types/progress.types.js'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useWatchlistEvents } from '@/hooks/useWatchlistEvents'
import { WATCHLIST_EVENT_COALESCE_MS } from '@/lib/constants'
import {
  dashboardStatsKeys,
  recentRequestsKeys,
  userStatsKeys,
  userWatchlistKeys,
} from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children)
}

function emitWatchlist(userIds: number[]) {
  const event: ProgressEvent = {
    operationId: 'watchlist-status',
    type: 'watchlist',
    phase: 'status',
    progress: 100,
    message: `${userIds.length} users`,
    metadata: { action: 'status', userIds },
  }
  const callbacks = useProgressStore.getState().typeSubscribers.get('watchlist')
  act(() => {
    for (const callback of callbacks ?? []) callback(event)
  })
}

function spyInvalidations() {
  const spy = vi.spyOn(queryClient, 'invalidateQueries')
  return () => spy.mock.calls.map(([filters]) => filters?.queryKey)
}

function closeWindow() {
  act(() => {
    vi.advanceTimersByTime(WATCHLIST_EVENT_COALESCE_MS)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  useProgressStore.setState({ isConnecting: true, typeSubscribers: new Map() })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  queryClient.clear()
})

describe('useWatchlistEvents', () => {
  it('refetches the user queries when the event names the user', () => {
    const invalidatedKeys = spyInvalidations()
    renderHook(() => useWatchlistEvents(5), { wrapper })

    emitWatchlist([3, 5])
    closeWindow()

    expect(invalidatedKeys()).toEqual([
      recentRequestsKeys.all,
      dashboardStatsKeys.all,
      userWatchlistKeys.byUser(5),
      userStatsKeys.byId(5),
    ])
  })

  it('refetches only the dashboard queries for another user', () => {
    const invalidatedKeys = spyInvalidations()
    renderHook(() => useWatchlistEvents(5), { wrapper })

    emitWatchlist([3])
    closeWindow()

    expect(invalidatedKeys()).toEqual([
      recentRequestsKeys.all,
      dashboardStatsKeys.all,
    ])
  })

  it('refetches once per window and again for a later event', () => {
    const invalidatedKeys = spyInvalidations()
    renderHook(() => useWatchlistEvents(5), { wrapper })

    emitWatchlist([3])
    emitWatchlist([5])
    emitWatchlist([7])
    expect(invalidatedKeys()).toEqual([])
    closeWindow()

    expect(invalidatedKeys()).toEqual([
      recentRequestsKeys.all,
      dashboardStatsKeys.all,
      userWatchlistKeys.byUser(5),
      userStatsKeys.byId(5),
    ])

    emitWatchlist([3])
    closeWindow()

    expect(invalidatedKeys()).toEqual([
      recentRequestsKeys.all,
      dashboardStatsKeys.all,
      userWatchlistKeys.byUser(5),
      userStatsKeys.byId(5),
      recentRequestsKeys.all,
      dashboardStatsKeys.all,
    ])
  })

  it('refetches the user named at flush time when the user changes inside the window', () => {
    const invalidatedKeys = spyInvalidations()
    const { rerender } = renderHook(
      ({ userId }: { userId: number }) => useWatchlistEvents(userId),
      { wrapper, initialProps: { userId: 1 } },
    )

    emitWatchlist([3])
    rerender({ userId: 2 })
    emitWatchlist([2])
    closeWindow()

    expect(invalidatedKeys()).toEqual([
      recentRequestsKeys.all,
      dashboardStatsKeys.all,
      userWatchlistKeys.byUser(2),
      userStatsKeys.byId(2),
    ])
  })

  it('drops the pending refetch on unmount', () => {
    const invalidatedKeys = spyInvalidations()
    const { unmount } = renderHook(() => useWatchlistEvents(5), { wrapper })

    emitWatchlist([5])
    unmount()
    closeWindow()

    expect(invalidatedKeys()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('unsubscribes on unmount', () => {
    const invalidatedKeys = spyInvalidations()
    const { unmount } = renderHook(() => useWatchlistEvents(5), { wrapper })
    unmount()

    emitWatchlist([5])
    closeWindow()

    expect(invalidatedKeys()).toEqual([])
  })
})
