import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import GenreRouteCard from '@/features/content-router/components/genre-route-card'
import YearRouteCard from '@/features/content-router/components/year-route-card'
import LanguageRouteCard from '@/features/content-router/components/language-route-card'
import DeleteRouteAlert from '@/features/content-router/components/delete-route-alert'
import RouteTypeSelectionModal from '@/features/content-router/components/content-route-type-modal'
import ContentRouteCardSkeleton from '@/features/content-router/components/content-route-skeleton'
import type { RouteType } from '@/features/content-router/components/content-route-type-modal'
import type {
  ContentRouterRule,
  ContentRouterRuleUpdate,
  Criteria,
} from '@root/schemas/content-router/content-router.schema'
import { useRadarrContentRouterAdapter } from '@/features/radarr/hooks/content-router/useRadarrContentRouterAdapater'
import { useSonarrContentRouterAdapter } from '@/features/sonarr/hooks/content-router/useSonarrContentRouterAdapter'
import type { RadarrInstance } from '@root/types/radarr.types'
import type { SonarrInstance } from '@root/types/sonarr.types'

// More specific type for temporary rules, based on ContentRouterRule
interface TempRule
  extends Partial<Omit<ContentRouterRule, 'id' | 'created_at' | 'updated_at'>> {
  tempId: string
  name: string // Ensure name is required for display
  type: string // Type is required for rendering correct card
  target_type: 'radarr' | 'sonarr' // target_type is required
  criteria: Criteria // Use imported Criteria type
}

type ContentRouterSectionProps = {
  targetType: 'radarr' | 'sonarr'
  instances: (RadarrInstance | SonarrInstance)[]
  genres: string[]
  onGenreDropdownOpen: () => Promise<void>
}

