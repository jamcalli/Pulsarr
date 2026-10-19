import type {
  ConnectionTestFailure,
  ConnectionTestStatus,
} from '@/components/connection-test'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']
type ConfigUpdate = components['schemas']['ConfigUpdatePayload']
type ServerConnection = components['schemas']['PlexServer']
type ConnectionTest = components['schemas']['PlexTestConnectionResponse']

export const CONNECTION_MODES = ['auto', 'address'] as const

type ConnectionMode = (typeof CONNECTION_MODES)[number]

export interface ServerFormValues {
  connection: ConnectionMode
  address: string
  skipIfExistsOnPlex: boolean
}

export const CONNECTION_OPTIONS: ReadonlyArray<{
  value: ConnectionMode
  label: string
}> = [
  { value: 'auto', label: 'Automatic' },
  { value: 'address', label: 'Address' },
]

export const CONNECTION_HELP: Record<ConnectionMode, string> = {
  auto: 'Pulsarr picks the best connection to your server.',
  address: 'Pulsarr uses this one address for everything.',
}

export function isAutomaticAddress(url: string | undefined): boolean {
  return !url
}

export function toServerValues(
  config: Pick<Config, 'plexServerUrl' | 'skipIfExistsOnPlex'>,
): ServerFormValues {
  const automatic = isAutomaticAddress(config.plexServerUrl)
  return {
    connection: automatic ? 'auto' : 'address',
    address: automatic ? '' : (config.plexServerUrl ?? ''),
    skipIfExistsOnPlex: config.skipIfExistsOnPlex,
  }
}

export function toServerPayload(values: ServerFormValues): ConfigUpdate {
  return {
    plexServerUrl: values.connection === 'auto' ? '' : values.address.trim(),
    skipIfExistsOnPlex: values.skipIfExistsOnPlex,
  }
}

export function connectionUrl(server: ServerConnection): string {
  return `${server.useSsl ? 'https' : 'http'}://${server.host}:${server.port}`
}

/** The address a connection test reached, naming automatic mode. */
export function testedAddress(test: ConnectionTest): string {
  return test.automatic ? `Automatic connection to ${test.url}` : test.url
}

const NOT_RUN_TITLE = 'The connection test did not run.'

/** The shared connection test's state for the latest Plex server test. */
export function connectionTestView(test: {
  running: boolean
  errorMessage: string | null
  result: ConnectionTest | null
}): {
  status: ConnectionTestStatus
  failure: ConnectionTestFailure | null
  passedDetail?: string
} {
  if (test.running) return { status: 'testing', failure: null }
  if (test.errorMessage) {
    return {
      status: 'failed',
      failure: { title: NOT_RUN_TITLE, message: test.errorMessage },
    }
  }
  if (!test.result) return { status: 'idle', failure: null }
  if (test.result.success) {
    return {
      status: 'passed',
      failure: null,
      passedDetail: testedAddress(test.result),
    }
  }
  return {
    status: 'failed',
    failure: {
      title: test.result.message,
      message: testedAddress(test.result),
    },
  }
}
