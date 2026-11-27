import type { DbSchedule } from '@root/types/scheduler.types.js'
import { vi } from 'vitest'

type SeedSchedule = Omit<DbSchedule, 'id' | 'created_at' | 'updated_at'>
type NewSchedule = Omit<SeedSchedule, 'next_run'>
type ScheduleUpdates = Partial<
  Omit<DbSchedule, 'id' | 'name' | 'next_run' | 'created_at' | 'updated_at'>
>
type StoredSchedule = SeedSchedule & {
  id: number
  created_at: string
  updated_at: string
}

/** Map-backed stand-in for the schedule methods on `fastify.db`, storing copies the way the real rows round-trip through JSON. */
export function createScheduleDb(rows: SeedSchedule[] = []) {
  const store = new Map<string, StoredSchedule>()
  let nextId = 1

  const insert = (schedule: SeedSchedule): number => {
    const now = new Date().toISOString()
    const id = nextId++
    store.set(schedule.name, {
      ...structuredClone(schedule),
      id,
      created_at: now,
      updated_at: now,
    })
    return id
  }

  for (const row of rows) insert(row)

  return {
    getScheduleByName: vi.fn(async (name: string) => {
      const row = store.get(name)
      return row ? structuredClone(row) : null
    }),
    getAllSchedules: vi.fn(async () =>
      [...store.values()].map((row) => structuredClone(row)),
    ),
    createSchedule: vi.fn(async (schedule: NewSchedule) =>
      insert({ ...schedule, next_run: null }),
    ),
    updateSchedule: vi.fn(async (name: string, updates: ScheduleUpdates) => {
      const row = store.get(name)
      if (!row) return false
      const defined = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined),
      )
      store.set(name, {
        ...row,
        ...structuredClone(defined),
        updated_at: new Date().toISOString(),
      })
      return true
    }),
  }
}

export type ScheduleDb = ReturnType<typeof createScheduleDb>
