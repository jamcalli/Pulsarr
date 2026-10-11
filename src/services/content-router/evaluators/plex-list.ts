import { ROUTER_FIELDS } from '@root/schemas/content-router/router-fields.js'
import { isString } from '@utils/type-guards.js'
import { defineField } from './define-field.js'
import { foldTrimLower } from './text.js'

export const plexList = defineField(ROUTER_FIELDS.plexList, {
  extract: ({ listMemberships }) =>
    listMemberships ? [...listMemberships] : undefined,
  compare: (names, operator, value) => {
    if (!isString(value)) return false
    const listName = foldTrimLower(value)
    const nameContains = () => names.some((name) => name.includes(listName))
    switch (operator) {
      case 'equals':
        return names.includes(listName)
      case 'notEquals':
        return !names.includes(listName)
      case 'contains':
        return nameContains()
      case 'notContains':
        return !nameContains()
      default:
        return false
    }
  },
})
