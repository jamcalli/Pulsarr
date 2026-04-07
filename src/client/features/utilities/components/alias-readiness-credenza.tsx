import type { AliasReadinessResponse } from '@root/schemas/users/alias-readiness.schema'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'
import { api } from '@/lib/api'

interface AliasReadinessCredenzaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function AliasReadinessCredenza({
  open,
  onOpenChange,
  onConfirm,
}: AliasReadinessCredenzaProps) {
  const [data, setData] = useState<AliasReadinessResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    setData(null)
    setIsLoading(true)
    setError(null)

    const fetchData = async () => {
      try {
        const response = await fetch(api('/v1/users/alias-readiness'))

        if (!response.ok) {
          throw new Error('Failed to check alias readiness')
        }

        const result: AliasReadinessResponse = await response.json()
        setData(result)
      } catch {
        setError('Failed to check alias readiness')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [open])

  const hasIssues =
    data && (data.missingAliasCount > 0 || data.duplicateAliasCount > 0)

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Switch to Alias Naming
          </CredenzaTitle>
          <CredenzaDescription>
            Tags and labels will use user aliases instead of Plex usernames.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody className="text-sm font-base text-foreground">
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {error && <p className="text-red-500">{error}</p>}

          {data && !isLoading && (
            <>
              {hasIssues && (
                <ul className="space-y-2 mb-4">
                  {data.missingAliasCount > 0 && (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5">•</span>
                      <div className="flex-1">
                        <span className="font-semibold">
                          {data.missingAliasCount} user
                          {data.missingAliasCount === 1 ? '' : 's'} missing
                          aliases.
                        </span>
                        <span>
                          {' '}
                          These users will fall back to their Plex username,
                          resulting in mixed naming.{' '}
                        </span>
                        <Link
                          to="/plex/users"
                          className="text-blue-400 hover:text-blue-500"
                        >
                          Set Aliases
                        </Link>
                      </div>
                    </li>
                  )}
                  {data.duplicateAliasCount > 0 && (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5">•</span>
                      <div className="flex-1">
                        <span className="font-semibold">
                          {data.duplicateAliasCount} user
                          {data.duplicateAliasCount === 1 ? '' : 's'} share
                          duplicate aliases.
                        </span>
                        <span>
                          {' '}
                          These users will share tags/labels, making content
                          attribution ambiguous.{' '}
                        </span>
                        <Link
                          to="/plex/users"
                          className="text-blue-400 hover:text-blue-500"
                        >
                          Review Users
                        </Link>
                      </div>
                    </li>
                  )}
                </ul>
              )}

              {!hasIssues && (
                <p className="mb-4">
                  All sync-enabled users have unique aliases set.
                </p>
              )}

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-md">
                <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                  <span className="font-bold">Note:</span> If you add or change
                  aliases later, existing tags/labels won't update
                  automatically. You'll need to remove all and resync.
                </p>
              </div>
            </>
          )}
        </CredenzaBody>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral">Cancel</Button>
          </CredenzaClose>
          <Button
            variant="default"
            onClick={onConfirm}
            disabled={isLoading || !!error}
          >
            Confirm
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
