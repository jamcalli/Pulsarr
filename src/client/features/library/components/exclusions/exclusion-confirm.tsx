import { ConfirmCredenza } from '@/components/confirm-credenza'
import type { SingleTarget } from '@/features/library/hooks/exclusions/useExclusionActions'
import type { ExclusionsPage } from '@/features/library/hooks/exclusions/useExclusionsPage'
import {
  type ExclusionConfirmCopy,
  excludeGlobalCopy,
  excludeUserCopy,
  removeGlobalCopy,
  removeUserCopy,
} from '@/features/library/lib/exclusions/exclusion-copy'
import { ownExclusionCount } from '@/features/library/lib/exclusions/exclusion-rows'
import { useUserDirectory } from '@/hooks/useUserDirectory'

function confirmCopy(
  target: SingleTarget,
  displayName: (username: string) => string,
): ExclusionConfirmCopy {
  switch (target.kind) {
    case 'excludeUser':
      return excludeUserCopy(target.item, displayName(target.user.userName))
    case 'removeUser':
      return removeUserCopy(target.item, displayName(target.user.userName))
    case 'excludeGlobal':
      return excludeGlobalCopy(target.item)
    case 'removeGlobal':
      return removeGlobalCopy(target.item, ownExclusionCount(target.item))
  }
}

export function ExclusionConfirm({ page }: { page: ExclusionsPage }) {
  const { lookup } = useUserDirectory()
  const { open, target } = page.single
  if (!target) return null
  const copy = confirmCopy(target, (username) => lookup(username).name)

  return (
    <ConfirmCredenza
      open={open}
      onOpenChange={page.setSingleOpen}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      confirmVariant={copy.variant}
      pending={page.singlePending}
      pendingLabel={copy.pendingLabel}
      errorMessage={page.singleError}
      onConfirm={page.runSingle}
    />
  )
}
