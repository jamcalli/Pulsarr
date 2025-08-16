import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Migrates all non-conditional router rules to a standardized predicate-based criteria format.
 *
 * For each applicable rule, replaces the `criteria` field with a JSON object containing a single `condition` property, mapping known rule types (`genre`, `year`, `language`, `user`) to evaluator-compatible fields and operators. Multi-value fields are normalized to arrays, and unknown types are handled with a generic fallback condition.
 *
 * @remark
 * Rules with missing or unrecognized criteria are skipped. Errors encountered during individual rule processing are logged and do not interrupt the migration process.
 */
export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(knex, '013_20250414_update_router_rules_format')
  ) {
    return
  }
  // Get total count for logging
  const result = await knex('router_rules')
    .whereNot('type', 'conditional')
    .count<[{ count: number }]>('* as count')
    .first()

  const totalCount = Number(result?.count ?? 0)
  console.log(`Found ${totalCount} router rules to update to new format`)

  // Process in chunks of 100
  const CHUNK_SIZE = 100
  let processed = 0

  while (true) {
    const rules = await knex('router_rules')
      .whereNot('type', 'conditional')
      .limit(CHUNK_SIZE)
      .offset(processed)
      .select('*')

    if (rules.length === 0) break

    // Process each rule in the chunk
    for (const rule of rules) {
      try {
        // Parse criteria
        const criteria =
          typeof rule.criteria === 'string'
            ? JSON.parse(rule.criteria)
            : rule.criteria

        if (!criteria) {
          console.log(`Rule ID ${rule.id} has no criteria, skipping`)
          continue
        }

        // Define a new criteria object with only the condition property
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

        // Convert based on rule type
        switch (rule.type) {
          case 'genre':
            if (criteria.genre) {
              // Create a genre condition - use 'genre' field to match the evaluator's expectations
              newCriteria.condition = {
                field: 'genres', // Ensures field name matches genre-evaluator.ts
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
                // Simple year equals condition
                newCriteria.condition = {
                  field: 'year',
                  operator: 'equals',
                  value: yearValue,
                }
              } else if (
                typeof yearValue === 'object' &&
                (yearValue.min !== undefined || yearValue.max !== undefined)
              ) {
                // Year range condition
                newCriteria.condition = {
                  field: 'year',
                  operator: 'between',
                  value: yearValue,
                }
              } else if (Array.isArray(yearValue)) {
                // List of years
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
              // Language condition - use 'language' field to match language-evaluator.ts
              newCriteria.condition = {
                field: 'language', // Standardized field name to match evaluator
                operator: 'in',
                value: Array.isArray(lang) ? lang : [lang],
              }
            }
            break
          }

          case 'user':
            if (criteria.users) {
              // User condition
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
            // Create a generic condition for unknown types to maintain compatibility
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

        // Update the rule in the database - COMPLETELY REPLACE the criteria
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

/**
 * Reverts router rules from the predicate-based criteria format to their original criteria structure.
 *
 * For each non-conditional rule, reconstructs the original criteria object from the `condition` property and updates the database. Known rule types are mapped to their original keys; unknown types use the condition's field name as the key.
 */
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

    // Process chunk...
    for (const rule of rules) {
      try {
        // Parse criteria
        const criteria =
          typeof rule.criteria === 'string'
            ? JSON.parse(rule.criteria)
            : rule.criteria

        if (!criteria || !criteria.condition) continue

        // Create a new criteria object based on rule type and condition
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
            // For unknown types, try to reconstruct using the field name
            if (condition.field) {
              originalCriteria[condition.field] = condition.value
            }
        }

        // Update the rule in the database with the original criteria format
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
