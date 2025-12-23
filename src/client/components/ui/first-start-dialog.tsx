import { AlertTriangle, Loader2, Play } from 'lucide-react'
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

interface FirstStartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  isSubmitting?: boolean
}

interface ChecklistItemProps {
  title: string
  description: string
  link: string
  linkText: string
}

function ChecklistItem({
  title,
  description,
  link,
  linkText,
}: ChecklistItemProps) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5">•</span>
      <div className="flex-1">
        <span className="font-semibold">{title}</span>
        <span> - {description} </span>
        <Link to={link} className="text-blue-400 hover:text-blue-500">
          {linkText}
        </Link>
      </div>
    </li>
  )
}

/**
 * Dialog shown when starting the workflow for the first time.
 *
 * Provides a checklist of settings the admin should review before
 * starting the main workflow, along with a warning about potentially
 * routing many items on first sync.
 */
export function FirstStartDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting = false,
}: FirstStartDialogProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Before You Start
          </CredenzaTitle>
          <CredenzaDescription>
            Please review the following settings before starting the workflow
            for the first time:
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody className="text-sm font-base text-foreground">
          <ul className="space-y-2 mb-4">
            <ChecklistItem
              title="Sonarr Instances"
              description="Ensure your instances are configured with the correct quality profiles, root folders, and settings."
              link="/sonarr/instances"
              linkText="Review Sonarr"
            />
            <ChecklistItem
              title="Radarr Instances"
              description="Ensure your instances are configured with the correct quality profiles, root folders, and settings."
              link="/radarr/instances"
              linkText="Review Radarr"
            />
            <ChecklistItem
              title="User Settings"
              description="Configure which users can sync, require approval, and set quotas."
              link="/plex/users"
              linkText="Review Users"
            />
            <li className="flex items-start gap-2">
              <span className="mt-0.5">•</span>
              <div className="flex-1">
                <span className="font-semibold">Content Router</span>
                <span>
                  {' '}
                  - If using advanced routing rules, ensure they are configured
                  correctly.{' '}
                </span>
                <Link
                  to="/sonarr/content-router"
                  className="text-blue-400 hover:text-blue-500"
                >
                  Sonarr Rules
                </Link>
                <span> / </span>
                <Link
                  to="/radarr/content-router"
                  className="text-blue-400 hover:text-blue-500"
                >
                  Radarr Rules
                </Link>
              </div>
            </li>
            <ChecklistItem
              title="New User Defaults"
              description="Set default permissions for newly discovered Plex users."
              link="/utilities/new-user-defaults"
              linkText="Review Defaults"
            />
          </ul>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-md">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              <span className="font-bold">Note:</span> The first sync may route
              many items from your users' watchlists to Sonarr/Radarr. Ensure
              your settings are correct before proceeding.
            </p>
          </div>
        </CredenzaBody>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral">Cancel</Button>
          </CredenzaClose>
          <Button
            variant="default"
            onClick={async () => {
              await onConfirm()
              onOpenChange(false)
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1 fill-current" />
                Start Workflow
              </>
            )}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
