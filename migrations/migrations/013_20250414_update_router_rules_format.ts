import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(knex, '013_20250414_update_router_rules_format')
  ) {
    return
  }
  const result = await knex('router_rules')
    .whereNot('type', 'conditional')
    .count<[{ count: number }]>('* as count')
    .first()

  const totalCount = Number(result?.count ?? 0)
  console.log(`Found ${totalCount} router rules to update to new format`)

  const CHUNK_SIZE = 100
  let processed = 0

  while (true) {
    const rules = await knex('router_rules')
      .whereNot('type', 'conditional')
      .limit(CHUNK_SIZE)
      .offset(processed)
      .select('*')

    if (rules.length === 0) break

    for (const rule of rules) {
      try {
        const criteria =
          typeof rule.criteria === 'string'
            ? JSON.parse(rule.criteria)
            : rule.criteria

        if (!criteria) {
          console.log(`Rule ID ${rule.id} has no criteria, skipping`)
          continue
        }

        const newCriteria: {
          condition: {
            field: string
            operator: string
            value: unknown
            negate?: boolean
          } | null
        } = {
          condition: null,
        }

        switch (rule.type) {
          case 'genre':
            if (criteria.genre) {
              newCriteria.condition = {
                field: 'genres',
                operator: 'in',
                value: Array.isArray(criteria.genre)
                  ? criteria.genre
                  : [criteria.genre],
              }
            }
            break

          case 'year':
            if (criteria.year) {
              const yearValue = criteria.year

              if (typeof yearValue === 'number') {
                newCriteria.condition = {
                  field: 'year',
                  operator: 'equals',
                  value: yearValue,
                }
              } else if (
                typeof yearValue === 'object' &&
                (yearValue.min !== undefined || yearValue.max !== undefined)
              ) {
                newCriteria.condition = {
                  field: 'year',
                  operator: 'between',
                  value: yearValue,
                }
              } else if (Array.isArray(yearValue)) {
                newCriteria.condition = {
                  field: 'year',
                  operator: 'in',
                  value: yearValue,
                }
              }
            }
            break

          case 'language': {
            const lang = criteria.originalLanguage ?? criteria.language
            if (lang) {
              newCriteria.condition = {
                field: 'language',
                operator: 'in',
                value: Array.isArray(lang) ? lang : [lang],
              }
            }
            break
          }

          case 'user':
            if (criteria.users) {
              newCriteria.condition = {
                field: 'user',
                operator: 'in',
                value: Array.isArray(criteria.users)
                  ? criteria.users
                  : [criteria.users],
              }
            }
            break

          default: {
            console.log(
              `Unknown rule type: ${rule.type} for rule ID ${rule.id}`,
            )
            // Fallback for unknown types to maintain compatibility
            const firstKey = Object.keys(criteria)[0]
            const firstValue = criteria[firstKey]
            if (firstKey && firstValue !== undefined) {
              newCriteria.condition = {
                field: firstKey ?? rule.type,
                operator: 'equals',
                value: firstValue,
              }
            }
          }
        }

        if (!newCriteria.condition) {
          console.log(
            `Could not create condition for rule ID ${rule.id}, skipping`,
          )
          continue
        }

        await knex('router_rules')
          .where('id', rule.id)
          .update({
            criteria: JSON.stringify(newCriteria),
            updated_at: new Date().toISOString(),
          })

        console.log(`Updated rule ID ${rule.id} (${rule.name}) to new format`)
      } catch (error) {
        console.error(`Error updating rule ID ${rule.id}:`, error)
      }
    }

    processed += rules.length
    console.log(`Processed ${processed}/${totalCount} rules`)
  }
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  const result = await knex('router_rules')
    .whereNot('type', 'conditional')
    .count<[{ count: number }]>('* as count')
    .first()

  const totalCount = Number(result?.count ?? 0)
  console.log(`Found ${totalCount} router rules to revert to old format`)

  const CHUNK_SIZE = 100
  let processed = 0

  while (true) {
    const rules = await knex('router_rules')
      .whereNot('type', 'conditional')
      .limit(CHUNK_SIZE)
      .offset(processed)
      .select('*')

    if (rules.length === 0) break

    for (const rule of rules) {
      try {
        const criteria =
          typeof rule.criteria === 'string'
            ? JSON.parse(rule.criteria)
            : rule.criteria

        if (!criteria?.condition) continue

        const originalCriteria: Record<string, unknown> = {}
        const condition = criteria.condition

        switch (rule.type) {
          case 'genre':
            originalCriteria.genre = condition.value
            break
          case 'year':
            originalCriteria.year = condition.value
            break
          case 'language':
            originalCriteria.originalLanguage = condition.value
            break
          case 'user':
            originalCriteria.users = condition.value
            break
          default:
            // Fallback: reconstruct using the field name
            if (condition.field) {
              originalCriteria[condition.field] = condition.value
            }
        }

        await knex('router_rules')
          .where('id', rule.id)
          .update({
            criteria: JSON.stringify(originalCriteria),
            updated_at: new Date().toISOString(),
          })

        console.log(`Reverted rule ID ${rule.id} (${rule.name}) to old format`)
      } catch (error) {
        console.error(`Error reverting rule ID ${rule.id}:`, error)
      }
    }

    processed += rules.length
    console.log(`Processed ${processed}/${totalCount} rules`)
  }
}
