import type { Announcements, UniqueIdentifier } from '@dnd-kit/core'
import { dragAnnouncements } from '@/lib/drag-announcements'

/** Screen reader text for route drags, naming routes and their positions instead of the kanban's internal keys. */
export function routeAnnouncements(
  orderedIds: readonly number[],
  names: ReadonlyMap<number, string>,
): Announcements {
  const routeId = (id: UniqueIdentifier) =>
    orderedIds.find((route) => route === id)
  const subject = (id: UniqueIdentifier) => {
    const route = routeId(id)
    return (route === undefined ? undefined : names.get(route)) ?? 'The route'
  }
  const placement = (_active: UniqueIdentifier, over: UniqueIdentifier) => {
    const route = routeId(over)
    return route === undefined
      ? null
      : `at position ${orderedIds.indexOf(route) + 1} of ${orderedIds.length}`
  }

  return dragAnnouncements({ subject, placement })
}
