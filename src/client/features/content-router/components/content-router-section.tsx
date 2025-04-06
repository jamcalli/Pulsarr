import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'
import GenreRouteCard from '@/features/content-router/components/genre-route-card'
import YearRouteCard from '@/features/content-router/components/year-route-card'
import DeleteRouteAlert from '@/features/content-router/components/delete-route-alert'
import RouteTypeSelectionModal from '@/features/content-router/components/content-route-type-modal'
import ContentRouteCardSkeleton from '@/features/content-router/components/content-route-skeleton'
import type { RouteType } from '@/features/content-router/components/content-route-type-modal'
import type {
  ContentRouterRule,
  ContentRouterRuleUpdate,
} from '@root/schemas/content-router/content-router.schema'
import { useRadarrContentRouterAdapter } from '@/features/radarr/hooks/content-router/useRadarrContentRouterAdapater'
import { useSonarrContentRouterAdapter } from '@/features/sonarr/hooks/content-router/useSonarrContentRouterAdapter'


interface TempRule {
  tempId: string
  name: string
  type: string
  target_type: 'radarr' | 'sonarr'
  criteria: Record<string, any>
  [key: string]: any
}

interface ContentRouterSectionProps {
  targetType: 'radarr' | 'sonarr'
  instances: any[]
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
  const contentRouter = targetType === 'radarr' 
    ? useRadarrContentRouterAdapter() 
    : useSonarrContentRouterAdapter()

  const [showRouteCard, setShowRouteCard] = useState(false)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [selectedType, setSelectedType] = useState<RouteType | null>(null)

  const { rules, isLoading, createRule, updateRule, deleteRule, fetchRules } = contentRouter

  // Local state to manage UI behavior
  const [localRules, setLocalRules] = useState<TempRule[]>([])
  const [savingRules, setSavingRules] = useState<{ [key: string]: boolean }>({})
  const [deleteConfirmationRuleId, setDeleteConfirmationRuleId] = useState<
    number | null
  >(null)

  // Fetch rules on component mount
  useEffect(() => {
    fetchRules().catch((error) => {
      console.error(`Failed to fetch ${targetType} routing rules:`, error)
    })
  }, [fetchRules, targetType])

  const addRoute = () => {
    setShowTypeModal(true)
  }

  const handleTypeSelect = (type: RouteType) => {
    setSelectedType(type)
    setShowRouteCard(true)
    handleAddRule(type)
  }

  const handleAddRule = useCallback(
    (type: RouteType) => {
      const defaultInstance = instances[0]
      setLocalRules((prev) => [
        ...prev,
        {
          tempId: `temp-${Date.now()}`,
          name: `New ${targetType === 'radarr' ? 'Movie' : 'Show'} ${type.charAt(0).toUpperCase() + type.slice(1)} Route`,
          type,
          target_type: targetType,
          target_instance_id: defaultInstance?.id || 0,
          criteria: {},
          root_folder: '',
          quality_profile: '',
          enabled: true,
          order: 50,
        },
      ])
    },
    [instances, targetType],
  )

  const handleSaveNewRule = useCallback(
    async (tempId: string, data: any) => {
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
          description: 'Failed to create route',
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
          description: 'Failed to update route',
          variant: 'destructive',
        })
      } finally {
        setSavingRules((prev) => {
          const updated = { ...prev }
          delete updated[id]
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
          description: 'Failed to remove route',
          variant: 'destructive',
        })
      }
    }
  }, [deleteConfirmationRuleId, deleteRule, toast])

  const handleCancelLocalRule = useCallback((tempId: string) => {
    setLocalRules((prev) => prev.filter((r) => r.tempId !== tempId))
    setShowRouteCard(false)
  }, [])

  const hasExistingRoutes = rules.length > 0

  const renderRouteCard = (
    rule: ContentRouterRule | TempRule,
    isNew = false,
  ) => {
    const ruleId = isNew
      ? (rule as TempRule).tempId
      : (rule as ContentRouterRule).id

    switch (rule.type) {
      case 'genre':
        return (
          <GenreRouteCard
            key={ruleId}
            route={rule}
            isNew={isNew}
            onSave={(data) =>
              isNew
                ? handleSaveNewRule((rule as TempRule).tempId, data)
                : handleUpdateRule((rule as ContentRouterRule).id, data)
            }
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
            onGenreDropdownOpen={onGenreDropdownOpen}
            isSaving={!!savingRules[ruleId]}
            instances={instances}
            genres={genres}
            contentType={targetType}
          />
        )
      case 'year':
        return (
          <YearRouteCard
            key={ruleId}
            route={rule}
            isNew={isNew}
            onCancel={() => {
              if (isNew) {
                handleCancelLocalRule((rule as TempRule).tempId)
              }
            }}
            onSave={(data) =>
              isNew
                ? handleSaveNewRule((rule as TempRule).tempId, data)
                : handleUpdateRule((rule as ContentRouterRule).id, data)
            }
            onRemove={
              isNew
                ? undefined
                : () =>
                    setDeleteConfirmationRuleId((rule as ContentRouterRule).id)
            }
            isSaving={!!savingRules[ruleId]}
            instances={instances}
            contentType={targetType}
          />
        )
      default:
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

      {isLoading && rules.length === 0 && !showRouteCard ? (
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
      ) : !hasExistingRoutes && !showRouteCard ? (
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

            {/* Show skeleton for loading states when updating */}
            {isLoading &&
              Object.keys(savingRules).length > 0 &&
              rules.length === 0 && (
                <div className="opacity-40 pointer-events-none">
                  <ContentRouteCardSkeleton />
                </div>
              )}
          </div>
        </>
      )}
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
              : 'routing rule'
        }
      />
    </div>
  )
}

export default ContentRouterSection
