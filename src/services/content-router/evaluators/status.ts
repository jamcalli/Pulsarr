import { ROUTER_FIELDS } from '@root/schemas/content-router/router-fields.js'
import {
  isRadarrResponse,
  isSonarrResponse,
} from '@root/types/content-lookup.types.js'
import { defineField } from './define-field.js'

export const movieStatus = defineField(ROUTER_FIELDS.movieStatus, {
  extract: ({ metadata }, context) =>
    context.contentType === 'movie' && isRadarrResponse(metadata)
      ? metadata.status || undefined
      : undefined,
})

export const seriesStatus = defineField(ROUTER_FIELDS.seriesStatus, {
  extract: ({ metadata }, context) =>
    context.contentType === 'show' && isSonarrResponse(metadata)
      ? metadata.status || undefined
      : undefined,
})
