import { ConfigPageGate } from '@/components/config-page-gate'
import { LeaveDialog } from '@/components/leave-dialog'
import { NewUserDefaultsFields } from '@/components/new-user-defaults-fields'
import { Page, PageHeader } from '@/components/page-header'
import { SaveBar } from '@/components/settings/save-bar'
import { NewUserDefaultsSkeleton } from '@/features/users/components/new-user-defaults/new-user-defaults-skeleton'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { useNewUserDefaultsForm } from '@/hooks/useNewUserDefaultsForm'
import { NAV_PAGES } from '@/lib/navigation'
import type { components } from '@/types/api.js'

const SECTION = 'Users'
const TITLE = NAV_PAGES.newUserDefaults.label
const DESCRIPTION = 'The settings Plex users get when Pulsarr first adds them.'

function NewUserDefaults({
  config,
}: {
  config: components['schemas']['Config']
}) {
  const { form, dirty, saving, saved, errorMessage, discard } =
    useNewUserDefaultsForm(config)
  const guard = useLeaveGuard(dirty)

  return (
    <Page>
      <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
      <form.AppForm>
        <form.Form className="flex flex-col gap-5">
          <NewUserDefaultsFields form={form} />
          <SaveBar
            dirty={dirty}
            isSubmitting={saving}
            saved={saved}
            errorMessage={errorMessage}
            onDiscard={discard}
          />
        </form.Form>
      </form.AppForm>
      <LeaveDialog
        open={guard.blocked}
        onStay={guard.reset}
        onLeave={guard.proceed}
      />
    </Page>
  )
}

export default function NewUserDefaultsPage() {
  return (
    <ConfigPageGate
      section={SECTION}
      title={TITLE}
      description={DESCRIPTION}
      skeleton={<NewUserDefaultsSkeleton />}
    >
      {(config) => <NewUserDefaults config={config} />}
    </ConfigPageGate>
  )
}
