import { ROUTER_FIELDS } from '@root/schemas/content-router/router-fields.js'
import { defineField } from './define-field.js'

export const genres = defineField(ROUTER_FIELDS.genres, {
  extract: (item) =>
    Array.isArray(item.genres) && item.genres.length > 0
      ? item.genres
      : undefined,
})
