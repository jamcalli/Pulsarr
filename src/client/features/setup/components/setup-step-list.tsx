import { cn } from 'cn'
import { Check } from 'lucide-react'
import { type ReactNode, useCallback } from 'react'
import { LockLine } from '@/components/settings/lock-line'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SetupSteps } from '@/features/setup/hooks/useSetupSteps'
import { SETUP_STEP_LABELS, SETUP_STEPS } from '@/features/setup/lib/steps'
import { useIsMobile } from '@/hooks/useIsMobile'
import { LINK_FIRST_REASON } from '@/lib/plex/account-facts'

export function StepRail({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-3 max-md:border-b max-md:border-divider max-md:px-4 max-md:pb-2 md:w-52 md:border-r md:border-divider md:pr-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SetupStepList({ steps }: { steps: SetupSteps }) {
  const phone = useIsMobile()
  const locked = !steps.facts.linked
  const revealCurrent = useCallback(
    (tab: HTMLButtonElement | null) => {
      if (phone) tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    },
    [phone],
  )

  return (
    <StepRail>
      <nav aria-label="Setup steps">
        <Tabs
          value={steps.current}
          onValueChange={(value) => {
            const id = SETUP_STEPS.find((step) => step === value)
            if (id) steps.goTo(id)
          }}
          orientation={phone ? 'horizontal' : 'vertical'}
        >
          <TabsList
            variant="line"
            className="w-full justify-start max-md:overflow-x-auto"
          >
            {SETUP_STEPS.map((id) => (
              <TabsTrigger
                key={id}
                value={id}
                disabled={locked && id !== 'plex'}
                ref={id === steps.current ? revealCurrent : undefined}
              >
                {SETUP_STEP_LABELS[id]}
                {steps.done(id) && (
                  <>
                    <Check data-icon="inline-end" className="md:ml-auto" />
                    <span className="sr-only">done</span>
                  </>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </nav>
      {locked && (
        <div className="text-sm">
          <LockLine reason={LINK_FIRST_REASON} />
        </div>
      )}
    </StepRail>
  )
}
