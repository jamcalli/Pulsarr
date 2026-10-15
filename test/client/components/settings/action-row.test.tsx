import { render, screen } from '@testing-library/react'
import { ActionRow } from '@/components/settings/action-row'

describe('ActionRow', () => {
  it('draws the caller buttons in place of its own', () => {
    render(
      <ActionRow
        title="Every instance"
        description="Add or remove it."
        running={false}
        actions={
          <>
            <button type="button">Set up</button>
            <button type="button">Remove</button>
          </>
        }
      />,
    )

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Set up',
      'Remove',
    ])
  })

  it('keeps live content while running and hides the result', () => {
    render(
      <ActionRow
        title="Sync"
        description="Read watchlists."
        buttonLabel="Sync"
        busyLabel="Syncing..."
        disabled={false}
        running
        onRun={() => undefined}
        result={<p>Last result</p>}
        live={<p>Step two running</p>}
      />,
    )

    expect(screen.getByText('Step two running')).toBeInTheDocument()
    expect(screen.queryByText('Last result')).toBeNull()
    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled()
  })
})
