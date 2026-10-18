import { ContentTypeSchema } from '@root/schemas/common/content-type.schema'
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

export const CONTENT_TYPE_FILTER_OPTIONS: ReadonlyArray<{
  value: ContentType
  label: string
}> = ContentTypeSchema.options.map((value) => ({
  value,
  label: CONTENT_TYPE_PLURAL_LABELS[value],
}))
