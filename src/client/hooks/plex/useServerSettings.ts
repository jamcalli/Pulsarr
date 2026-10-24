import { useMutation } from '@tanstack/react-query'
import { useConfigForm } from '@/hooks/useConfigForm'
import { useMinLoadingMutation, withMinDuration } from '@/hooks/useMinLoading'
import { useOperation } from '@/hooks/useOperation'
import { NAV_PAGES } from '@/lib/navigation'
import { testServerConnection } from '@/lib/plex/plex-requests'
import {
  connectionUrl,
  toServerPayload,
  toServerValues,
} from '@/lib/plex/server-address'
import { ServerFormSchema } from '@/lib/plex/server-form.schema'
import { apiFetch, mutationErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

async function discoverServers(plexToken: string) {
  const { data, error } = await apiFetch.POST('/v1/plex/discover-servers', {
    body: { plexToken },
  })
  if (error) throw error
  return data.servers
}

function useConnectionTest() {
  return useOperation({
    key: ['plex-connection', 'test'],
    mutationFn: () => withMinDuration(testServerConnection()),
    meta: { label: 'Plex connection test', page: NAV_PAGES.plexConnection },
    errorFallback: 'The connection test did not run. Try again.',
  })
}

/** The server card's form, which tests the saved server after every save. */
export function useServerSettings(
  config: components['schemas']['Config'],
  options?: { onSaved?: () => void },
) {
  const test = useConnectionTest()
  const discovery = useMinLoadingMutation(
    useMutation({
      mutationFn: (token: string) => withMinDuration(discoverServers(token)),
    }),
  )
  const settings = useConfigForm({
    config,
    toValues: (saved) => ({ server: toServerValues(saved) }),
    toPayload: (values) => toServerPayload(values.server),
    schema: ServerFormSchema,
    onSaved: () => {
      discovery.reset()
      test.run()
      options?.onSaved?.()
    },
  })

  return {
    ...settings,
    test,
    discard: () => {
      discovery.reset()
      settings.discard()
    },
    discovery: {
      find: (token: string) =>
        discovery.mutate(token, {
          onSuccess: (servers) => {
            const working = servers.find((server) => server.success)
            if (working) {
              settings.form.setFieldValue(
                'server.address',
                connectionUrl(working),
              )
            }
          },
        }),
      finding: discovery.isPending,
      servers: discovery.data ?? null,
      errorMessage: discovery.isError
        ? mutationErrorMessage(
            discovery.error,
            'Plex did not list your servers. Try again.',
          )
        : null,
    },
  }
}

export type ServerSettings = ReturnType<typeof useServerSettings>
