import {
  Credenza,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/credenza'
import { SetupDialogSkeleton } from '@/features/setup/components/setup-dialog-skeleton'
import { SetupStepList } from '@/features/setup/components/setup-step-list'
import type { SetupStepProps } from '@/features/setup/components/step-layout'
import { ArrStep } from '@/features/setup/components/steps/arr-step'
import { DefaultsStep } from '@/features/setup/components/steps/defaults-step'
import { FinishStep } from '@/features/setup/components/steps/finish-step'
import { PlexStep } from '@/features/setup/components/steps/plex-step'
import { ServerStep } from '@/features/setup/components/steps/server-step'
import {
  SETUP_STEP_DESCRIPTIONS,
  type SetupStepId,
} from '@/features/setup/lib/steps'

interface SetupCredenzaProps extends SetupStepProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Hides the close button while the dialog cannot be closed. */
  locked: boolean
}

function StepBody({ id, ...props }: SetupStepProps & { id: SetupStepId }) {
  switch (id) {
    case 'plex':
      return <PlexStep {...props} />
    case 'server':
      return <ServerStep {...props} />
    case 'sonarr':
    case 'radarr':
      return <ArrStep key={id} type={id} {...props} />
    case 'defaults':
      return <DefaultsStep {...props} />
    case 'finish':
      return <FinishStep {...props} />
  }
}

export function SetupCredenza({
  open,
  onOpenChange,
  locked,
  ...props
}: SetupCredenzaProps) {
  const { steps } = props

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent
        fullHeight
        hideCloseButton={locked}
        className="md:grid md:h-[min(45rem,100dvh-2rem)] md:max-w-4xl md:grid-cols-[auto_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)_auto] md:gap-x-6"
      >
        <CredenzaHeader className="md:col-span-2">
          <CredenzaTitle>Set up Pulsarr</CredenzaTitle>
          <CredenzaDescription className="sr-only">
            {SETUP_STEP_DESCRIPTIONS[steps.current]}
          </CredenzaDescription>
        </CredenzaHeader>
        {steps.settled ? (
          <>
            <SetupStepList steps={steps} />
            <StepBody id={steps.current} {...props} />
          </>
        ) : (
          <SetupDialogSkeleton />
        )}
      </CredenzaContent>
    </Credenza>
  )
}
