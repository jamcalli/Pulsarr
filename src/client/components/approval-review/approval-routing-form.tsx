import { ApprovalRoutingFormSkeleton } from '@/components/approval-review/approval-review-skeleton'
import { BusyLabel } from '@/components/busy-label'
import { ErrorAlert } from '@/components/error-alert'
import { LeaveDialog } from '@/components/leave-dialog'
import { RoutingFields } from '@/components/routing-fields'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import type { ApprovalReview } from '@/hooks/useApprovalReview'
import { useApprovalRoutingForm } from '@/hooks/useApprovalRoutingForm'
import { useApprovalTarget } from '@/hooks/useApprovalTarget'
import { useArrInstanceOptions } from '@/hooks/useArrInstanceOptions'
import { useCreateArrTag } from '@/hooks/useCreateArrTag'
import { type ArrTarget, defaultRouting } from '@/lib/approval'
import { ARR_TYPE_LABELS } from '@/lib/arr-labels'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']
type ApprovalRouting = components['schemas']['ApprovalRouting']

const HELP =
  'Changes apply to this request only. Your instance defaults stay as they are.'

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

  return (
    <form.AppForm>
      <form.Form className="flex flex-col gap-4">
        <p className="text-muted-foreground">{HELP}</p>
        <FieldGroup className="gap-4">
          <RoutingFields
            form={form}
            fields={{
              instanceId: 'instanceId',
              qualityProfile: 'qualityProfile',
              rootFolder: 'rootFolder',
              tags: 'tags',
              searchOnAdd: 'searchOnAdd',
              seasonMonitoring: 'seasonMonitoring',
              seriesType: 'seriesType',
              monitor: 'monitor',
              minimumAvailability: 'minimumAvailability',
            }}
            type={type}
            orientation="vertical"
            instanceOptions={instanceOptions}
            qualityProfiles={options.qualityProfiles}
            rootFolders={options.rootFolders}
            tags={options.tags}
            seasonMonitoringOptions={seasonMonitoringOptions}
            errorMessage={options.errorMessage}
            instanceDisabled={busy}
            fieldsDisabled={fieldsDisabled}
            showMinimumAvailability
            onCreateTag={createTag}
            onInstanceChange={switchInstance}
          />
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
