import type { components } from '@/types/api.js'

type ContentType = components['schemas']['ContentType']

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  movie: 'Movie',
  show: 'Show',
}

export const CONTENT_TYPE_PLURAL_LABELS: Record<ContentType, string> = {
  movie: 'Movies',
  show: 'Shows',
}
