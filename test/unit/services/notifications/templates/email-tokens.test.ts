import { readFileSync } from 'node:fs'
import {
  CARD,
  DESTRUCTIVE,
  DESTRUCTIVE_TEXT,
  DIVIDER,
  GOLD,
  INK,
  MUTED,
  PAGE,
  PRIMARY,
  SURFACE,
} from '@services/notifications/templates/email-tokens.js'
import { describe, expect, it } from 'vitest'

const GLOBALS_CSS = 'src/client/styles/globals.css'

function lightThemeVars(): Map<string, string> {
  const css = readFileSync(GLOBALS_CSS, 'utf8')
  const start = css.indexOf(':root {')
  const block = css.slice(start, css.indexOf('}', start))
  return new Map(
    Array.from(block.matchAll(/(--[\w-]+):\s*([^;]+);/g), ([, name, value]) => [
      name,
      value.trim().toLowerCase(),
    ]),
  )
}

describe('email tokens', () => {
  const vars = lightThemeVars()

  it.each([
    ['PAGE', PAGE, '--bg'],
    ['CARD', CARD, '--card'],
    ['SURFACE', SURFACE, '--surface'],
    ['INK', INK, '--border'],
    ['DIVIDER', DIVIDER, '--divider'],
    ['MUTED', MUTED, '--muted-foreground'],
    ['PRIMARY', PRIMARY, '--primary'],
    ['GOLD', GOLD, '--gold'],
    ['DESTRUCTIVE', DESTRUCTIVE, '--destructive'],
    ['DESTRUCTIVE_TEXT', DESTRUCTIVE_TEXT, '--destructive-text'],
  ])(
    'should keep %s equal to its light theme variable',
    (_name, token, cssVar) => {
      expect(vars.get(cssVar)).toBe(token.toLowerCase())
    },
  )
})
