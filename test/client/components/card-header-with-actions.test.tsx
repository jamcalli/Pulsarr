import { render, screen } from '@testing-library/react'
import { CardHeaderWithActions } from '@/components/card-header-with-actions'
import { Card, CardTitle } from '@/components/ui/card'

describe('CardHeaderWithActions', () => {
  it('puts the buttons in the header action slot', () => {
    render(
      <Card>
        <CardHeaderWithActions
          actions={<button type="button">Manage enrollment</button>}
        >
          <CardTitle>Rolling shows</CardTitle>
        </CardHeaderWithActions>
      </Card>,
    )

    expect(
      screen
        .getByRole('button', { name: 'Manage enrollment' })
        .closest('[data-slot="card-action"]'),
    ).not.toBeNull()
  })

  it('renders no action slot without buttons', () => {
    const { container } = render(
      <Card>
        <CardHeaderWithActions>
          <CardTitle>Rolling shows</CardTitle>
        </CardHeaderWithActions>
      </Card>,
    )

    expect(container.querySelector('[data-slot="card-action"]')).toBeNull()
  })
})
