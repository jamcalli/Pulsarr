import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { InstanceFields } from '@/components/arr/instance-fields'
import { BusyLabel } from '@/components/busy-label'
import { ConnectionTest } from '@/components/connection-test'
import { ErrorAlert } from '@/components/error-alert'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import type { InstanceEditorState } from '@/hooks/arr/useInstanceEditor'

interface InstanceEditorProps {
  editor: InstanceEditorState
  syncRows: ReactNode
  remove: { disabledReason: string | null; onRemove: () => void } | null
  onFixAddress: () => void
}

export function InstanceEditor({
  editor,
  syncRows,
  remove,
  onFixAddress,
}: InstanceEditorProps) {
  const { routing, test } = editor
  const routingNotice = routing.errorMessage ? (
    <ErrorAlert
      message={editor.optionsFailedTitle}
      detail={routing.errorMessage}
    >
      <Button
        type="button"
        variant="neutral"
        size="sm"
        disabled={routing.retrying}
        onClick={routing.retry}
      >
        <BusyLabel
          busy={routing.retrying}
          label="Retry"
          busyLabel="Retrying..."
        />
      </Button>
    </ErrorAlert>
  ) : editor.awaitingTest ? (
    <Alert variant="info">
      <Info />
      <AlertTitle>
        Test the connection to load quality profiles, root folders and tags.
      </AlertTitle>
    </Alert>
  ) : null

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup className="gap-6">
        <InstanceFields
          form={editor.form}
          fields="instance"
          type={editor.type}
          isNew={editor.isNew}
          disabled={editor.saving}
          connection={
            <ConnectionTest
              status={test.status}
              failure={test.failure}
              disabled={!test.canRun || editor.saving}
              onTest={test.run}
            >
              {test.callbackFailed && (
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  onClick={onFixAddress}
                >
                  Fix the address
                </Button>
              )}
            </ConnectionTest>
          }
          routingNotice={routingNotice}
          routingDisabled={!routing.ready}
          qualityProfiles={routing.qualityProfiles}
          rootFolders={routing.rootFolders}
          tags={routing.tags}
          seasonMonitoringOptions={editor.seasonMonitoringOptions}
          onCreateTag={editor.createTag}
          defaultLock={editor.defaultLock}
          apiKeyError={test.requiredMessage}
          syncOptions={editor.syncOptions}
        />
        {syncRows}
      </FieldGroup>
      {remove && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            disabled={editor.saving || remove.disabledReason !== null}
            onClick={remove.onRemove}
          >
            Remove instance
          </Button>
          {remove.disabledReason && (
            <span className="text-sm text-muted-foreground">
              {remove.disabledReason}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
