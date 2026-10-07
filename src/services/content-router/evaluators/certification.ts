import { ROUTER_FIELDS } from '@root/schemas/content-router/router-fields.js'
import {
  isRadarrResponse,
  isSonarrResponse,
} from '@root/types/content-lookup.types.js'
import { defineField } from './define-field.js'
import { compareText, foldUpper } from './text.js'

export const certification = defineField(ROUTER_FIELDS.certification, {
  extract: ({ metadata }) => {
    if (!isRadarrResponse(metadata) && !isSonarrResponse(metadata)) {
      return undefined
    }
    return metadata.certification || undefined
  },
  compare: (actual, operator, value, { log, label }) =>
    compareText(actual, operator, value, foldUpper, log, label),
})
