/**
 * Genre Predicate Plugin
 *
 * This plugin creates predicates for filtering content by genre
 */
import type { FastifyInstance } from 'fastify'
import type {
  PredicateFactoryPlugin,
  Predicate,
  ContentItem,
  EnhancedContext,
} from '@root/types/router-query.types.js'

export default function createGenrePredicatePlugin(
  fastify: FastifyInstance,
): PredicateFactoryPlugin<string | string[]> {
  return {
    name: 'genre',
    displayName: 'Genre',
    description: 'Filter content by genre',

    createPredicate(criteria: string | string[]): Predicate {
      const genres = Array.isArray(criteria) ? criteria : [criteria]

      return async (
        item: ContentItem,
        context: EnhancedContext,
      ): Promise<boolean> => {
        // Use the genres directly from the content item
        if (
          !item.genres ||
          !Array.isArray(item.genres) ||
          item.genres.length === 0
        ) {
          fastify.log.debug(
            `No genre information available for "${item.title}"`,
          )
          return false
        }

        // Check if any of the item's genres match the criteria
        const isMatch = genres.some((genre) =>
          item.genres!.some(
            (itemGenre) => itemGenre.toLowerCase() === genre.toLowerCase(),
          ),
        )

        fastify.log.debug(
          `Genre predicate for "${item.title}": ${item.genres.join(', ')} ${isMatch ? 'matches' : 'does not match'} ${genres.join(', ')}`,
        )

        return isMatch
      }
    },

    getSupportedOperators() {
      return [
        'EQUALS',
        'NOT_EQUALS',
        'IN',
        'NOT_IN',
        'CONTAINS',
        'NOT_CONTAINS',
      ]
    },

    getValueType() {
      return 'string'
    },

    getOperatorLabel(operator: string) {
      const labels: Record<string, string> = {
        EQUALS: 'is',
        NOT_EQUALS: 'is not',
        IN: 'is one of',
        NOT_IN: 'is not one of',
        CONTAINS: 'contains',
        NOT_CONTAINS: 'does not contain',
      }
      return labels[operator] || operator
    },

    getSampleValues() {
      return [
        'drama',
        'comedy',
        'action',
        'thriller',
        'horror',
        'sci-fi',
        'animation',
        'anime',
        'documentary',
      ]
    },
  }
}
