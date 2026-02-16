import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('data-dir', () => {
  const originalPlatform = process.platform
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
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
    it('should return dataDir env var when set', async () => {
      process.env.dataDir = '/custom/data'
      const { resolveDataDir } = await import('@utils/data-dir.js')
      expect(resolveDataDir()).toBe('/custom/data')
    })

    it('should return PROGRAMDATA path on win32', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      process.env.PROGRAMDATA = 'C:\\ProgramData'
      const { resolveDataDir } = await import('@utils/data-dir.js')
      expect(resolveDataDir()).toBe(resolve('C:\\ProgramData', 'Pulsarr'))
    })

    it('should fall back to ALLUSERSPROFILE on win32 when PROGRAMDATA is missing', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      delete process.env.PROGRAMDATA
      process.env.ALLUSERSPROFILE = 'C:\\ProgramData'
      const { resolveDataDir } = await import('@utils/data-dir.js')
      expect(resolveDataDir()).toBe(resolve('C:\\ProgramData', 'Pulsarr'))
    })

    it('should return null on win32 when no program data env vars', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      delete process.env.PROGRAMDATA
      delete process.env.ALLUSERSPROFILE
      const { resolveDataDir } = await import('@utils/data-dir.js')
      expect(resolveDataDir()).toBeNull()
    })

    it('should return HOME/.config/Pulsarr on darwin', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      process.env.HOME = '/Users/testuser'
      const { resolveDataDir } = await import('@utils/data-dir.js')
      expect(resolveDataDir()).toBe(
        resolve('/Users/testuser', '.config', 'Pulsarr'),
      )
    })

    it('should return null on darwin when HOME is missing', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      delete process.env.HOME
      const { resolveDataDir } = await import('@utils/data-dir.js')
      expect(resolveDataDir()).toBeNull()
    })

    it('should return null on linux', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      const { resolveDataDir } = await import('@utils/data-dir.js')
      expect(resolveDataDir()).toBeNull()
    })
  })

  describe('resolveDbPath', () => {
    it('should use dataDir when available', async () => {
      process.env.dataDir = '/custom/data'
      const { resolveDbPath } = await import('@utils/data-dir.js')
      expect(resolveDbPath('/project')).toBe(resolve('/custom/data', 'db'))
    })

    it('should fall back to project-relative path', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      const { resolveDbPath } = await import('@utils/data-dir.js')
      expect(resolveDbPath('/project')).toBe(resolve('/project', 'data', 'db'))
    })
  })

  describe('resolveLogPath', () => {
    it('should use dataDir when available', async () => {
      process.env.dataDir = '/custom/data'
      const { resolveLogPath } = await import('@utils/data-dir.js')
      expect(resolveLogPath('/project')).toBe(resolve('/custom/data', 'logs'))
    })

    it('should fall back to project-relative path', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      const { resolveLogPath } = await import('@utils/data-dir.js')
      expect(resolveLogPath('/project')).toBe(
        resolve('/project', 'data', 'logs'),
      )
    })
  })

  describe('resolveEnvPath', () => {
    it('should use dataDir when available', async () => {
      process.env.dataDir = '/custom/data'
      const { resolveEnvPath } = await import('@utils/data-dir.js')
      expect(resolveEnvPath('/project')).toBe(resolve('/custom/data', '.env'))
    })

    it('should fall back to project-relative path', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      const { resolveEnvPath } = await import('@utils/data-dir.js')
      expect(resolveEnvPath('/project')).toBe(resolve('/project', '.env'))
    })
  })
})
