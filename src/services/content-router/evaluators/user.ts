import { ROUTER_FIELDS } from '@root/schemas/content-router/router-fields.js'
import { defineField } from './define-field.js'

export const user = defineField(ROUTER_FIELDS.user, {
  extract: (_item, { userId, userName }) =>
    userId || userName ? { userId, userName } : undefined,
})
