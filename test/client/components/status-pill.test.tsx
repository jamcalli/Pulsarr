import { render, screen } from '@testing-library/react'
import { StatusPill } from '@/components/status-pill'

describe('StatusPill', () => {
  it('renders the label without a live region by default', () => {
    render(<StatusPill tone="on" label="Running" />)

    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('announces the pill and its detail in a polite live region when live', () => {
    render(<StatusPill tone="failed" label="Stopped" detail="2m ago" live />)

    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveTextContent('Stopped2m ago')
  })
})
