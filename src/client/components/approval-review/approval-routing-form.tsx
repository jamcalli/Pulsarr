import {
  MINIMUM_AVAILABILITY_LABELS,
  RADARR_MONITOR_LABELS,
} from '@root/schemas/radarr/add-options.schema'
import { ApprovalRoutingFormSkeleton } from '@/components/approval-review/approval-review-skeleton'
import { BusyLabel } from '@/components/busy-label'
import { ErrorAlert } from '@/components/error-alert'
import { LeaveDialog } from '@/components/leave-dialog'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import type { ApprovalReview } from '@/hooks/useApprovalReview'
import { useApprovalRoutingForm } from '@/hooks/useApprovalRoutingForm'
import { useApprovalTarget } from '@/hooks/useApprovalTarget'
import { useArrInstanceOptions } from '@/hooks/useArrInstanceOptions'
import { useCreateArrTag } from '@/hooks/useCreateArrTag'
import { type ArrTarget, defaultRouting } from '@/lib/approval'
import { ARR_TYPE_LABELS, SERIES_TYPE_LABELS } from '@/lib/arr-labels'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']
type ApprovalRouting = components['schemas']['ApprovalRouting']

const HELP =
  'Changes apply to this request only. Your instance defaults stay as they are.'

function labelOptions(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }))
}

interface ApprovalRoutingFormProps {
  approval: ApprovalRequest
  review: ApprovalReview
}

export function ApprovalRoutingForm({
  approval,
  review,
}: ApprovalRoutingFormProps) {
  const { routing, type, instances } = useApprovalTarget(approval)
  const fallback = instances.defaultTarget ?? instances.targets[0] ?? null
  const initial = routing ?? (fallback ? defaultRouting(fallback) : null)
  const options = useArrInstanceOptions(
    type,
    initial?.instanceId ?? null,
    initial !== null,
  )

  if (instances.errorMessage) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorAlert message={instances.errorMessage} />
        <CancelOnly review={review} />
      </div>
    )
  }
  if (!instances.hasData || options.isLoading) {
    return <ApprovalRoutingFormSkeleton />
  }
  if (!initial) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">
          Add a {ARR_TYPE_LABELS[type]} instance before you set routing.
        </p>
        <CancelOnly review={review} />
      </div>
    )
  }
  return (
    <RoutingForm
      type={type}
      initial={initial}
      unsaved={routing === null}
      review={review}
    />
  )
}

function CancelOnly({ review }: { review: ApprovalReview }) {
  return (
    <div className="flex justify-end">
      <Button type="button" variant="outline" onClick={review.cancelEdit}>
        Cancel
      </Button>
    </div>
  )
}

interface RoutingFormProps {
  type: ArrTarget['type']
  initial: ApprovalRouting
  /** True when no routing is stored yet, so the prefilled defaults can be saved untouched. */
  unsaved: boolean
  review: ApprovalReview
}

function RoutingForm({ type, initial, unsaved, review }: RoutingFormProps) {
  const {
    form,
    dirty,
    leaveGuard,
    instanceId,
    options,
    showSynced,
    instanceOptions,
    syncedOptions,
    seasonMonitoringOptions,
    switchInstance,
  } = useApprovalRoutingForm({ type, initial, review })
  const createTag = useCreateArrTag(type, instanceId)
  const busy = review.busy !== null
  const fieldsDisabled = busy || !options.connected || options.isLoading
  const saveDisabled = fieldsDisabled || !(dirty || unsaved)

  const arrFields =
    type === 'sonarr' ? (
      <>
        <form.AppField name="seasonMonitoring">
          {(field) => (
            <field.SelectField
              label="Season monitoring"
              orientation="vertical"
              disabled={fieldsDisabled}
              options={seasonMonitoringOptions}
            />
          )}
        </form.AppField>
        <form.AppField name="seriesType">
          {(field) => (
            <field.SegmentedField
              label="Series type"
              orientation="vertical"
              disabled={fieldsDisabled}
              options={labelOptions(SERIES_TYPE_LABELS)}
            />
          )}
        </form.AppField>
      </>
    ) : (
      <>
        <form.AppField name="minimumAvailability">
          {(field) => (
            <field.SegmentedField
              label="Minimum availability"
              orientation="vertical"
              disabled={fieldsDisabled}
              options={labelOptions(MINIMUM_AVAILABILITY_LABELS)}
            />
          )}
        </form.AppField>
        <form.AppField name="monitor">
          {(field) => (
            <field.SelectField
              label="Monitor"
              orientation="vertical"
              disabled={fieldsDisabled}
              options={labelOptions(RADARR_MONITOR_LABELS)}
            />
          )}
        </form.AppField>
      </>
    )

  return (
    <form.AppForm>
      <form.Form className="flex flex-col gap-4">
        <p className="text-muted-foreground">{HELP}</p>
        <FieldGroup className="gap-4">
          <form.AppField
            name="instanceId"
            listeners={{ onChange: ({ value }) => switchInstance(value) }}
          >
            {(field) => (
              <field.SelectField
                label="Instance"
                description="Switching instance resets the quality profile and root folder."
                orientation="vertical"
                disabled={busy}
                options={instanceOptions}
              />
            )}
          </form.AppField>
          <ErrorAlert message={options.errorMessage} />
          <form.AppField name="qualityProfile">
            {(field) => (
              <field.SelectField
                label="Quality profile"
                orientation="vertical"
                disabled={fieldsDisabled}
                options={options.qualityProfiles}
              />
            )}
          </form.AppField>
          <form.AppField name="rootFolder">
            {(field) => (
              <field.SelectField
                label="Root folder"
                orientation="vertical"
                disabled={fieldsDisabled}
                options={options.rootFolders}
              />
            )}
          </form.AppField>
          {arrFields}
          <form.AppField name="searchOnAdd">
            {(field) => (
              <field.SwitchField
                label="Search on add"
                description={
                  field.state.value
                    ? 'Search as soon as it is added'
                    : 'Add without searching'
                }
                disabled={fieldsDisabled}
              />
            )}
          </form.AppField>
          <form.AppField name="tags">
            {(field) => (
              <field.TagsField
                label="Tags"
                orientation="vertical"
                disabled={fieldsDisabled}
                emptyText="No tags on this instance"
                options={options.tags}
                onCreate={createTag}
              />
            )}
          </form.AppField>
          {showSynced && (
            <form.AppField name="syncedInstances">
              {(field) => (
                <field.TagsField
                  label="Also send to"
                  description="Synced instances use their own defaults."
                  orientation="vertical"
                  disabled={busy}
                  options={syncedOptions}
                />
              )}
            </form.AppField>
          )}
        </FieldGroup>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={review.cancelEdit}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saveDisabled}>
            <BusyLabel
              busy={review.busy === 'save'}
              label="Save routing"
              busyLabel="Saving..."
            />
          </Button>
        </div>
      </form.Form>
      <LeaveDialog
        open={leaveGuard.blocked}
        onStay={leaveGuard.reset}
        onLeave={leaveGuard.proceed}
      />
    </form.AppForm>
  )
}
