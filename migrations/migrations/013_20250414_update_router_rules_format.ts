import type { Knex } from 'knex'

/**
 * Properly transforms router rules to a format compatible with the new predicate system.
 *
 * This migration completely replaces the criteria structure rather than appending to it,
 * ensuring evaluators and UI components can correctly process the rules. It maintains
 * field names that match evaluator expectations and properly handles multi-select fields.
 *
 * @remark
 * Rules with missing or unrecognized criteria are not updated. Errors encountered during 
 * processing of individual rules are logged and do not interrupt the migration.
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
              field: 'genre', // Ensures field name matches genre-evaluator.ts
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
 * Reverts router rules to the previous format by extracting original criteria from the condition field.
 *
 * Reconstructs the original criteria structure by converting the condition field back to its
 * original representation based on rule type.
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