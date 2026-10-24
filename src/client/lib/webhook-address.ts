import { DEFAULT_PULSARR_PORT } from '@root/schemas/config/config.schema'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

export const WEBHOOK_PRESET_VALUES = [
  'localhost',
  'ip',
  'docker',
  'https',
] as const

export type WebhookPreset = (typeof WEBHOOK_PRESET_VALUES)[number]

export interface WebhookAddressValues {
  preset: WebhookPreset
  baseUrl: string
  port: number
}

interface PresetSpec {
  label: string
  description: string
  baseUrl: string
  port: number
}

const HTTPS_PORT = 443

export const WEBHOOK_PRESETS: Record<WebhookPreset, PresetSpec> = {
  localhost: {
    label: 'Same machine',
    description: 'One machine, no Docker.',
    baseUrl: 'http://localhost',
    port: DEFAULT_PULSARR_PORT,
  },
  ip: {
    label: 'IP address',
    description: 'An IP on your network.',
    baseUrl: 'http://',
    port: DEFAULT_PULSARR_PORT,
  },
  docker: {
    label: 'Docker network',
    description: 'Shared Docker network, by container name.',
    baseUrl: 'http://pulsarr',
    port: DEFAULT_PULSARR_PORT,
  },
  https: {
    label: 'Public domain',
    description: 'Behind a reverse proxy.',
    baseUrl: 'https://',
    port: HTTPS_PORT,
  },
}

export const WEBHOOK_PRESET_OPTIONS = WEBHOOK_PRESET_VALUES.map((value) => ({
  value,
  label: WEBHOOK_PRESETS[value].label,
}))

/** Derives the preset a stored address was made from, any other http address reads as a typed IP. */
export function webhookPresetOf(baseUrl: string): WebhookPreset {
  if (baseUrl.startsWith('https://')) return 'https'
  const trimmed = baseUrl.replace(/\/+$/, '')
  if (trimmed === WEBHOOK_PRESETS.localhost.baseUrl) return 'localhost'
  if (trimmed === WEBHOOK_PRESETS.docker.baseUrl) return 'docker'
  return 'ip'
}

/** The address the arrs post to, with no port for https since the proxy answers on its default. */
export function webhookAddress(baseUrl: string, port: number): string {
  return baseUrl.startsWith('https://')
    ? `${baseUrl}/v1/`
    : `${baseUrl}:${port}/v1/`
}

export function webhookAddressValues(config: Config): WebhookAddressValues {
  const baseUrl = config.baseUrl ?? ''
  return {
    preset: webhookPresetOf(baseUrl),
    baseUrl,
    port: config.port ?? DEFAULT_PULSARR_PORT,
  }
}
