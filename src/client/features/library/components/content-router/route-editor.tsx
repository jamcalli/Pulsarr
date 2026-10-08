import { ROUTER_RULE_PRIORITY } from '@root/schemas/content-router/content-router.schema'
import { useStore } from '@tanstack/react-form'
import { Trash2 } from 'lucide-react'
import { BusyLabel } from '@/components/busy-label'
import { ErrorAlert } from '@/components/error-alert'
import { RoutingFields } from '@/components/routing-fields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FieldGroup, FieldSeparator } from '@/components/ui/field'
import { ConditionBuilder } from '@/features/library/components/content-router/condition-builder'
import type { ConditionCatalog } from '@/features/library/hooks/content-router/useConditionCatalog'
import type { RouteEditor as RouteEditorState } from '@/features/library/hooks/content-router/useRouteEditorForm'
import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import type { RouteAction } from '@/features/library/lib/content-router/route-form'
import { excludeDescription } from '@/features/library/lib/content-router/route-list'
import { ARR_TYPE_LABELS } from '@/lib/arr-labels'
import { formatNumber } from '@/lib/format'

interface RouteEditorProps {
  type: RouteType
  editor: RouteEditorState
  catalog: ConditionCatalog
  onCancel: () => void
  /** Absent for a route that is not created yet. */
  onDelete?: () => void
}

export function RouteEditor({
  type,
  editor,
  catalog,
  onCancel,
  onDelete,
}: RouteEditorProps) {
  const { form, routing, saving } = editor
  const action = useStore(form.store, (state) => state.values.action)
  const approval = useStore(
    form.store,
    (state) => state.values.always_require_approval,
  )
  const fieldsDisabled = saving || !routing.connected || routing.isLoading
  const saveDisabled = saving || !(editor.dirty || editor.isNew)
  const priorityDescription =
    action === 'exclude'
      ? undefined
      : `${formatNumber(ROUTER_RULE_PRIORITY.min)} to ${formatNumber(ROUTER_RULE_PRIORITY.max)}. Higher runs first.`
  const actionOptions: Array<{ value: RouteAction; label: string }> = [
    { value: 'route', label: `Send to ${ARR_TYPE_LABELS[type]}` },
    { value: 'exclude', label: "Don't route" },
  ]

  return (
    <form.AppForm>
      <form.Form className="flex flex-col gap-6">
        <FieldGroup className="gap-6">
          <form.AppField name="name">
            {(field) => <field.TextField label="Route name" />}
          </form.AppField>
          <form.AppField name="order">
            {(field) => (
              <field.NumberField
                label="Priority"
                description={priorityDescription}
                min={ROUTER_RULE_PRIORITY.min}
                max={ROUTER_RULE_PRIORITY.max}
              />
            )}
          </form.AppField>
          <FieldSeparator />
          <ConditionBuilder form={form} catalog={catalog} disabled={saving} />
          <FieldSeparator />
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-2.5 text-base font-bold">
                <Badge>Then</Badge>
                When a request matches
              </span>
              {action === 'exclude' && (
                <p className="text-sm text-pretty text-muted-foreground">
                  {excludeDescription(type)}
                </p>
              )}
            </div>
            <form.AppField name="action">
              {(field) => (
                <field.SegmentedField
                  label="When a request matches"
                  labelHidden
                  disabled={saving}
                  options={actionOptions}
                />
              )}
            </form.AppField>
          </div>
          {action === 'route' && (
            <>
              <RoutingFields
                form={form}
                fields="routing"
                type={type}
                orientation="responsive"
                instanceOptions={editor.instanceOptions}
                qualityProfiles={routing.qualityProfiles}
                rootFolders={routing.rootFolders}
                tags={routing.tags}
                seasonMonitoringOptions={editor.seasonMonitoringOptions}
                errorMessage={routing.errorMessage}
                instanceDisabled={saving}
                fieldsDisabled={fieldsDisabled}
                showMinimumAvailability={false}
                inherit
                onCreateTag={editor.createTag}
                onInstanceChange={editor.switchInstance}
              />
              <FieldSeparator />
              <form.AppField name="always_require_approval">
                {(field) => (
                  <field.SwitchField
                    label="Always require approval"
                    description="Matching requests wait for an admin, even from users who can request freely."
                    disabled={saving}
                  />
                )}
              </form.AppField>
              {approval && (
                <form.AppField name="approval_reason">
                  {(field) => (
                    <field.TextField
                      label="Approval reason"
                      description="Shown to admins on the held request."
                      disabled={saving}
                    />
                  )}
                </form.AppField>
              )}
              <form.AppField name="bypass_user_quotas">
                {(field) => (
                  <field.SwitchField
                    label="Bypass user quotas"
                    description="Matching requests don't count toward the requester's quota."
                    disabled={saving}
                  />
                )}
              </form.AppField>
            </>
          )}
        </FieldGroup>
        <ErrorAlert message={editor.errorMessage} />
        <div className="flex flex-wrap items-center gap-2">
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={onDelete}
            >
              <Trash2
                data-icon="inline-start"
                aria-hidden
                className="text-destructive-text"
              />
              Delete route
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saveDisabled}>
              <BusyLabel
                busy={saving}
                label={editor.isNew ? 'Create route' : 'Save route'}
                busyLabel="Saving..."
              />
            </Button>
          </div>
        </div>
      </form.Form>
    </form.AppForm>
  )
}
