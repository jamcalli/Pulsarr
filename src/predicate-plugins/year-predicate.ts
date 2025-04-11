/**
 * Year Predicate Plugin
 *
 * This plugin creates predicates for filtering content by release year
 */
import type { FastifyInstance } from 'fastify'
import type {
  PredicateFactoryPlugin,
  Predicate,
  ContentItem,
  EnhancedContext,
} from '@root/types/router-query.types.js'
import { extractYear } from '@root/types/content-lookup.types.js'

type YearCriteria = number | number[] | { min?: number; max?: number }

export default function createYearPredicatePlugin(
  fastify: FastifyInstance,
): PredicateFactoryPlugin<YearCriteria> {
  return {
    name: 'year',
    displayName: 'Release Year',
    description: 'Filter content by release year',

    createPredicate(criteria: YearCriteria): Predicate {
      return async (
        item: ContentItem,
        context: EnhancedContext,
      ): Promise<boolean> => {
        // Use the pre-fetched year from metadata only
        const releaseYear = context.metadata.releaseYear

        if (releaseYear === undefined) {
          fastify.log.debug(`No year information available for "${item.title}"`)
          return false
        }

        // Check the year against different criteria types
        let isMatch = false

        if (typeof criteria === 'number') {
          // Exact year match
          isMatch = releaseYear === criteria
        } else if (Array.isArray(criteria)) {
          // Year is in array of years
          isMatch = criteria.includes(releaseYear)
        } else if (typeof criteria === 'object') {
          // Year is within range
          const min =
            criteria.min !== undefined ? criteria.min : Number.NEGATIVE_INFINITY
          const max =
            criteria.max !== undefined ? criteria.max : Number.POSITIVE_INFINITY
          isMatch = releaseYear >= min && releaseYear <= max
        }

        fastify.log.debug(
          `Year predicate for "${item.title}": ${releaseYear} ${isMatch ? 'matches' : 'does not match'} criteria`,
        )

        return isMatch
      }
    },

    getSupportedOperators() {
      return [
        'EQUALS',
        'NOT_EQUALS',
        'LESS_THAN',
        'LESS_THAN_EQUALS',
        'GREATER_THAN',
        'GREATER_THAN_EQUALS',
        'IN',
        'NOT_IN',
      ]
    },

    getValueType() {
      return 'number'
    },

    getOperatorLabel(operator: string) {
      const labels: Record<string, string> = {
        EQUALS: 'is',
        NOT_EQUALS: 'is not',
        LESS_THAN: 'is before',
        LESS_THAN_EQUALS: 'is before or in',
        GREATER_THAN: 'is after',
        GREATER_THAN_EQUALS: 'is after or in',
        IN: 'is one of',
        NOT_IN: 'is not one of',
      }
      return labels[operator] || operator
    },

    getSampleValues() {
      return [
        1980,
        2000,
        2020,
        { min: 1980, max: 1990 }, // 80s movies
        { max: 1970 }, // Classic films
      ]
    },
  }
}
