import {
  connectionUrl,
  isAutomaticAddress,
  testedAddress,
  toServerPayload,
  toServerValues,
} from '@/lib/plex/server-address'
import { addressError } from '@/lib/plex/server-form.schema'

function config(plexServerUrl: string | undefined) {
  return { plexServerUrl, skipIfExistsOnPlex: true }
}

describe('isAutomaticAddress', () => {
  it.each([undefined, ''])('reads %s as automatic', (url) =>
    expect(isAutomaticAddress(url)).toBe(true),
  )

  it.each(['http://localhost:32400', 'http://192.168.1.100:32400'])(
    'reads %s as a saved address',
    (url) => expect(isAutomaticAddress(url)).toBe(false),
  )
})

describe('toServerValues and toServerPayload', () => {
  it('opens an empty address as automatic', () => {
    expect(toServerValues(config(''))).toEqual({
      connection: 'auto',
      address: '',
      skipIfExistsOnPlex: true,
    })
  })

  it('opens a localhost address as a saved address', () => {
    expect(toServerValues(config('http://localhost:32400'))).toEqual({
      connection: 'address',
      address: 'http://localhost:32400',
      skipIfExistsOnPlex: true,
    })
  })

  it('saves automatic as an empty address', () => {
    expect(
      toServerPayload({
        connection: 'auto',
        address: 'http://leftover:32400',
        skipIfExistsOnPlex: false,
      }),
    ).toEqual({ plexServerUrl: '', skipIfExistsOnPlex: false })
  })

  it('saves a trimmed address', () => {
    expect(
      toServerPayload({
        connection: 'address',
        address: ' https://plex.lan:32400 ',
        skipIfExistsOnPlex: true,
      }),
    ).toEqual({
      plexServerUrl: 'https://plex.lan:32400',
      skipIfExistsOnPlex: true,
    })
  })
})

describe('addressError', () => {
  const values = (address: string) => ({
    connection: 'address' as const,
    address,
    skipIfExistsOnPlex: true,
  })

  it('needs an address in address mode only', () => {
    expect(addressError(values(' '))).not.toBeNull()
    expect(addressError({ ...values(''), connection: 'auto' })).toBeNull()
  })

  it('needs an http or https scheme', () => {
    expect(addressError(values('192.168.1.100:32400'))).not.toBeNull()
    expect(addressError(values('https://192.168.1.100:32400'))).toBeNull()
  })
})

describe('connectionUrl', () => {
  it('builds the URL from a discovered connection', () => {
    expect(
      connectionUrl({
        name: 'Basement',
        host: '192.168.1.100',
        port: 32400,
        useSsl: true,
        local: true,
        success: true,
        message: 'Connected to the Plex server.',
      }),
    ).toBe('https://192.168.1.100:32400')
  })
})

describe('testedAddress', () => {
  const test = (automatic: boolean) => ({
    success: true,
    message: 'Connected to the Plex server.',
    url: 'https://plex.lan:32400',
    automatic,
  })

  it('names the tested address and automatic mode', () => {
    expect(testedAddress(test(false))).toBe('https://plex.lan:32400')
    expect(testedAddress(test(true))).toBe(
      'Automatic connection to https://plex.lan:32400',
    )
  })
})
