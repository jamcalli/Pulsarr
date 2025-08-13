import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import DeleteRouteAlert from '@/features/content-router/components/delete-route-alert'
import AccordionRouteCardSkeleton from '@/features/content-router/components/accordion-route-card-skeleton'
import AccordionRouteCard from '@/features/content-router/components/accordion-route-card'
import { useRadarrContentRouterAdapter } from '@/features/radarr/hooks/content-router/useRadarrContentRouterAdapter'
import { useSonarrContentRouterAdapter } from '@/features/sonarr/hooks/content-router/useSonarrContentRouterAdapter'
import { generateUUID } from '@/features/content-router/utils/utils'
import type { RadarrInstance } from '@root/types/radarr.types'
import type { SonarrInstance } from '@root/types/sonarr.types'
import type {
  ContentRouterRule,
  ContentRouterRuleUpdate,
  Condition,
  ConditionGroup,
  ComparisonOperator,
} from '@root/schemas/content-router/content-router.schema'
import {
  isCondition,
  isConditionGroup,
} from '@/features/content-router/types/route-types'

// Define possible value types for criteria
type CriteriaValue =
  | string
  | string[]
  | number
  | number[]
  | { min?: number; max?: number }
  | ConditionGroup
  | undefined

// Define criteria interface to match backend schema
interface Criteria {
  /** Optional nested condition tree produced by the UI */
  condition?: ConditionGroup

  /** Optional operator that applies to the root criteria object */
  operator?: string

  /** Dynamic criterion fields (year, user, language, ...) */
  [key: string]: CriteriaValue | undefined
}

// Extended ContentRouterRule to include condition and type
interface ExtendedContentRouterRule extends ContentRouterRule {
  type?: string
  criteria?: Criteria
}

// More specific type for temporary rules
interface TempRule
  extends Partial<Omit<ContentRouterRule, 'id' | 'created_at' | 'updated_at'>> {
  tempId: string
  name: string
  type?: string
  target_type: 'radarr' | 'sonarr'
  condition?: ConditionGroup
  criteria?: Criteria
}

type AccordionContentRouterSectionProps = {
  targetType: 'radarr' | 'sonarr'
  instances: (RadarrInstance | SonarrInstance)[]
  genres: string[]
  onGenreDropdownOpen: () => Promise<void>
}

// Move these helper functions outside the component
const createDefaultCondition = (): Condition => ({
  field: '',
  operator: 'equals' as ComparisonOperator,
  value: null,
  negate: false,
})

const createDefaultConditionGroup = (): ConditionGroup => ({
  operator: 'AND',
  conditions: [
    {
      field: '',
      operator: 'equals' as ComparisonOperator,
      value: null,
      negate: false,
    },
  ],
  negate: false,
})

const createConditionGroupFromCondition = (
  condition: Condition | unknown,
): ConditionGroup => ({
  operator: 'AND',
  conditions: isCondition(condition) ? [condition] : [createDefaultCondition()],
  negate: false,
})

// Move the conversion function outside the component
const convertToStandardCondition = (
  rule: ContentRouterRule | TempRule,
): ExtendedContentRouterRule => {
  // Create a new object to avoid mutating the input
  const ruleWithCondition = { ...rule } as ExtendedContentRouterRule
  const extendedRule = rule as ExtendedContentRouterRule

  if (extendedRule.condition) {
    if (isCondition(extendedRule.condition)) {
      ruleWithCondition.condition = {
        operator: 'AND',
        conditions: [extendedRule.condition],
        negate: false,
      }
    }
  } else if (
    extendedRule.criteria &&
    !extendedRule.condition &&
    typeof extendedRule.criteria === 'object'
  ) {
    const criteria = extendedRule.criteria as Record<string, CriteriaValue>

    if ('year' in criteria && criteria.year) {
      const yearValue = criteria.year
      let condition: Condition

      if (typeof yearValue === 'number') {
        condition = {
          field: 'year',
          operator: 'equals' as ComparisonOperator,
          value: yearValue,
          negate: false,
        }
      } else if (Array.isArray(yearValue)) {
        condition = {
          field: 'year',
          operator: 'in' as ComparisonOperator,
          value: yearValue,
          negate: false,
        }
      } else if (typeof yearValue === 'object' && yearValue !== null) {
        condition = {
          field: 'year',
          operator: 'between' as ComparisonOperator,
          value: yearValue as { min?: number; max?: number },
          negate: false,
        }
      } else {
        condition = {
          field: 'year',
          operator: 'equals' as ComparisonOperator,
          value: new Date().getFullYear(),
          negate: false,
        }
      }

      ruleWithCondition.condition = {
        operator: 'AND',
        conditions: [condition],
        negate: false,
      }
    } else if ('originalLanguage' in criteria && criteria.originalLanguage) {
      const langValue = criteria.originalLanguage as string | string[]
      ruleWithCondition.condition = {
        operator: 'AND',
        conditions: [
          {
            field: 'language',
            operator: Array.isArray(langValue)
              ? 'in'
              : ('equals' as ComparisonOperator),
            value: langValue,
            negate: false,
          },
        ],
        negate: false,
      }
    } else if ('users' in criteria && criteria.users) {
      const usersValue = criteria.users as string | string[]
      ruleWithCondition.condition = {
        operator: 'AND',
        conditions: [
          {
            field: 'user',
            operator: Array.isArray(usersValue)
              ? 'in'
              : ('equals' as ComparisonOperator),
            value: usersValue,
            negate: false,
          },
        ],
        negate: false,
      }
    }
  }

  if (!ruleWithCondition.condition) {
    ruleWithCondition.condition = createDefaultConditionGroup()
  }

  if (!isConditionGroup(ruleWithCondition.condition)) {
    ruleWithCondition.condition = createConditionGroupFromCondition(
      ruleWithCondition.condition,
    )
  }

  return ruleWithCondition
}

