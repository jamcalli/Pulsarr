import { ROUTER_FIELDS } from '@root/schemas/content-router/router-fields.js'
import {
  isRadarrResponse,
  isSonarrResponse,
} from '@root/types/content-lookup.types.js'
import { defineField } from './define-field.js'

export const language = defineField(ROUTER_FIELDS.language, {
  extract: ({ metadata }) => {
    if (!isRadarrResponse(metadata) && !isSonarrResponse(metadata)) {
      return undefined
    }
    return metadata.originalLanguage?.name || undefined
  },
})
