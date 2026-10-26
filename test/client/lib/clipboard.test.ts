import { copyText } from '@/lib/clipboard'

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'execCommand')
  })

  it('writes through the clipboard API in a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    expect(await copyText('secret-key')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('secret-key')
  })

  it('reports a rejected clipboard write', async () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })

    expect(await copyText('secret-key')).toBe(false)
  })

  it('copies through a selected textarea outside a secure context', async () => {
    let selected = ''
    const execCommand = vi.fn(() => {
      const active = document.activeElement
      if (active instanceof HTMLTextAreaElement) selected = active.value
      return true
    })
    vi.stubGlobal('isSecureContext', false)
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    })

    expect(await copyText('secret-key')).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(selected).toBe('secret-key')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('reports a refused fallback copy', async () => {
    vi.stubGlobal('navigator', {})
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    })

    expect(await copyText('secret-key')).toBe(false)
  })

  it('hands focus back after the fallback copy', async () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    vi.stubGlobal('isSecureContext', false)
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => true),
    })

    await copyText('secret-key')

    expect(document.activeElement).toBe(button)
    button.remove()
  })
})
