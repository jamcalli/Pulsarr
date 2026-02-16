import { getPathBasename, normalizePath } from '@utils/path.js'
import { afterEach, describe, expect, it } from 'vitest'

describe('normalizePath', () => {
  describe('basic path normalization', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(normalizePath('C:\\Users\\test\\file.txt')).toMatch(/\//)
      expect(normalizePath('folder\\subfolder\\file.txt')).toMatch(/\//)
    })

    it('should normalize Unix paths', () => {
      expect(normalizePath('/home/user/file.txt')).toBe('/home/user/file.txt')
      expect(normalizePath('/var/log/../tmp/file.txt')).toBe(
        '/var/tmp/file.txt',
      )
    })

    it('should handle relative paths', () => {
      expect(normalizePath('./file.txt')).toBe('file.txt')
      expect(normalizePath('../parent/file.txt')).toBe('../parent/file.txt')
      expect(normalizePath('folder/./subfolder')).toBe('folder/subfolder')
    })

    it('should handle paths with .. navigation', () => {
      expect(normalizePath('/home/user/../admin/file.txt')).toBe(
        '/home/admin/file.txt',
      )
      expect(normalizePath('folder/subfolder/../../file.txt')).toBe('file.txt')
    })
  })

  describe('edge cases', () => {
    it('should return empty string for falsy values', () => {
      expect(normalizePath('')).toBe('')
      expect(normalizePath(null as unknown as string)).toBe('')
      expect(normalizePath(undefined as unknown as string)).toBe('')
    })

    it('should handle root paths', () => {
      expect(normalizePath('/')).toBe('/')
      expect(normalizePath('//')).toBe('/')
    })

    it('should handle paths with multiple consecutive slashes', () => {
      expect(normalizePath('/home//user///file.txt')).toBe(
        '/home/user/file.txt',
      )
      expect(normalizePath('folder//subfolder')).toBe('folder/subfolder')
    })

    it('should handle paths ending with slashes', () => {
      expect(normalizePath('/home/user/')).toBe('/home/user/')
      expect(normalizePath('folder/subfolder/')).toBe('folder/subfolder/')
    })

    it('should handle single dot paths', () => {
      expect(normalizePath('.')).toBe('.')
      expect(normalizePath('./')).toBe('./')
    })

    it('should handle double dot paths', () => {
      expect(normalizePath('..')).toBe('..')
      expect(normalizePath('../')).toBe('../')
    })
  })

  describe('mixed separator handling', () => {
    it('should handle mixed forward and backslashes', () => {
      expect(normalizePath('C:\\Users/test\\Documents/file.txt')).toMatch(/\//)
      expect(
        normalizePath('C:\\Users/test\\Documents/file.txt').includes('\\'),
      ).toBe(false)
    })

    it('should convert all backslashes before normalization', () => {
      const result = normalizePath('folder\\subfolder\\..\\file.txt')
      expect(result.includes('\\')).toBe(false)
    })
  })

  describe('platform-specific behavior', () => {
    const originalPlatform = process.platform

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('should handle paths appropriately for current platform', () => {
      const path = 'folder/subfolder/../file.txt'
      const result = normalizePath(path)
      expect(result).toBe('folder/file.txt')
    })

    it('should use forward slashes in output regardless of platform', () => {
      const result = normalizePath('C:\\Windows\\System32\\file.dll')
      expect(result.includes('\\')).toBe(false)
      expect(result.includes('/')).toBe(true)
    })

    it('should lowercase and use win32 normalize on Windows platform', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      const result = normalizePath('C:\\Users\\Test\\File.TXT')
      expect(result.includes('\\')).toBe(false)
      expect(result).toBe(result.toLowerCase())
    })
  })

  describe('special characters in paths', () => {
    it('should handle paths with spaces', () => {
      expect(normalizePath('/path/with spaces/file.txt')).toBe(
        '/path/with spaces/file.txt',
      )
    })

    it('should handle paths with special characters', () => {
      expect(normalizePath('/path/with-dashes/file.txt')).toBe(
        '/path/with-dashes/file.txt',
      )
      expect(normalizePath('/path/with_underscores/file.txt')).toBe(
        '/path/with_underscores/file.txt',
      )
    })

    it('should handle paths with unicode characters', () => {
      expect(normalizePath('/path/文件/file.txt')).toBe('/path/文件/file.txt')
      expect(normalizePath('/path/café/file.txt')).toBe('/path/café/file.txt')
    })
  })
})

