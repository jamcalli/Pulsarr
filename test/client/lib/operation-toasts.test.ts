import { NAV_PAGES } from '@/lib/navigation'
import {
  type OperationMeta,
  operationToast,
  shouldToast,
} from '@/lib/operation-toasts'

const meta: OperationMeta = { label: 'Tag sync', page: NAV_PAGES.userTags }

describe('operationToast', () => {
  it('describes a success with the response message', () => {
    expect(
      operationToast(meta, {
        ok: true,
        data: { success: true, message: 'Tagged 12 items' },
      }),
    ).toEqual({ title: 'Tag sync finished', description: 'Tagged 12 items' })
  })

  it('leaves the description out when the response has no message', () => {
    expect(operationToast(meta, { ok: true, data: { success: true } })).toEqual(
      { title: 'Tag sync finished', description: undefined },
    )
    expect(operationToast(meta, { ok: true, data: { message: '' } })).toEqual({
      title: 'Tag sync finished',
      description: undefined,
    })
  })

  it('describes a failure with the API error message', () => {
    expect(
      operationToast(meta, {
        ok: false,
        error: { statusCode: 500, message: 'Sonarr is unreachable' },
      }),
    ).toEqual({
      title: 'Tag sync failed',
      description: 'Sonarr is unreachable',
    })
  })

  it('falls back to a generic description for an error without a message', () => {
    expect(
      operationToast(meta, { ok: false, error: { statusCode: 500 } }),
    ).toEqual({
      title: 'Tag sync failed',
      description: 'Something went wrong.',
    })
  })
})

describe('shouldToast', () => {
  it('stays quiet on the page itself', () => {
    expect(shouldToast(meta, '/users/tags')).toBe(false)
    expect(shouldToast(meta, '/users/tags/')).toBe(false)
  })

  it('toasts anywhere else', () => {
    expect(shouldToast(meta, '/')).toBe(true)
    expect(shouldToast(meta, '/users')).toBe(true)
    expect(shouldToast(meta, '/utilities/user-tags')).toBe(true)
  })
})
