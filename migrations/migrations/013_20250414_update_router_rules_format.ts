import type { Knex } from 'knex'

/**
 * Migrates router rules to a new predicate-based criteria format.
 *
 * Replaces the entire `criteria` field of each non-conditional router rule with a standardized structure containing a single `condition` object, mapping existing rule types and values to evaluator-compatible fields and operators. Multi-select fields are normalized to arrays, and unknown rule types are handled with a generic fallback.
 *
 * @remark
 * Rules with missing or unrecognized criteria are skipped. Errors during individual rule processing are logged and do not halt the migration.
 */
export async function up(knex: Knex): Promise<void> {
  // Get all router rules that need updating (non-conditional rules)
  const rules = await knex('router_rules')
    .whereNot('type', 'conditional')
    .select('*')
  
  console.log(`Found ${rules.length} router rules to update to new format`)
  
  // Process each rule
  for (const rule of rules) {
    try {
      // Parse criteria
      let criteria = typeof rule.criteria === 'string' 
        ? JSON.parse(rule.criteria) 
        : rule.criteria

      if (!criteria) {
        console.log(`Rule ID ${rule.id} has no criteria, skipping`)
        continue
      }

      // Define a new criteria object with only the condition property
      let newCriteria: { condition: { field: string; operator: string; value: any; negate?: boolean } | null } = {
        condition: null
      }

      // Convert based on rule type
      switch (rule.type) {
        case 'genre':
          if (criteria.genre) {
            // Create a genre condition - use 'genre' field to match the evaluator's expectations
            newCriteria.condition = {
              field: 'genre', // Changed from 'genres' to match genre-evaluator.ts
              operator: 'in',
              value: Array.isArray(criteria.genre) ? criteria.genre : [criteria.genre]
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
                value: yearValue
              }
            } else if (typeof yearValue === 'object' && (yearValue.min !== undefined || yearValue.max !== undefined)) {
              // Year range condition
              newCriteria.condition = {
                field: 'year',
                operator: 'between',
                value: yearValue
              }
            } else if (Array.isArray(yearValue)) {
              // List of years
              newCriteria.condition = {
                field: 'year',
                operator: 'in',
                value: yearValue
              }
            }
          }
          break
          
        case 'language':
          if (criteria.originalLanguage) {
            // Language condition - use 'language' field to match language-evaluator.ts
            newCriteria.condition = {
              field: 'language', // Changed from 'originalLanguage' to match evaluator
              operator: 'in',
              value: Array.isArray(criteria.originalLanguage) 
                ? criteria.originalLanguage 
                : [criteria.originalLanguage]
            }
          }
          break
          
        case 'user':
          if (criteria.users) {
            // User condition
            newCriteria.condition = {
              field: 'user',
              operator: 'in',
              value: Array.isArray(criteria.users) ? criteria.users : [criteria.users]
            }
          }
          break
          
        default:
          console.log(`Unknown rule type: ${rule.type} for rule ID ${rule.id}`)
          // Create a generic condition for unknown types to maintain compatibility
          const firstKey = Object.keys(criteria)[0]
          const firstValue = criteria[firstKey]
          if (firstKey && firstValue !== undefined) {
            newCriteria.condition = {
              field: rule.type,
              operator: 'equals',
              value: firstValue
            }
          }
      }

      if (!newCriteria.condition) {
        console.log(`Could not create condition for rule ID ${rule.id}, skipping`)
        continue
      }

      // Update the rule in the database - COMPLETELY REPLACE the criteria
      await knex('router_rules')
        .where('id', rule.id)
        .update({
          criteria: JSON.stringify(newCriteria),
          updated_at: new Date().toISOString()
        })
      
      console.log(`Updated rule ID ${rule.id} (${rule.name}) to new format`)
    } catch (error) {
      console.error(`Error updating rule ID ${rule.id}:`, error)
    }
  }
}

/**
 * Reverts router rules from the predicate-based criteria format back to the original criteria structure.
 *
 * For each non-conditional router rule, reconstructs the original criteria object from the `condition` field and updates the database accordingly. Handles known rule types explicitly and uses a generic fallback for unknown types.
 */
export async function down(knex: Knex): Promise<void> {
  // Get all non-conditional rules
  const rules = await knex('router_rules')
    .whereNot('type', 'conditional')
    .select('*')
  
  console.log(`Found ${rules.length} router rules to revert to old format`)
  
  // Process each rule
  for (const rule of rules) {
    try {
      // Parse criteria
      let criteria = typeof rule.criteria === 'string' 
        ? JSON.parse(rule.criteria) 
        : rule.criteria

      if (!criteria || !criteria.condition) continue

      // Create a new criteria object based on rule type and condition
      let originalCriteria: Record<string, unknown> = {}
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
          updated_at: new Date().toISOString()
        })
      
      console.log(`Reverted rule ID ${rule.id} (${rule.name}) to old format`)
    } catch (error) {
      console.error(`Error reverting rule ID ${rule.id}:`, error)
    }
  }
}