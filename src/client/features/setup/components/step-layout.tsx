import { type ReactNode, useEffect } from 'react'
import { ActionGroup } from '@/components/action-group'
import { BusyLabel } from '@/components/busy-label'
import { CredenzaBody, CredenzaFooter } from '@/components/credenza'
import { BlockTitle } from '@/components/settings/block-title'
import { Button } from '@/components/ui/button'
import type { SetupSteps } from '@/features/setup/hooks/useSetupSteps'
import {
  SETUP_STEP_DESCRIPTIONS,
  SETUP_STEP_LABELS,
  type SetupStepId,
} from '@/features/setup/lib/steps'
import { SettingsSurfaceContext } from '@/lib/settings-surface'
import type { components } from '@/types/api.js'

export interface SetupStepProps {
  steps: SetupSteps
  config: components['schemas']['Config']
  onDirtyChange: (dirty: boolean) => void
}

const CLEAN_SKIP_NOTE = 'Run setup again any time from the account menu.'

interface StepLayoutProps {
  step: SetupStepId
  onDirtyChange: (dirty: boolean) => void
  dirty?: boolean
  /** Hidden when null. */
  onBack: (() => void) | null
  backDisabled?: boolean
  /** Hidden when null, so pass it only when skipping differs from the primary. */
  onSkip: (() => void) | null
  /** One line beside the primary saying why it is disabled or what it waits on. */
  note?: ReactNode
  actions: ReactNode
  children: ReactNode
}

/** One step's body and footer, which a form step renders inside its form so the footer can submit it. */
export function StepLayout({
  step,
  onDirtyChange,
  dirty = false,
  onBack,
  backDisabled = false,
  onSkip,
  note,
  actions,
  children,
}: StepLayoutProps) {
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  const footerNote = note ?? (onSkip && !dirty ? CLEAN_SKIP_NOTE : null)

  return (
    <>
      <CredenzaBody className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <BlockTitle>{SETUP_STEP_LABELS[step]}</BlockTitle>
          <p className="text-sm text-muted-foreground">
            {SETUP_STEP_DESCRIPTIONS[step]}
          </p>
        </div>
        <SettingsSurfaceContext value={step === 'server' ? 'rows' : 'flat'}>
          {children}
        </SettingsSurfaceContext>
      </CredenzaBody>
      <CredenzaFooter className="flex-col md:col-span-2 md:flex-row md:items-center">
        <p className="text-sm text-muted-foreground empty:hidden max-md:text-center md:order-2 md:flex-1 md:text-right">
          {footerNote}
        </p>
        <ActionGroup className="max-md:flex-col-reverse max-md:*:flex-auto md:order-4">
          {actions}
        </ActionGroup>
        {(onBack || onSkip) && (
          <ActionGroup className="md:contents">
            {onBack && (
              <Button
                type="button"
                variant="outline"
                disabled={backDisabled}
                onClick={onBack}
                className="md:order-1 md:mr-auto"
              >
                Back
              </Button>
            )}
            {onSkip && (
              <Button
                type="button"
                variant="ghost"
                onClick={onSkip}
                className="md:order-3"
              >
                Skip for now
              </Button>
            )}
          </ActionGroup>
        )}
      </CredenzaFooter>
    </>
  )
}

/** Submits and moves on once it saves, and moves on at once when clean if onContinue is given. */
export function SaveAndContinueButton({
  dirty,
  saving,
  disabled = false,
  onContinue,
}: {
  dirty: boolean
  saving: boolean
  disabled?: boolean
  onContinue?: () => void
}) {
  if (onContinue && !dirty && !saving) {
    return (
      <Button type="button" onClick={onContinue}>
        Continue
      </Button>
    )
  }
  return (
    <Button type="submit" disabled={disabled || saving}>
      <BusyLabel
        busy={saving}
        label="Save and continue"
        busyLabel="Saving..."
      />
    </Button>
  )
}