describe('getPathBasename', () => {
  describe('basic basename extraction', () => {
    it('should extract filename from Unix paths', () => {
      expect(getPathBasename('/home/user/file.txt')).toBe('file.txt')
      expect(getPathBasename('/var/log/app.log')).toBe('app.log')
      expect(getPathBasename('folder/subfolder/document.pdf')).toBe(
        'document.pdf',
      )
    })

    it('should extract filename from Windows paths', () => {
      expect(getPathBasename('C:\\Users\\test\\file.txt')).toBe('file.txt')
      expect(getPathBasename('D:\\Documents\\report.docx')).toBe('report.docx')
      expect(getPathBasename('folder\\subfolder\\image.png')).toBe('image.png')
    })

    it('should extract directory name when path ends with separator', () => {
      expect(getPathBasename('/home/user/')).toBe('user')
      expect(getPathBasename('C:\\Users\\test\\')).toBe('test')
      expect(getPathBasename('folder/subfolder/')).toBe('subfolder')
    })

    it('should handle relative paths', () => {
      expect(getPathBasename('./file.txt')).toBe('file.txt')
      expect(getPathBasename('../parent/file.txt')).toBe('file.txt')
      expect(getPathBasename('file.txt')).toBe('file.txt')
    })
  })

  describe('edge cases', () => {
    it('should return empty string for falsy values', () => {
      expect(getPathBasename('')).toBe('')
      expect(getPathBasename(null as unknown as string)).toBe('')
      expect(getPathBasename(undefined as unknown as string)).toBe('')
    })

    it('should handle single filenames without paths', () => {
      expect(getPathBasename('file.txt')).toBe('file.txt')
      expect(getPathBasename('document')).toBe('document')
    })

    it('should handle root paths', () => {
      expect(getPathBasename('/')).toBe('')
      expect(getPathBasename('C:\\')).toBe('C:')
    })

    it('should handle paths with no file extension', () => {
      expect(getPathBasename('/home/user/folder')).toBe('folder')
      expect(getPathBasename('C:\\Users\\test')).toBe('test')
    })

    it('should handle hidden files', () => {
      expect(getPathBasename('/home/user/.bashrc')).toBe('.bashrc')
      expect(getPathBasename('.gitignore')).toBe('.gitignore')
    })

    it('should handle files with multiple dots', () => {
      expect(getPathBasename('/path/to/file.tar.gz')).toBe('file.tar.gz')
      expect(getPathBasename('my.file.name.txt')).toBe('my.file.name.txt')
    })
  })

  describe('mixed separator handling', () => {
    it('should handle mixed forward and backslashes', () => {
      expect(getPathBasename('C:\\Users/test\\file.txt')).toBe('file.txt')
      expect(getPathBasename('folder/subfolder\\document.pdf')).toBe(
        'document.pdf',
      )
    })

    it('should prioritize the last separator', () => {
      expect(getPathBasename('C:\\Users/test\\Documents/file.txt')).toBe(
        'file.txt',
      )
    })
  })

  describe('special characters', () => {
    it('should handle filenames with spaces', () => {
      expect(getPathBasename('/path/to/my file.txt')).toBe('my file.txt')
      expect(getPathBasename('C:\\Documents\\my document.docx')).toBe(
        'my document.docx',
      )
    })

    it('should handle filenames with special characters', () => {
      expect(getPathBasename('/path/to/file-name.txt')).toBe('file-name.txt')
      expect(getPathBasename('/path/to/file_name.txt')).toBe('file_name.txt')
      expect(getPathBasename('/path/to/file@2x.png')).toBe('file@2x.png')
    })

    it('should handle filenames with unicode characters', () => {
      expect(getPathBasename('/path/to/文件.txt')).toBe('文件.txt')
      expect(getPathBasename('/path/to/café.jpg')).toBe('café.jpg')
    })

    it('should handle parentheses and brackets', () => {
      expect(getPathBasename('/path/to/file(1).txt')).toBe('file(1).txt')
      expect(getPathBasename('/path/to/[backup]file.txt')).toBe(
        '[backup]file.txt',
      )
    })
  })

  describe('trailing separators', () => {
    it('should handle single trailing slash', () => {
      expect(getPathBasename('/home/user/folder/')).toBe('folder')
      expect(getPathBasename('C:\\Users\\test\\')).toBe('test')
    })

    it('should handle multiple trailing slashes', () => {
      expect(getPathBasename('/home/user/folder//')).toBe('folder')
      expect(getPathBasename('/home/user/folder///')).toBe('folder')
    })
  })
})
