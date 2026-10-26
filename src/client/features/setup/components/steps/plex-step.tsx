import { useState } from 'react'
import { BusyLabel } from '@/components/busy-label'
import { ErrorAlert } from '@/components/error-alert'
import { InlineLink } from '@/components/inline-link'
import { PinLinkPanel } from '@/components/plex/pin-link-panel'
import { TokenField } from '@/components/plex/token-field'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type SetupStepProps,
  StepLayout,
} from '@/features/setup/components/step-layout'
import { useTokenLinkForm } from '@/hooks/plex/useTokenLinkForm'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import { useSetupStore } from '@/stores/setupStore'

type LinkMethod = 'pin' | 'token'

function LinkedNote() {
  const dismiss = useSetupStore((state) => state.dismiss)
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <StatusPill tone="on" label="Linked" />
      <span>
        To switch accounts later,{' '}
        <InlineLink to={pageHref(NAV_PAGES.plexConnection)} onClick={dismiss}>
          open Plex connection
        </InlineLink>
        .
      </span>
    </p>
  )
}

export function PlexStep({ steps, onDirtyChange }: SetupStepProps) {
  const [method, setMethod] = useState<LinkMethod>('pin')
  const link = useTokenLinkForm(steps.next)
  const { linked } = steps.facts
  const pasting = !linked && method === 'token'

  const primary = pasting ? (
    <Button
      type="submit"
      disabled={!link.dirty || link.isRejected || link.busy}
    >
      <BusyLabel
        busy={link.busy}
        label="Link account"
        busyLabel="Verifying..."
      />
    </Button>
  ) : (
    <Button type="button" disabled={!linked} onClick={steps.next}>
      Continue
    </Button>
  )

  return (
    <link.form.AppForm>
      <link.form.Form className="contents">
        <StepLayout
          step="plex"
          onDirtyChange={onDirtyChange}
          onBack={null}
          onSkip={null}
          note={pasting && link.failure ? link.message : null}
          actions={primary}
        >
          {linked ? (
            <LinkedNote />
          ) : (
            <Tabs
              value={method}
              onValueChange={(next) =>
                setMethod(next === 'token' ? 'token' : 'pin')
              }
            >
              <TabsList
                aria-label="How to link"
                className="max-md:w-full max-md:*:flex-1"
              >
                <TabsTrigger value="pin">Sign in with Plex</TabsTrigger>
                <TabsTrigger value="token">Paste a token</TabsTrigger>
              </TabsList>
              <TabsContent
                value="pin"
                className="flex flex-col items-start gap-3"
              >
                <PinLinkPanel active={method === 'pin'} onLinked={steps.next} />
              </TabsContent>
              <TabsContent value="token" className="flex flex-col gap-3">
                <TokenField link={link} />
                <ErrorAlert message={link.errorMessage} />
              </TabsContent>
            </Tabs>
          )}
        </StepLayout>
      </link.form.Form>
    </link.form.AppForm>
  )
}
