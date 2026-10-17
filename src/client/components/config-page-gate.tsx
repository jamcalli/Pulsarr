import type { ReactNode } from 'react'
import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { useConfig } from '@/hooks/useConfig'
import { useShowLoading } from '@/hooks/useMinLoading'
import type { components } from '@/types/api.js'

interface ConfigPageGateProps {
  section: string
  title: string
  description: string
  skeleton: ReactNode
  children: (config: components['schemas']['Config']) => ReactNode
}

export function ConfigPageGate({
  section,
  title,
  description,
  skeleton,
  children,
}: ConfigPageGateProps) {
  const { config, error, initialize } = useConfig()
  const showLoading = useShowLoading(config === null)

  if (!config && error) {
    return (
      <Page>
        <PageHeader section={section} title={title} description={description} />
        <RetryAlert message={error} onRetry={() => initialize(true)} />
      </Page>
    )
  }
  if (showLoading) return skeleton
  if (!config) return null
  return children(config)
}
