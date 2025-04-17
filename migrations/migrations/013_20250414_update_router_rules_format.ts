import type { Knex } from 'knex'

/**
 * Migrates existing router rules to include an explicit `condition` field in their criteria.
 *
 * Updates all non-conditional router rules in the `router_rules` table by transforming their `criteria` to the new format, adding a `condition` object based on the rule type. Handles various rule types such as genre, year, language, and user, and applies a generic transformation for unknown types. Rules that cannot be converted are skipped.
 *
 * @remark
 * Rules with missing or unrecognized criteria are not updated. Errors encountered during processing of individual rules are logged and do not interrupt the migration.
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

      let condition: { field: string; operator: string; value: any; negate?: boolean } | null = null

      // Convert based on rule type
      switch (rule.type) {
        case 'genre':
          if (criteria.genre) {
            // Create a genre condition
            condition = {
              field: 'genres',
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
              condition = {
                field: 'year',
                operator: 'equals',
                value: yearValue
              }
            } else if (typeof yearValue === 'object' && (yearValue.min !== undefined || yearValue.max !== undefined)) {
              // Year range condition
              condition = {
                field: 'year',
                operator: 'between',
                value: yearValue
              }
            } else if (Array.isArray(yearValue)) {
              // List of years
              condition = {
                field: 'year',
                operator: 'in',
                value: yearValue
              }
            }
          }
          break
          
        case 'language':
          if (criteria.originalLanguage) {
            // Language condition
            condition = {
              field: 'originalLanguage',
              operator: 'equals',
              value: criteria.originalLanguage
            }
          }
          break
          
        case 'user':
          if (criteria.users) {
            // User condition
            condition = {
              field: 'user',
              operator: 'in',
              value: Array.isArray(criteria.users) ? criteria.users : [criteria.users]
            }
          }
          break
          
        default:
          console.log(`Unknown rule type: ${rule.type} for rule ID ${rule.id}`)
          // Create a generic condition for unknown types to maintain compatibility
          condition = {
            field: rule.type,
            operator: 'equals',
            value: Object.values(criteria)[0] || 'placeholder'
          }
      }

      if (!condition) {
        console.log(`Could not create condition for rule ID ${rule.id}, skipping`)
        continue
      }

      // Update the criteria with the new condition format
      const newCriteria = {
        ...criteria,
        condition
      }

      // Update the rule in the database
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
 * Reverts router rules to the previous format by removing the `condition` field from the `criteria` of all non-conditional rules.
 *
 * Iterates through all router rules where the type is not `'conditional'`, removes the `condition` property from their `criteria` if present, and updates the database accordingly.
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

      if (!criteria) continue

      // Remove the condition field, preserving the original criteria
      if (criteria.condition) {
        const { condition, ...originalCriteria } = criteria
        
        // Update the rule in the database
        await knex('router_rules')
          .where('id', rule.id)
          .update({
            criteria: JSON.stringify(originalCriteria),
            updated_at: new Date().toISOString()
          })
        
        console.log(`Reverted rule ID ${rule.id} (${rule.name}) to old format`)
      }
    } catch (error) {
      console.error(`Error reverting rule ID ${rule.id}:`, error)
    }
  }
}