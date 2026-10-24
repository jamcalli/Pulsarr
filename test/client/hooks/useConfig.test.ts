import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { configKeys, getConfigSnapshot, updateConfig } from '@/hooks/useConfig'
import { queryClient } from '@/lib/queryClient'
import { server } from '../setup.js'

afterEach(() => {
  queryClient.clear()
})

describe('updateConfig', () => {
  it('drops a field the saved config no longer has', async () => {
    queryClient.setQueryData(configKeys.config, {
      success: true,
      config: {
        plexServerUrl: 'http://10.0.0.2:32400',
        skipIfExistsOnPlex: true,
      },
    })
    server.use(
      http.put('/v1/config', () =>
        HttpResponse.json({
          success: true,
          config: { skipIfExistsOnPlex: true },
        }),
      ),
    )

    await updateConfig({ plexServerUrl: '' })

    expect(getConfigSnapshot()?.plexServerUrl).toBeUndefined()
    expect(getConfigSnapshot()?.skipIfExistsOnPlex).toBe(true)
  })
})
