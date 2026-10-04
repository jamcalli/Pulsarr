import { toast } from '@/components/ui/toast'
import { type NavPage, pageHref, pathMatches } from '@/lib/navigation'
import { apiErrorMessage } from '@/lib/tanstackApi'

interface OperationNavigator {
  pathname: () => string
  navigate: (to: string) => void
}

let navigator: OperationNavigator | null = null

/** Wire the router once at boot; until then settled operations toast nothing. */
export function configureOperationToasts(next: OperationNavigator): void {
  navigator = next
}

export type OperationMeta = { label: string; page: NavPage }

export type OperationOutcome =
  | { ok: true; data: unknown }
  | { ok: false; error: unknown }

function messageOf(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('message' in data)) {
    return undefined
  }
  return typeof data.message === 'string' && data.message !== ''
    ? data.message
    : undefined
}

export function operationToast(
  meta: OperationMeta,
  outcome: OperationOutcome,
): { title: string; description?: string } {
  if (outcome.ok) {
    return {
      title: `${meta.label} finished`,
      description: messageOf(outcome.data),
    }
  }
  return {
    title: `${meta.label} failed`,
    description: apiErrorMessage(outcome.error) ?? 'Something went wrong.',
  }
}

/** False on the owning page, which renders the outcome inline. */
export function shouldToast(meta: OperationMeta, pathname: string): boolean {
  const [path = ''] = pageHref(meta.page).split('#')
  return !pathMatches(path, pathname)
}

export function notifyOperationSettled(
  outcome: OperationOutcome,
  meta: OperationMeta | undefined,
): void {
  if (!navigator || !meta || !shouldToast(meta, navigator.pathname())) return
  const { title, description } = operationToast(meta, outcome)
  const page = pageHref(meta.page)
  toast.add({
    type: outcome.ok ? 'success' : 'error',
    title,
    description,
    actionProps: {
      children: 'View',
      onClick: () => navigator?.navigate(page),
    },
  })
}
