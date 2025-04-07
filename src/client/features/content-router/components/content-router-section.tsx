import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import GenreRouteCard from '@/features/content-router/components/genre-route-card'
import YearRouteCard from '@/features/content-router/components/year-route-card'
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

type TempRule = Partial<
  Omit<ContentRouterRule, 'id' | 'created_at' | 'updated_at'>
> & {
  tempId: string
  name: string
  type: string
  target_type: 'radarr' | 'sonarr'
  criteria: Criteria
}

type ContentRouterSectionProps = {
  targetType: 'radarr' | 'sonarr'
  instances: (RadarrInstance | SonarrInstance)[]
  genres: string[]
  onGenreDropdownOpen: () => Promise<void>
}

export const ContentRouterSection = ({
  targetType,
  instances,
  genres,
  onGenreDropdownOpen,
}: ContentRouterSectionProps) => {
  const { toast } = useToast()
  const contentRouter =
    targetType === 'radarr'
      ? useRadarrContentRouterAdapter()
      : useSonarrContentRouterAdapter()

  const { rules, isLoading, createRule, updateRule, deleteRule, fetchRules } =
    contentRouter

  const [showTypeModal, setShowTypeModal] = useState(false)
  const [localRules, setLocalRules] = useState<TempRule[]>([])
  const [savingRules, setSavingRules] = useState<Record<string, boolean>>({})
  const [deleteConfirmationRuleId, setDeleteConfirmationRuleId] = useState<
    number | null
  >(null)

  const isMounted = useRef(false)

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

  const handleTypeSelect = (type: RouteType) => {
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
          type: type,
          target_type: targetType,
          target_instance_id: defaultInstance?.id || 0,
          criteria: {},
          root_folder: '',
          quality_profile: undefined,
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
      setSavingRules((prev) => ({ ...prev, [tempId]: true }))
      try {
        await Promise.all([
          createRule(data),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ])
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
        await Promise.all([
          updateRule(id, data),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ])
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
          delete updated[id.toString()]
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
  }, [])

  const renderRouteCard = (
    rule: ContentRouterRule | TempRule,
    isNew = false,
  ) => {
    const ruleId = isNew
      ? (rule as TempRule).tempId
      : (rule as ContentRouterRule).id
    const ruleType = (rule as ContentRouterRule | TempRule).type

    switch (ruleType) {
      case 'genre':
        return (
          <GenreRouteCard
            key={ruleId}
            route={rule as ContentRouterRule | Partial<ContentRouterRule>}
            isNew={isNew}
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
            onCancel={() =>
              isNew && handleCancelLocalRule((rule as TempRule).tempId)
            }
            onRemove={
              isNew
                ? undefined
                : () =>
                    setDeleteConfirmationRuleId((rule as ContentRouterRule).id)
            }
            onGenreDropdownOpen={onGenreDropdownOpen}
            isSaving={!!savingRules[ruleId.toString()]}
            instances={instances}
            genres={genres}
            contentType={targetType}
          />
        )
      case 'year':
        return (
          <YearRouteCard
            key={ruleId}
            route={rule as ContentRouterRule | Partial<ContentRouterRule>}
            isNew={isNew}
            onCancel={() =>
              isNew && handleCancelLocalRule((rule as TempRule).tempId)
            }
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
            isSaving={!!savingRules[ruleId.toString()]}
            instances={instances}
            contentType={targetType}
          />
        )
      default:
        console.warn(`Unknown rule type encountered: ${ruleType}`)
        return null
    }
  }

  if (isLoading && !rules.length && !localRules.length) {
    return (
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
    )
  }

  if (!rules.length && !localRules.length) {
    return (
      <div className="grid gap-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-text">
            {targetType === 'radarr' ? 'Radarr' : 'Sonarr'} Content Routes
          </h2>
        </div>
        <div className="text-center py-8 text-text">
          <p>No content routes configured</p>
          <Button onClick={() => setShowTypeModal(true)} className="mt-4">
            Add Your First Route
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <RouteTypeSelectionModal
        open={showTypeModal}
        onOpenChange={setShowTypeModal}
        onTypeSelect={handleTypeSelect}
        contentType={targetType}
      />

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-text">
          {targetType === 'radarr' ? 'Radarr' : 'Sonarr'} Content Routes
        </h2>
        <Button onClick={() => setShowTypeModal(true)}>Add Route</Button>
      </div>

      <div className="grid gap-4">
        {rules.map((rule) => renderRouteCard(rule))}
        {localRules.map((rule) => renderRouteCard(rule, true))}
        {isLoading &&
          Object.keys(savingRules).some((key) => !key.startsWith('temp-')) &&
          !rules.length &&
          !localRules.length && (
            <div className="opacity-40 pointer-events-none">
              <ContentRouteCardSkeleton />
            </div>
          )}
      </div>

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