const ContentRouterSection = ({
  targetType,
  instances,
  genres,
  onGenreDropdownOpen,
}: ContentRouterSectionProps) => {
  const { toast } = useToast()

  // Use the appropriate adapter based on targetType
  const contentRouter =
    targetType === 'radarr'
      ? useRadarrContentRouterAdapter()
      : useSonarrContentRouterAdapter()

  const [_showRouteCard, setShowRouteCard] = useState(false)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [togglingRuleId, _setTogglingRuleId] = useState<number | null>(null)
  const [_selectedType, setSelectedType] = useState<RouteType | null>(null)

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

  // Modify the fetch rules effect
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
    setShowTypeModal(true)
  }

  const handleTypeSelect = (type: RouteType) => {
    setSelectedType(type)
    setShowRouteCard(true)
    handleAddRule(type)
  }

  const handleToggleRuleEnabled = useCallback(
    async (id: number, enabled: boolean) => {
      try {
        await toggleRule(id, enabled)
      } catch (error) {
        toast({
          title: 'Error',
          description: `Failed to ${enabled ? 'enable' : 'disable'} route. Please try again.`,
          variant: 'destructive',
        })

        fetchRules().catch(console.error)
      }
    },
    [toggleRule, toast, fetchRules],
  )

  const handleAddRule = useCallback(
    (type: RouteType) => {
      const defaultInstance = instances[0]
      setLocalRules((prev) => [
        ...prev,
        {
          tempId: `temp-${Date.now()}`,
          name: `New ${targetType === 'radarr' ? 'Movie' : 'Show'} ${type.charAt(0).toUpperCase() + type.slice(1)} Route`,
          type: type, // Use selected type
          target_type: targetType,
          target_instance_id: defaultInstance?.id || 0,
          criteria: {}, // Start with empty criteria
          root_folder: '',
          quality_profile: undefined, // Use undefined for optional number|null
          enabled: true,
          order: 50,
        },
      ])
    },
    [instances, targetType],
  )

  const handleSaveNewRule = useCallback(
    async (
      tempId: string,
      data: Omit<ContentRouterRule, 'id' | 'created_at' | 'updated_at'>,
    ) => {
      // Use specific type
      setSavingRules((prev) => ({ ...prev, [tempId]: true }))
      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )

        await Promise.all([createRule(data), minimumLoadingTime])

        setLocalRules((prev) => prev.filter((r) => r.tempId !== tempId))
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
          delete updated[tempId] // Use delete operator here is fine for state object keys
          return updated
        })
      }
    },
    [createRule, toast],
  )

  const handleUpdateRule = useCallback(
    async (id: number, data: ContentRouterRuleUpdate) => {
      setSavingRules((prev) => ({ ...prev, [id]: true }))
      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )
        await Promise.all([updateRule(id, data), minimumLoadingTime])
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
      } finally {
        setSavingRules((prev) => {
          const updated = { ...prev }
          delete updated[id.toString()] // Use delete operator here is fine for state object keys
          return updated
        })
      }
    },
    [updateRule, toast],
  )

  const handleRemoveRule = useCallback(async () => {
    if (deleteConfirmationRuleId !== null) {
      try {
        await deleteRule(deleteConfirmationRuleId)
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
    setLocalRules((prev) => prev.filter((r) => r.tempId !== tempId))
    setShowRouteCard(false) // Hide the card area if the only local rule is cancelled
    setSelectedType(null) // Reset selected type
  }, [])

  const hasExistingRoutes = rules.length > 0

  const renderRouteCard = (
    rule: ContentRouterRule | TempRule,
    isNew = false,
  ) => {
    const ruleId = isNew
      ? (rule as TempRule).tempId
      : (rule as ContentRouterRule).id

    const ruleType = (rule as ContentRouterRule | TempRule).type

    const isToggling =
      !isNew && togglingRuleId === (rule as ContentRouterRule).id

    switch (ruleType) {
      case 'genre':
        return (
          <GenreRouteCard
            key={ruleId}
            // Pass rule explicitly typed
            route={rule as ContentRouterRule | Partial<ContentRouterRule>}
            isNew={isNew}
            // Ensure data type matches expected input for onSave
            onSave={(data: ContentRouterRule | ContentRouterRuleUpdate) =>
              isNew
                ? handleSaveNewRule(
                    (rule as TempRule).tempId,
                    data as Omit<
                      ContentRouterRule,
                      'id' | 'created_at' | 'updated_at'
                    >,
                  )
                : handleUpdateRule(
                    (rule as ContentRouterRule).id,
                    data as ContentRouterRuleUpdate,
                  )
            }
            onCancel={() => {
              if (isNew) {
                handleCancelLocalRule((rule as TempRule).tempId)
              }
              // Note: Existing items don't have a specific 'cancel' - they reset via EditableCardHeader
            }}
            onRemove={
              isNew
                ? undefined
                : () =>
                    setDeleteConfirmationRuleId((rule as ContentRouterRule).id)
            }
            // Pass toggle handler and toggling state
            onToggleEnabled={handleToggleRuleEnabled}
            isTogglingState={isToggling}
            onGenreDropdownOpen={onGenreDropdownOpen}
            isSaving={!!savingRules[ruleId.toString()]} // Ensure key is string
            instances={instances}
            genres={genres}
            contentType={targetType}
          />
        )
      case 'year':
        return (
          <YearRouteCard
            key={ruleId}
            // Pass rule explicitly typed
            route={rule as ContentRouterRule | Partial<ContentRouterRule>}
            isNew={isNew}
            onCancel={() => {
              if (isNew) {
                handleCancelLocalRule((rule as TempRule).tempId)
              }
              // Note: Existing items don't have a specific 'cancel' - they reset via EditableCardHeader
            }}
            // Ensure data type matches expected input for onSave
            onSave={(data: ContentRouterRule | ContentRouterRuleUpdate) =>
              isNew
                ? handleSaveNewRule(
                    (rule as TempRule).tempId,
                    data as Omit<
                      ContentRouterRule,
                      'id' | 'created_at' | 'updated_at'
                    >,
                  )
                : handleUpdateRule(
                    (rule as ContentRouterRule).id,
                    data as ContentRouterRuleUpdate,
                  )
            }
            onRemove={
              isNew
                ? undefined
                : () =>
                    setDeleteConfirmationRuleId((rule as ContentRouterRule).id)
            }
            // Pass toggle handler and toggling state
            onToggleEnabled={handleToggleRuleEnabled}
            isTogglingState={isToggling}
            isSaving={!!savingRules[ruleId.toString()]} // Ensure key is string
            instances={instances}
            contentType={targetType}
          />
        )
      case 'language':
        return (
          <LanguageRouteCard
            key={ruleId}
            route={rule as ContentRouterRule | Partial<ContentRouterRule>}
            isNew={isNew}
            onCancel={() => {
              if (isNew) {
                handleCancelLocalRule((rule as TempRule).tempId)
              }
            }}
            onSave={(data: ContentRouterRule | ContentRouterRuleUpdate) =>
              isNew
                ? handleSaveNewRule(
                    (rule as TempRule).tempId,
                    data as Omit<
                      ContentRouterRule,
                      'id' | 'created_at' | 'updated_at'
                    >,
                  )
                : handleUpdateRule(
                    (rule as ContentRouterRule).id,
                    data as ContentRouterRuleUpdate,
                  )
            }
            onRemove={
              isNew
                ? undefined
                : () =>
                    setDeleteConfirmationRuleId((rule as ContentRouterRule).id)
            }
            onToggleEnabled={handleToggleRuleEnabled}
            isTogglingState={isToggling}
            isSaving={!!savingRules[ruleId.toString()]}
            instances={instances}
            contentType={targetType}
          />
        )
      default:
        // Optionally log unknown rule types
        console.warn(`Unknown rule type encountered: ${ruleType}`)
        return null
    }
  }

  return (
    <div className="grid gap-6">
      <RouteTypeSelectionModal
        open={showTypeModal}
        onOpenChange={setShowTypeModal}
        onTypeSelect={handleTypeSelect}
        contentType={targetType}
      />

      {isLoading &&
      rules.length === 0 &&
      !localRules.length ? // Initially loading and don't know if there are rules
      // Show nothing specific (just the container)
      null : isLoading && hasExistingRoutes ? (
        // Loading with existing rules - show skeletons
        <div className="grid gap-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-text">
              {targetType === 'radarr' ? 'Radarr' : 'Sonarr'} Content Routes
            </h2>
          </div>
          <div className="grid gap-4">
            <ContentRouteCardSkeleton />
            <ContentRouteCardSkeleton />
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

            {/* Local (unsaved) routes */}
            {localRules.map((rule) => renderRouteCard(rule, true))}

            {/* Show skeleton for loading states when *updating* existing rules and list is empty */}
            {isLoading &&
              Object.keys(savingRules).some(
                (key) => !key.startsWith('temp-'),
              ) && // Check if saving non-temp rule
              rules.length === 0 &&
              localRules.length === 0 && ( // Only if list becomes empty during save
                <div className="opacity-40 pointer-events-none">
                  <ContentRouteCardSkeleton />
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
        routeType={
          rules.find((r) => r.id === deleteConfirmationRuleId)?.type === 'genre'
            ? 'genre route'
            : rules.find((r) => r.id === deleteConfirmationRuleId)?.type ===
                'year'
              ? 'year route'
              : rules.find((r) => r.id === deleteConfirmationRuleId)?.type ===
                  'language'
                ? 'language route'
                : 'routing rule'
        }
      />
    </div>
  )
}

export default ContentRouterSection
