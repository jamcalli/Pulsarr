import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import DeleteRouteAlert from '@/features/content-router/components/delete-route-alert'
import AccordionRouteCardSkeleton from '@/features/content-router/components/accordion-route-card-skeleton'
import AccordionRouteCard from './accordion-route-card'
import { useRadarrContentRouterAdapter } from '@/features/radarr/hooks/content-router/useRadarrContentRouterAdapter'
import { useSonarrContentRouterAdapter } from '@/features/sonarr/hooks/content-router/useSonarrContentRouterAdapter'
import type { RadarrInstance } from '@root/types/radarr.types'
import type { SonarrInstance } from '@root/types/sonarr.types'
import type {
  ContentRouterRule,
  ContentRouterRuleUpdate,
  Condition,
  ConditionGroup,
} from '@root/schemas/content-router/content-router.schema'

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
  condition?: ConditionGroup
  [key: string]: ConditionGroup | undefined
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

const AccordionContentRouterSection = ({
  targetType,
  instances,
  genres,
  onGenreDropdownOpen,
}: AccordionContentRouterSectionProps) => {
  const { toast } = useToast()

  // Use the appropriate adapter based on targetType
  const contentRouter =
    targetType === 'radarr'
      ? useRadarrContentRouterAdapter()
      : useSonarrContentRouterAdapter()

  const [togglingRuleId, _setTogglingRuleId] = useState<number | null>(null)

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
    () =>
      Array.from({ length: rules.length || 2 }).map(() => crypto.randomUUID()),
    [rules.length],
  )

  // Fetch rules on initial mount
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true

      fetchRules().catch((error) => {
        console.error(`Failed to fetch ${targetType} routing rules:`, error)
        toast({
          title: 'Error',
          description: `Failed to load ${targetType} routing rules.`,
          variant: 'destructive',
        })
      })
    }
  }, [fetchRules, targetType, toast])

  const addRoute = () => {
    // Create a new empty conditional route
    const defaultCondition: ConditionGroup = {
      operator: 'AND',
      conditions: [
        {
          field: '',
          operator: '',
          value: '',
          negate: false,
        },
      ],
      negate: false,
    }

    const newRule: TempRule = {
      tempId: `temp-${Date.now()}`,
      name: `New ${targetType === 'radarr' ? 'Movie' : 'Show'} Route`,
      target_type: targetType,
      target_instance_id: instances.length > 0 ? instances[0].id : 0,
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
      // Don't set togglingRuleId immediately - let the optimistic update handle the UI
      try {
        await toggleRule(id, enabled)
      } catch (error) {
        // Error handling is done in toggleRule
      }
    },
    [toggleRule],
  )

  // NEW: Store form values before updating
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

        toast({
          title: 'Success',
          description: 'Route created successfully',
        })
      } catch (error) {
        toast({
          title: 'Error',
          description: `Failed to create route: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: 'destructive',
        })
      } finally {
        setSavingRules((prev) => {
          const updated = { ...prev }
          delete updated[tempId]
          return updated
        })
      }
    },
    [createRule, toast, storeFormValues],
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

        toast({
          title: 'Success',
          description: 'Route updated successfully',
        })
      } catch (error) {
        toast({
          title: 'Error',
          description: `Failed to update route: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: 'destructive',
        })

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
    [updateRule, toast, storeFormValues],
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
        toast({
          title: 'Success',
          description: 'Route removed successfully',
        })
      } catch (error) {
        toast({
          title: 'Error',
          description: `Failed to remove route: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: 'destructive',
        })
      }
    }
  }, [deleteConfirmationRuleId, deleteRule, toast])

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

  const convertToStandardCondition = (rule: ContentRouterRule | TempRule) => {
    // Convert old format criteria to new format condition if needed
    const ruleWithCondition = { ...rule } as ExtendedContentRouterRule

    // Cast rule to ExtendedContentRouterRule to access potential criteria
    const extendedRule = rule as ExtendedContentRouterRule
    if (
      extendedRule.criteria &&
      !extendedRule.condition &&
      typeof extendedRule.criteria === 'object'
    ) {
      const criteria = extendedRule.criteria as Record<string, CriteriaValue>

      if ('genre' in criteria && criteria.genre) {
        // Convert genre rule to condition
        const genreValue = criteria.genre
        ruleWithCondition.condition = {
          operator: 'AND',
          conditions: [
            {
              field: 'genre',
              operator: Array.isArray(genreValue) ? 'in' : 'equals',
              value: genreValue,
              negate: false,
            },
          ],
          negate: false,
        }
      } else if ('year' in criteria && criteria.year) {
        // Convert year rule to condition
        const yearValue = criteria.year
        let condition: Condition

        if (typeof yearValue === 'number') {
          condition = {
            field: 'year',
            operator: 'equals',
            value: yearValue,
            negate: false,
          }
        } else if (Array.isArray(yearValue)) {
          condition = {
            field: 'year',
            operator: 'in',
            value: yearValue,
            negate: false,
          }
        } else if (typeof yearValue === 'object' && yearValue !== null) {
          condition = {
            field: 'year',
            operator: 'between',
            value: yearValue,
            negate: false,
          }
        } else {
          condition = {
            field: 'year',
            operator: 'equals',
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
        // Convert language rule to condition
        const langValue = criteria.originalLanguage
        ruleWithCondition.condition = {
          operator: 'AND',
          conditions: [
            {
              field: 'language',
              operator: Array.isArray(langValue) ? 'in' : 'equals',
              value: langValue,
              negate: false,
            },
          ],
          negate: false,
        }
      } else if ('users' in criteria && criteria.users) {
        // Convert user rule to condition
        const usersValue = criteria.users
        ruleWithCondition.condition = {
          operator: 'AND',
          conditions: [
            {
              field: 'user',
              operator: Array.isArray(usersValue) ? 'in' : 'equals',
              value: usersValue,
              negate: false,
            },
          ],
          negate: false,
        }
      }
    }

    // If no condition was created and no condition exists, create a default one
    if (!ruleWithCondition.condition) {
      ruleWithCondition.condition = {
        operator: 'AND',
        conditions: [
          {
            field: '',
            operator: '',
            value: '',
            negate: false,
          },
        ],
        negate: false,
      }
    }

    return ruleWithCondition
  }

  const renderRouteCard = (
    rule: ContentRouterRule | TempRule,
    isNew = false,
  ) => {
    const ruleId = isNew
      ? (rule as TempRule).tempId
      : (rule as ContentRouterRule).id

    const isToggling =
      !isNew && togglingRuleId === (rule as ContentRouterRule).id

    // Convert to standardized condition format
    const ruleWithCondition = convertToStandardCondition(rule)

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
        route={mergedRule as ExtendedContentRouterRule}
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
            : () => setDeleteConfirmationRuleId((rule as ContentRouterRule).id)
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
  }

  return (
    <div className="grid gap-6">
      {isLoading &&
      rules.length === 0 &&
      !localRules.length ? // Initially loading state
      null : isLoading && hasExistingRoutes ? (
        // Loading with existing rules - show skeletons
        <div className="grid gap-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-text">
              {targetType === 'radarr' ? 'Radarr' : 'Sonarr'} Content Routes
            </h2>
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
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-text">
              {targetType === 'radarr' ? 'Radarr' : 'Sonarr'} Content Routes
            </h2>
          </div>
          <div className="text-center py-8 text-text">
            <p>No content routes configured</p>
            <Button onClick={addRoute} className="mt-4">
              Add Your First Route
            </Button>
          </div>
        </div>
      ) : (
        // Display routes
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-text">
              {targetType === 'radarr' ? 'Radarr' : 'Sonarr'} Content Routes
            </h2>
            <Button onClick={addRoute}>Add Route</Button>
          </div>
          <div className="grid gap-4">
            {/* Saved routes */}
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
