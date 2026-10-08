import { useStore } from '@tanstack/react-form'
import { Separator } from '@/components/ui/separator'
import { RouteCardFrame } from '@/features/library/components/content-router/route-card-frame'
import { RouteCardHeader } from '@/features/library/components/content-router/route-card-header'
import { RouteEditor } from '@/features/library/components/content-router/route-editor'
import type { ConditionCatalog } from '@/features/library/hooks/content-router/useConditionCatalog'
import { useRouteEditorForm } from '@/features/library/hooks/content-router/useRouteEditorForm'
import type { RouteTargets } from '@/features/library/hooks/content-router/useRouteTargets'
import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import { conditionNodes } from '@/features/library/lib/content-router/route-form'
import { ruleTokens } from '@/features/library/lib/content-router/rule-summary'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']

export interface RouteSwitch {
  onChange: (id: number, enabled: boolean) => void
  error: (id: number) => string | null
  pending: (id: number) => boolean
}

interface ClosedRouteCardProps {
  rule: RouterRule
  catalog: ConditionCatalog
  targets: RouteTargets
  routeSwitch: RouteSwitch
  onOpen: () => void
}

export function ClosedRouteCard({
  rule,
  catalog,
  targets,
  routeSwitch,
  onOpen,
}: ClosedRouteCardProps) {
  const enabled = rule.enabled ?? true
  const exclude = rule.exclude_from_routing ?? false
  return (
    <RouteCardFrame>
      <RouteCardHeader
        route={{
          name: rule.name.trim() || 'Untitled route',
          tokens: ruleTokens(
            conditionNodes(rule.condition, catalog.controlFor, catalog.blank),
            catalog.valueLabel,
          ),
          destination: targets.destination({
            exclude,
            instanceId: rule.target_instance_id,
            qualityProfile: rule.quality_profile || null,
            rootFolder: rule.root_folder || null,
          }),
          order: rule.order ?? undefined,
          enabled,
          requiresApproval: !exclude && (rule.always_require_approval ?? false),
        }}
        open={false}
        onToggleOpen={onOpen}
        onEnabledChange={(next) => routeSwitch.onChange(rule.id, next)}
        enabledDisabled={routeSwitch.pending(rule.id)}
        enabledError={routeSwitch.error(rule.id)}
      />
    </RouteCardFrame>
  )
}

interface OpenRouteCardProps {
  type: RouteType
  /** Null while creating a route. */
  rule: RouterRule | null
  catalog: ConditionCatalog
  targets: RouteTargets
  routeSwitch: RouteSwitch
  /** Collapsing asks first while there are unsaved changes, Cancel discards them. */
  onCollapse: () => void
  onClose: () => void
  onDelete: (rule: RouterRule) => void
  reportDirty: (dirty: boolean) => void
}

export function OpenRouteCard({
  type,
  rule,
  catalog,
  targets,
  routeSwitch,
  onCollapse,
  onClose,
  onDelete,
  reportDirty,
}: OpenRouteCardProps) {
  const editor = useRouteEditorForm({
    type,
    rule,
    catalog,
    targets,
    onSaved: onClose,
    reportDirty,
  })
  const values = useStore(editor.form.store, (state) => state.values)
  const exclude = values.action === 'exclude'
  const instanceId = Number(values.routing.instanceId)

  return (
    <RouteCardFrame>
      <RouteCardHeader
        route={{
          name:
            values.name.trim() ||
            (rule === null ? 'New route' : 'Untitled route'),
          tokens: ruleTokens(values.conditions, catalog.valueLabel),
          destination: targets.destination({
            exclude,
            instanceId: instanceId || null,
            qualityProfile: values.routing.qualityProfile,
            rootFolder: values.routing.rootFolder,
          }),
          order: values.order,
          enabled: rule === null ? editor.newEnabled : (rule.enabled ?? true),
          requiresApproval: !exclude && values.always_require_approval,
        }}
        open
        onToggleOpen={onCollapse}
        onEnabledChange={(next) =>
          rule === null
            ? editor.setNewEnabled(next)
            : routeSwitch.onChange(rule.id, next)
        }
        enabledDisabled={rule !== null && routeSwitch.pending(rule.id)}
        enabledError={rule === null ? null : routeSwitch.error(rule.id)}
      />
      <Separator />
      <RouteEditor
        type={type}
        editor={editor}
        catalog={catalog}
        onCancel={onClose}
        onDelete={rule === null ? undefined : () => onDelete(rule)}
      />
    </RouteCardFrame>
  )
}
