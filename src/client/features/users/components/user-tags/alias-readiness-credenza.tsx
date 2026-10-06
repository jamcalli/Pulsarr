import { Loader2, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useMinLoading } from '@/hooks/useMinLoading'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import { $api, apiErrorMessage } from '@/lib/tanstackApi'

interface AliasReadinessCredenzaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

function users(count: number) {
  return count === 1 ? '1 user' : `${count} users`
}

export function AliasReadinessCredenza({
  open,
  onOpenChange,
  onConfirm,
}: AliasReadinessCredenzaProps) {
  const readiness = useMinLoading(
    $api.useQuery('get', '/v1/users/alias-readiness', undefined, {
      enabled: open,
    }),
  )
  const data = readiness.data
  const errorMessage = readiness.error
    ? (apiErrorMessage(readiness.error) ?? "Couldn't check alias readiness.")
    : null
  const ready =
    data !== undefined &&
    data.missingAliasCount === 0 &&
    data.duplicateAliasCount === 0
  const usersLink = (
    <Button
      variant="link"
      size="sm"
      nativeButton={false}
      render={<Link to={pageHref(NAV_PAGES.plexUsers)} />}
    >
      {data?.missingAliasCount ? 'Set aliases' : 'Review users'}
    </Button>
  )

  return (
    <ConfirmCredenza
      open={open}
      onOpenChange={onOpenChange}
      title="Switch to alias naming"
      description="Tags and labels will use user aliases instead of Plex usernames."
      confirmLabel="Confirm"
      confirmDisabled={!data || errorMessage !== null}
      onConfirm={onConfirm}
      errorMessage={errorMessage}
    >
      {readiness.isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span className="sr-only">Checking aliases</span>
        </div>
      )}
      {data && (
        <>
          {data.missingAliasCount > 0 && (
            <p>
              <span className="font-bold">
                {users(data.missingAliasCount)} missing an alias.
              </span>{' '}
              They fall back to their Plex username, so naming will be mixed.
            </p>
          )}
          {data.duplicateAliasCount > 0 && (
            <p>
              <span className="font-bold">
                {users(data.duplicateAliasCount)} share an alias.
              </span>{' '}
              They will share tags and labels, so you can't tell who asked for
              what.
            </p>
          )}
          {ready ? (
            <p>All sync-enabled users have unique aliases set.</p>
          ) : (
            <p>{usersLink}</p>
          )}
          <Alert variant="warn">
            <TriangleAlert />
            <AlertDescription>
              If you add or change aliases later, existing tags and labels won't
              update on their own. You'll need to remove them all and sync
              again.
            </AlertDescription>
          </Alert>
        </>
      )}
    </ConfirmCredenza>
  )
}
