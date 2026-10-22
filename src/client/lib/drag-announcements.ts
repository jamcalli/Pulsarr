import type { Announcements, UniqueIdentifier } from '@dnd-kit/core'

interface DragAnnouncementParts {
  subject: (id: UniqueIdentifier) => string
  /** Returns the placement with its connecting word, or null when nothing useful can be said. */
  placement: (active: UniqueIdentifier, over: UniqueIdentifier) => string | null
}

export function dragAnnouncements({
  subject,
  placement,
}: DragAnnouncementParts): Announcements {
  return {
    onDragStart: ({ active }) => `Picked up ${subject(active.id)}.`,
    onDragOver: ({ active, over }) => {
      const at = over && placement(active.id, over.id)
      return at ? `${subject(active.id)} is now ${at}.` : undefined
    },
    onDragEnd: ({ active, over }) => {
      const at = over && placement(active.id, over.id)
      return at
        ? `${subject(active.id)} was dropped ${at}.`
        : `${subject(active.id)} was dropped back where it was.`
    },
    onDragCancel: ({ active }) =>
      `Move cancelled. ${subject(active.id)} went back where it was.`,
  }
}
