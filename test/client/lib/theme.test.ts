import { readPref } from '@/lib/prefs'
import { applyTheme, themePref } from '@/lib/theme'

describe('themePref', () => {
  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'dark'],
    ['garbage', 'dark'],
  ])('reads stored %s as %s', (stored, expected) => {
    localStorage.setItem(themePref.key, stored)
    expect(readPref(themePref)).toBe(expected)
  })

  it('falls back to dark when the key is missing', () => {
    expect(readPref(themePref)).toBe('dark')
  })

  it('falls back to dark when localStorage throws', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError')
      })
    expect(readPref(themePref)).toBe('dark')
    getItem.mockRestore()
  })
})

describe('applyTheme', () => {
  it('leaves exactly one theme class on the root element', () => {
    const root = document.documentElement
    root.classList.add('light', 'dark', 'other')

    applyTheme('dark')
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.classList.contains('light')).toBe(false)

    applyTheme('light')
    expect(root.classList.contains('light')).toBe(true)
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.classList.contains('other')).toBe(true)
  })
})
