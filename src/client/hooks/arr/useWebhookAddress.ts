import type { StandardSchemaV1 } from '@tanstack/react-form'
import { useState } from 'react'
import { z } from 'zod'
import { getConfigSnapshot, updateConfig } from '@/hooks/useConfig'
import { useSaveForm } from '@/hooks/useSaveForm'
import {
  type WebhookAddressValues,
  webhookAddressValues,
} from '@/lib/webhook-address'
import { WebhookAddressSchema } from '@/lib/webhook-address.schema'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']
type ArrWebhookResults = components['schemas']['ArrWebhookResults']
type ConfigConflict = components['schemas']['ConfigConflict']
interface WebhookRun {
  ranAt: number
  data: ArrWebhookResults
}

function conflictResults(error: unknown): ArrWebhookResults | undefined {
  if (typeof error === 'object' && error !== null && 'webhooks' in error) {
    return (error as ConfigConflict).webhooks
  }
  return undefined
}

interface WebhookAddressOptions<Values> {
  config: Config
  /** Where the address sits in this form, so two mounted forms never share field ids. */
  toValues: (address: WebhookAddressValues) => Values
  fromValues: (values: Values) => WebhookAddressValues
  schema: StandardSchemaV1<Values>
  onResults?: (results: ArrWebhookResults) => void
}

/** Saving tests every arr against the new address first, so a rejected address is a save error with the rows attached and nothing stored. */
export function useWebhookAddress<Values>({
  config,
  toValues,
  fromValues,
  schema,
  onResults,
}: WebhookAddressOptions<Values>) {
  const [result, setResult] = useState<WebhookRun | null>(null)
  const report = (data: ArrWebhookResults) => {
    setResult({ ranAt: Date.now(), data })
    onResults?.(data)
  }
  const saveForm = useSaveForm({
    source: config,
    toValues: (source: Config) => toValues(webhookAddressValues(source)),
    save: async (values: Values) => {
      const { baseUrl, port } = fromValues(values)
      try {
        const data = await updateConfig({ baseUrl, port })
        if (data.webhooks) report(data.webhooks)
      } catch (error) {
        const rejected = conflictResults(error)
        if (rejected) report(rejected)
        throw error
      }
    },
    latest: getConfigSnapshot,
    schema,
    saveErrorFallback: 'The address was not saved. Save again to retry.',
  })

  return { ...saveForm, result }
}

const SectionSchema = z.object({ webhook: WebhookAddressSchema })
const DialogSchema = z.object({ address: WebhookAddressSchema })

export function useWebhookSection(config: Config) {
  return useWebhookAddress({
    config,
    toValues: (webhook) => ({ webhook }),
    fromValues: (values) => values.webhook,
    schema: SectionSchema,
  })
}

export function useWebhookDialog(
  config: Config,
  onResults: (results: ArrWebhookResults) => void,
) {
  return useWebhookAddress({
    config,
    toValues: (address) => ({ address }),
    fromValues: (values) => values.address,
    schema: DialogSchema,
    onResults,
  })
}

export type WebhookSection = ReturnType<typeof useWebhookSection>
