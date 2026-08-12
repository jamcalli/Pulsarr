import type {
  ContentItem,
  FieldInfo,
  OperatorInfo,
  RoutingContext,
  RoutingEvaluator,
} from '@root/types/router.types.js'
import type { FastifyInstance } from 'fastify'

/**
 * Creates the evaluator describing the complex condition structure for the UI.
 *
 * Rule resolution itself lives in the content-router rule resolver - this
 * evaluator only contributes field/operator metadata for the rule builder.
 */
export default function createConditionalEvaluator(
  _fastify: FastifyInstance,
): RoutingEvaluator {
  const supportedFields: FieldInfo[] = [
    {
      name: 'condition',
      description: 'Complex condition structure for advanced routing',
      valueTypes: ['object'],
    },
  ]

  const supportedOperators: Record<string, OperatorInfo[]> = {
    condition: [
      {
        name: 'equals',
        description: 'Condition structure matches exactly',
        valueTypes: ['object'],
      },
      {
        name: 'contains',
        description: 'Condition structure contains the specified rules',
        valueTypes: ['object'],
      },
    ],
  }

  return {
    name: 'Conditional Router',
    description: 'Routes content based on complex conditional rules',
    priority: 100, // Highest priority - evaluate conditional rules first
    ruleType: 'conditional',
    supportedFields,
    supportedOperators,

    async canEvaluate(
      _item: ContentItem,
      _context: RoutingContext,
    ): Promise<boolean> {
      return true
    },
  }
}
