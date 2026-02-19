import { resolve } from 'node:path'
import {
  projectRoot,
  resolveDataDir,
  resolveDbPath,
  resolveEnvPath,
  resolveLogPath,
} from '@utils/data-dir.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('data-dir', () => {
  const originalPlatform = process.platform
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.dataDir
    delete process.env.PROGRAMDATA
    delete process.env.ALLUSERSPROFILE
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    process.env = { ...originalEnv }
  })

  describe('resolveDataDir', () => {
    it('should return dataDir env var when set', () => {
      process.env.dataDir = '/custom/data'
      expect(resolveDataDir()).toBe('/custom/data')
    })

    it('should return PROGRAMDATA path on win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      process.env.PROGRAMDATA = 'C:\\ProgramData'
      expect(resolveDataDir()).toBe(resolve('C:\\ProgramData', 'Pulsarr'))
    })

    it('should fall back to ALLUSERSPROFILE on win32 when PROGRAMDATA is missing', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      delete process.env.PROGRAMDATA
      process.env.ALLUSERSPROFILE = 'C:\\ProgramData'
      expect(resolveDataDir()).toBe(resolve('C:\\ProgramData', 'Pulsarr'))
    })

    it('should return null on win32 when no program data env vars', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      delete process.env.PROGRAMDATA
      delete process.env.ALLUSERSPROFILE
      expect(resolveDataDir()).toBeNull()
    })

    it('should return HOME/.config/Pulsarr on darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      process.env.HOME = '/Users/testuser'
      expect(resolveDataDir()).toBe(
        resolve('/Users/testuser', '.config', 'Pulsarr'),
      )
    })

    it('should return null on darwin when HOME is missing', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      delete process.env.HOME
      expect(resolveDataDir()).toBeNull()
    })

    it('should return null on linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(resolveDataDir()).toBeNull()
    })
  })

  describe('resolveDbPath', () => {
    it('should use dataDir when available', () => {
      process.env.dataDir = '/custom/data'
      expect(resolveDbPath()).toBe(resolve('/custom/data', 'db'))
    })

    it('should fall back to project-relative path', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(resolveDbPath()).toBe(resolve(projectRoot, 'data', 'db'))
    })
  })

  describe('resolveLogPath', () => {
    it('should use dataDir when available', () => {
      process.env.dataDir = '/custom/data'
      expect(resolveLogPath()).toBe(resolve('/custom/data', 'logs'))
    })

    it('should fall back to project-relative path', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(resolveLogPath()).toBe(resolve(projectRoot, 'data', 'logs'))
    })
  })

  describe('resolveEnvPath', () => {
    it('should use dataDir when available', () => {
      process.env.dataDir = '/custom/data'
      expect(resolveEnvPath()).toBe(resolve('/custom/data', '.env'))
    })

    it('should fall back to project-relative path', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(resolveEnvPath()).toBe(resolve(projectRoot, '.env'))
    })
  })
})
