/**
 * Content Query Builder
 *
 * Implementation of the query builder pattern for constructing and executing
 * complex content routing queries.
 */
import type {
  ContentQuery,
  Predicate,
  PredicateGroup,
  LogicalOperator,
  RouteTarget,
  EnhancedContext,
} from '@root/types/router-query.types.js'
import type { ContentItem, RoutingDecision } from '@root/types/router.types.js'

/**
 * Concrete implementation of the ContentQuery interface
 */
export class ContentQueryBuilder implements ContentQuery {
  private predicateGroups: PredicateGroup[] = []
  private currentGroup: PredicateGroup
  private targets: RouteTarget[] = []

  constructor() {
    // Start with a default AND group
    this.currentGroup = { predicates: [], operator: 'AND' }
    this.predicateGroups.push(this.currentGroup)
  }

  /**
   * Add a predicate to the current group
   * @param predicate The predicate to add
   */
  where(predicate: Predicate): ContentQuery {
    this.currentGroup.predicates.push(predicate)
    return this
  }

  /**
   * Add a NOT predicate to the current group
   * @param predicate The predicate to negate
   */
  whereNot(predicate: Predicate): ContentQuery {
    const notGroup: PredicateGroup = {
      predicates: [predicate],
      operator: 'NOT',
    }
    this.currentGroup.predicates.push(notGroup)
    return this
  }

  /**
   * Create a nested AND group and add it to the current group
   * @param builder Function that builds the AND group's contents
   */
  and(builder: (query: ContentQuery) => void): ContentQuery {
    const previousGroup = this.currentGroup

    // Create a new AND group
    const andGroup: PredicateGroup = {
      predicates: [],
      operator: 'AND',
    }

    // Add the AND group to the current group
    previousGroup.predicates.push(andGroup)

    // Set the AND group as current
    this.currentGroup = andGroup

    // Let the builder populate the AND group
    builder(this)

    // Restore the previous group as current
    this.currentGroup = previousGroup

    return this
  }

  /**
   * Create a nested OR group and add it to the current group
   * @param builder Function that builds the OR group's contents
   */
  or(builder: (query: ContentQuery) => void): ContentQuery {
    const previousGroup = this.currentGroup

    // Create a new OR group
    const orGroup: PredicateGroup = {
      predicates: [],
      operator: 'OR',
    }

    // Add the OR group to the current group
    previousGroup.predicates.push(orGroup)

    // Set the OR group as current
    this.currentGroup = orGroup

    // Let the builder populate the OR group
    builder(this)

    // Restore the previous group as current
    this.currentGroup = previousGroup

    return this
  }

  /**
   * Add routing target information to the query
   * @param target Routing target details
   */
  routeTo(target: RouteTarget): ContentQuery {
    this.targets.push(target)
    return this
  }

  /**
   * Execute the query against a content item
   * @param item The content item to evaluate
   * @param context The context for evaluation, including metadata
   * @returns Routing decisions if the query matches, null otherwise
   */
  async execute(
    item: ContentItem,
    context: EnhancedContext,
  ): Promise<RoutingDecision[] | null> {
    // Evaluate all predicate groups
    const matches = await Promise.all(
      this.predicateGroups.map((group) =>
        this.evaluatePredicateGroup(group, item, context),
      ),
    )

    // If any group evaluates to true
    if (matches.some((match) => match)) {
      // Return the routing decisions from targets
      return this.targets.map((target) => ({
        instanceId: target.instanceId,
        qualityProfile: target.qualityProfile ?? undefined,
        rootFolder: target.rootFolder ?? undefined,
        weight: target.weight,
      }))
    }

    return null
  }

  /**
   * Recursively evaluate a predicate group
   * @param group The predicate group to evaluate
   * @param item The content item to evaluate
   * @param context The context for evaluation
   * @returns True if the group evaluates to true, false otherwise
   */
  private async evaluatePredicateGroup(
    group: PredicateGroup,
    item: ContentItem,
    context: EnhancedContext,
  ): Promise<boolean> {
    const results = await Promise.all(
      group.predicates.map(async (p) => {
        if (this.isPredicateGroup(p)) {
          return this.evaluatePredicateGroup(p, item, context)
        } else {
          return p(item, context)
        }
      }),
    )

    if (group.operator === 'AND') {
      return results.every((result) => result)
    } else if (group.operator === 'OR') {
      return results.some((result) => result)
    } else if (group.operator === 'NOT') {
      // NOT should have just one predicate
      return !results[0]
    }

    return false
  }

  /**
   * Type guard to check if a predicate is actually a predicate group
   */
  private isPredicateGroup(
    predicate: Predicate | PredicateGroup,
  ): predicate is PredicateGroup {
    return (predicate as PredicateGroup).predicates !== undefined
  }
}
