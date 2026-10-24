import { useEffect } from 'react'
import { LeaveDialog } from '@/components/leave-dialog'
import { SetupCredenza } from '@/features/setup/components/setup-credenza'
import { useSetupSteps } from '@/features/setup/hooks/useSetupSteps'
import { useConfig } from '@/hooks/useConfig'
import { useDirtyGuard } from '@/hooks/useDirtyGuard'
import { linkedToken } from '@/lib/plex/account-facts'
import { useSetupStore } from '@/stores/setupStore'
import type { components } from '@/types/api.js'

function SetupDialogHost({
  config,
}: {
  config: components['schemas']['Config']
}) {
  const requested = useSetupStore((state) => state.requested)
  const request = useSetupStore((state) => state.request)
  const dismiss = useSetupStore((state) => state.dismiss)
  const forced = linkedToken(config) === null
  const open = forced || requested
  const guard = useDirtyGuard()
  const steps = useSetupSteps(config, open, guard.run)

  // Linking clears `forced`, so the dialog holds itself open as requested until the admin closes it.
  useEffect(() => {
    if (forced) request()
  }, [forced, request])

  return (
    <>
      <SetupCredenza
        open={open}
        onOpenChange={(next) => {
          if (!next && !forced) guard.run(dismiss)
        }}
        locked={forced}
        steps={steps}
        config={config}
        onDirtyChange={guard.setDirty}
      />
      <LeaveDialog {...guard.leaveDialog} />
    </>
  )
}

export default function SetupDialog() {
  const { config } = useConfig()
  if (!config) return null
  return <SetupDialogHost config={config} />
}
