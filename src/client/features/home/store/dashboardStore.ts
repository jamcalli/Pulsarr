import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

/**
 * Available date range presets for dashboard stats
 * 0 = all time (no date filter)
 */
export const DATE_RANGE_PRESETS = [7, 30, 90, 0] as const
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number]

/**
 * Available limit presets for dashboard stats
 */
export const LIMIT_PRESETS = [5, 10, 25, 50] as const
export type LimitPreset = (typeof LIMIT_PRESETS)[number]

/**
 * Get display label for a date range preset
 */
export function getDateRangeLabel(days: number): string {
  return days === 0 ? 'All time' : `Last ${days} days`
}

/**
 * Get display label for a limit preset
 */
export function getLimitLabel(limit: number): string {
  return `${limit} items`
}

interface DashboardFilterState {
  days: number
  limit: number
  setDays: (days: number) => void
  setLimit: (limit: number) => void
}

/**
 * Minimal store for dashboard filter parameters.
 *
 * Data fetching and caching is handled by React Query.
 * This store only holds the filter state that needs to be
 * shared across all dashboard hooks.
 */
export const useDashboardStore = create<DashboardFilterState>()(
  devtools((set) => ({
    days: 30,
    limit: 10,
    setDays: (days) => set({ days }),
    setLimit: (limit) => set({ limit }),
  })),
)
