import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyButton } from '@/components/copy-button'
import { COPY_FEEDBACK_DELAY } from '@/lib/constants'

describe('CopyButton', () => {
  beforeEach(() => {
    vi.stubGlobal('isSecureContext', true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('writes the value and swaps to the copied state', async () => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)
    render(<CopyButton value="secret-key" label="Copy key" />)

    await user.click(screen.getByRole('button', { name: 'Copy key' }))

    expect(writeText).toHaveBeenCalledWith('secret-key')
    expect(
      await screen.findByRole('button', { name: 'Copied' }),
    ).toBeInTheDocument()
  })

  it('returns to the copy label once the feedback delay passes', async () => {
    vi.useFakeTimers()
    try {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      render(<CopyButton value="secret-key" label="Copy key" />)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy key' }))
      })
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()

      act(() => vi.advanceTimersByTime(COPY_FEEDBACK_DELAY))
      expect(
        screen.getByRole('button', { name: 'Copy key' }),
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows Copied again on a later copy', async () => {
    vi.useFakeTimers()
    try {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      render(<CopyButton value="secret-key" label="Copy key" />)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy key' }))
      })
      act(() => vi.advanceTimersByTime(COPY_FEEDBACK_DELAY))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy key' }))
      })

      expect(writeText).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stays ready to copy when the clipboard write fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied'),
    )
    render(<CopyButton value="secret-key" label="Copy key" />)

    await user.click(screen.getByRole('button', { name: 'Copy key' }))

    expect(screen.getByRole('button', { name: 'Copy key' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Copied' }),
    ).not.toBeInTheDocument()
  })
})
