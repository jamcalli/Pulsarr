/**
 * Language Predicate Plugin
 *
 * This plugin creates predicates for filtering content by its original language
 */
import type { FastifyInstance } from 'fastify'
import type {
  PredicateFactoryPlugin,
  Predicate,
  ContentItem,
  EnhancedContext,
} from '@root/types/router-query.types.js'
import {
  isRadarrResponse,
  isSonarrResponse,
} from '@root/types/content-lookup.types.js'

export default function createLanguagePredicatePlugin(
  fastify: FastifyInstance,
): PredicateFactoryPlugin<string | string[]> {
  return {
    name: 'language',
    displayName: 'Language',
    description: 'Filter content by original language',

    createPredicate(criteria: string | string[]): Predicate {
      const languages = Array.isArray(criteria) ? criteria : [criteria]

      return async (
        item: ContentItem,
        context: EnhancedContext,
      ): Promise<boolean> => {
        // Use the pre-fetched language information from metadata
        const originalLanguage = context.metadata.originalLanguage

        if (!originalLanguage) {
          fastify.log.debug(
            `No language information available for "${item.title}"`,
          )
          return false
        }

        const isMatch = languages.some(
          (lang) => lang.toLowerCase() === originalLanguage.toLowerCase(),
        )

        fastify.log.debug(
          `Language predicate for "${item.title}": ${originalLanguage} ${isMatch ? 'matches' : 'does not match'} ${languages.join(', ')}`,
        )

        return isMatch
      }
    },

    getSupportedOperators() {
      return ['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN']
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
      }
      return labels[operator] || operator
    },

    getSampleValues() {
      return [
        'English',
        'French',
        'Spanish',
        'German',
        'Italian',
        'Japanese',
        'Korean',
        'Chinese',
      ]
    },
  }
}