const AccordionContentRouterSection = ({
  targetType,
  instances,
  genres,
  onGenreDropdownOpen,
}: AccordionContentRouterSectionProps) => {
  // Use the appropriate adapter based on targetType
  const radarrContentRouter = useRadarrContentRouterAdapter()
  const sonarrContentRouter = useSonarrContentRouterAdapter()
  const contentRouter =
    targetType === 'radarr' ? radarrContentRouter : sonarrContentRouter

  const {
    rules,
    isLoading,
    createRule,
    updateRule,
    deleteRule,
    fetchRules,
    toggleRule,
  } = contentRouter

  // Local state to manage UI behavior
  const [localRules, setLocalRules] = useState<TempRule[]>([])
  const [savingRules, setSavingRules] = useState<{ [key: string]: boolean }>({})
  const [deleteConfirmationRuleId, setDeleteConfirmationRuleId] = useState<
    number | null
  >(null)
  const isMounted = useRef(false)

  const [editedFormValues, setEditedFormValues] = useState<{
    [key: string]: ContentRouterRuleUpdate
  }>({})

  const skeletonIds = useMemo(
    () => Array.from({ length: rules.length || 2 }).map(() => generateUUID()),
    [rules.length],
  )

  // Fetch rules on initial mount
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true

      fetchRules().catch((error) => {
        console.error(`Failed to fetch ${targetType} routing rules:`, error)
        toast.error(`Failed to load ${targetType} routing rules.`)
      })
    }
  }, [fetchRules, targetType])

  const addRoute = () => {
    // Create a new empty conditional route
    const defaultCondition: ConditionGroup = {
      operator: 'AND',
      conditions: [
        {
          field: '',
          operator: 'equals',
          value: null,
          negate: false,
        },
      ],
      negate: false,
    }

    const newRule: TempRule = {
      tempId: `temp-${Date.now()}`,
      name: `New ${targetType === 'radarr' ? 'Movie' : 'Show'} Route`,
      target_type: targetType,
      target_instance_id: instances.length > 0 ? instances[0].id : undefined,
      condition: defaultCondition,
      root_folder: '',
      quality_profile: undefined,
      enabled: true,
      order: 50,
    }

    setLocalRules((prev) => [...prev, newRule])
  }

  const handleToggleRuleEnabled = useCallback(
    async (id: number, enabled: boolean) => {
      try {
        await toggleRule(id, enabled)
      } catch (_error) {
        // Error handling is done in toggleRule
      }
    },
    [toggleRule],
  )

  // Store form values before updating
  const storeFormValues = useCallback(
    (id: string, data: ContentRouterRuleUpdate) => {
      setEditedFormValues((prev) => ({
        ...prev,
        [id]: data,
      }))
    },
    [],
  )

  const handleSaveNewRule = useCallback(
    async (
      tempId: string,
      data: Omit<ContentRouterRule, 'id' | 'created_at' | 'updated_at'>,
    ) => {
      // Only set loading state for this specific operation
      setSavingRules((prev) => ({ ...prev, [tempId]: true }))

      try {
        // Store current form values
        storeFormValues(tempId, data as ContentRouterRuleUpdate)

        // Convert quality_profile to the expected format
        const modifiedData = {
          ...data,
          quality_profile:
            data.quality_profile !== undefined
              ? typeof data.quality_profile === 'string'
                ? Number(data.quality_profile)
                : data.quality_profile
              : undefined,
        }

        // Use a timer to ensure minimum visible loading time
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        // Create the rule and wait for minimum time
        await Promise.all([createRule(modifiedData), minimumLoadingTime])

        // Remove from local rules once created
        setLocalRules((prev) => prev.filter((r) => r.tempId !== tempId))

        // Clean up stored form values
        setEditedFormValues((prev) => {
          const updated = { ...prev }
          delete updated[tempId]
          return updated
        })

        toast.success('Route created successfully')
      } catch (error) {
        toast.error(
          `Failed to create route: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      } finally {
        setSavingRules((prev) => {
          const updated = { ...prev }
          delete updated[tempId]
          return updated
        })
      }
    },
    [createRule, storeFormValues],
  )

  const handleUpdateRule = useCallback(
    async (id: number, data: ContentRouterRuleUpdate) => {
      // Only set loading state for this specific rule update
      setSavingRules((prev) => ({ ...prev, [id]: true }))

      // Store current form values to prevent flash
      storeFormValues(id.toString(), data)

      try {
        // Convert quality_profile to the expected format
        const modifiedData = {
          ...data,
          quality_profile:
            data.quality_profile !== undefined
              ? typeof data.quality_profile === 'string'
                ? Number(data.quality_profile)
                : data.quality_profile
              : undefined,
        }

        // Ensure minimum loading time for better UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        // Update the rule and wait for minimum time
        await Promise.all([updateRule(id, modifiedData), minimumLoadingTime])

        toast.success('Route updated successfully')
      } catch (error) {
        toast.error(
          `Failed to update route: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )

        // On error, keep the form values in state
        return
      } finally {
        setSavingRules((prev) => {
          const updated = { ...prev }
          delete updated[id.toString()]
          return updated
        })

        // Clean up stored form values only on success
        setEditedFormValues((prev) => {
          const updated = { ...prev }
          delete updated[id.toString()]
          return updated
        })
      }
    },
    [updateRule, storeFormValues],
  )

  const handleRemoveRule = useCallback(async () => {
    if (deleteConfirmationRuleId) {
      try {
        await deleteRule(deleteConfirmationRuleId)

        // Clean up any stored form values for this rule
        setEditedFormValues((prev) => {
          const updated = { ...prev }
          delete updated[deleteConfirmationRuleId.toString()]
          return updated
        })

        setDeleteConfirmationRuleId(null)
        toast.success('Route removed successfully')
      } catch (error) {
        toast.error(
          `Failed to remove route: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }
  }, [deleteConfirmationRuleId, deleteRule])

  const handleCancelLocalRule = useCallback((tempId: string) => {
    // Clean up stored form values when canceling
    setEditedFormValues((prev) => {
      const updated = { ...prev }
      delete updated[tempId]
      return updated
    })

    setLocalRules((prev) => prev.filter((r) => r.tempId !== tempId))
  }, [])

  const hasExistingRoutes = rules.length > 0

  // Memoize the converted rules to avoid recalculations on every render
  const preparedRules = useMemo(
    () => [...rules, ...localRules].map(convertToStandardCondition),
    [rules, localRules],
  )

  const renderRouteCard = useCallback(
    (rule: ContentRouterRule | TempRule, isNew = false) => {
      const ruleId = isNew
        ? (rule as TempRule).tempId
        : (rule as ContentRouterRule).id

      const isToggling = false

      // Use the preprocessed rule from preparedRules instead of converting again
      const ruleIndex = preparedRules.findIndex((r) =>
        isNew
          ? 'tempId' in r && r.tempId === (rule as TempRule).tempId
          : 'id' in r && r.id === (rule as ContentRouterRule).id,
      )

      const ruleWithCondition =
        ruleIndex >= 0
          ? preparedRules[ruleIndex]
          : convertToStandardCondition(rule) // Fallback just in case

      // Check if we have stored form values for this rule
      const storedId = ruleId.toString()
      const hasStoredValues = storedId in editedFormValues

      // Merge stored form values if they exist
      const mergedRule = hasStoredValues
        ? { ...ruleWithCondition, ...editedFormValues[storedId] }
        : ruleWithCondition

      return (
        <AccordionRouteCard
          key={ruleId}
          route={{
            ...mergedRule,
            condition: mergedRule.condition as ConditionGroup | undefined,
          }}
          isNew={isNew}
          onSave={async (data: ContentRouterRule | ContentRouterRuleUpdate) => {
            if (isNew) {
              return handleSaveNewRule(
                (rule as TempRule).tempId,
                data as Omit<
                  ContentRouterRule,
                  'id' | 'created_at' | 'updated_at'
                >,
              )
            }
            return handleUpdateRule(
              (rule as ContentRouterRule).id,
              data as ContentRouterRuleUpdate,
            )
          }}
          onCancel={() => {
            if (isNew) {
              handleCancelLocalRule((rule as TempRule).tempId)
            }
          }}
          onRemove={
            isNew
              ? undefined
              : () =>
                  setDeleteConfirmationRuleId((rule as ContentRouterRule).id)
          }
          onToggleEnabled={handleToggleRuleEnabled}
          isSaving={!!savingRules[ruleId.toString()]}
          isTogglingState={isToggling}
          instances={instances}
          genres={genres}
          onGenreDropdownOpen={onGenreDropdownOpen}
          contentType={targetType}
        />
      )
    },
    [
      preparedRules,
      editedFormValues,
      handleSaveNewRule,
      handleUpdateRule,
      handleCancelLocalRule,
      handleToggleRuleEnabled,
      savingRules,
      instances,
      genres,
      onGenreDropdownOpen,
      targetType,
    ],
  )

  return (
    <div className="grid gap-6">
      {isLoading &&
      rules.length === 0 &&
      !localRules.length ? // Initially loading state
      null : isLoading && hasExistingRoutes ? (
        // Loading with existing rules - show skeletons
        <div className="grid gap-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground">
              {targetType === 'radarr' ? 'Radarr' : 'Sonarr'} Content Routes
            </h2>
            <p className="text-sm text-foreground mt-1">
              Define criteria-based routing rules for{' '}
              {targetType === 'radarr' ? 'movies' : 'TV shows'} within or across{' '}
              {targetType === 'radarr' ? 'Radarr' : 'Sonarr'} instances
            </p>
          </div>
          <div className="grid gap-4">
            {skeletonIds.map((id) => (
              <AccordionRouteCardSkeleton
                key={`skeleton-${targetType}-${id}`}
              />
            ))}
          </div>
        </div>
      ) : !hasExistingRoutes && localRules.length === 0 ? (
        // Empty state - no rules
        <div className="grid gap-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground">
              {targetType === 'radarr' ? 'Radarr' : 'Sonarr'} Content Routes
            </h2>
            <p className="text-sm text-foreground mt-1">
              Define criteria-based routing rules for{' '}
              {targetType === 'radarr' ? 'movies' : 'TV shows'} within or across{' '}
              {targetType === 'radarr' ? 'Radarr' : 'Sonarr'} instances
            </p>
          </div>
          <div className="text-center py-8 text-foreground">
            <p>No content routes configured</p>
            <Button onClick={addRoute} className="mt-4">
              Add Your First Route
            </Button>
          </div>
        </div>
      ) : (
        // Display routes
        <>
          <div className="mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-foreground">
                  {targetType === 'radarr' ? 'Radarr' : 'Sonarr'} Content Routes
                </h2>
                <p className="text-sm text-foreground mt-1">
                  Define criteria-based routing rules for{' '}
                  {targetType === 'radarr' ? 'movies' : 'TV shows'} within or
                  across {targetType === 'radarr' ? 'Radarr' : 'Sonarr'}{' '}
                  instances
                </p>
              </div>
              <Button onClick={addRoute}>Add Route</Button>
            </div>
          </div>
          <div className="grid gap-4">
            {/* Saved rules */}
            {rules.map((rule) => renderRouteCard(rule))}

            {/* Local rules */}
            {localRules.map((rule) => renderRouteCard(rule, true))}

            {/* Loading skeleton */}
            {isLoading &&
              Object.keys(savingRules).some(
                (key) => !key.startsWith('temp-'),
              ) &&
              rules.length === 0 &&
              localRules.length === 0 && (
                <div className="opacity-40 pointer-events-none">
                  <AccordionRouteCardSkeleton />
                </div>
              )}
          </div>
        </>
      )}

      {/* Delete Confirmation */}
      <DeleteRouteAlert
        open={deleteConfirmationRuleId !== null}
        onOpenChange={() => setDeleteConfirmationRuleId(null)}
        onConfirm={handleRemoveRule}
        routeName={
          rules.find((r) => r.id === deleteConfirmationRuleId)?.name || ''
        }
        routeType="content route"
      />
    </div>
  )
}

export default AccordionContentRouterSection
