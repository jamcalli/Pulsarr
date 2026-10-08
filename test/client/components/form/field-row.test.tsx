import { render, screen } from '@testing-library/react'
import { FieldRow } from '@/components/form/field-row'

describe('FieldRow', () => {
  it('associates the label with the control when htmlFor is set', () => {
    render(
      <FieldRow label="Tag prefix" htmlFor="tagPrefix">
        <input id="tagPrefix" />
      </FieldRow>,
    )

    expect(screen.getByLabelText('Tag prefix')).toHaveAttribute(
      'id',
      'tagPrefix',
    )
  })

  it('renders a title with labelId for aria-labelledby controls', () => {
    render(
      <FieldRow label="Naming source" labelId="naming-label">
        <div role="radiogroup" aria-labelledby="naming-label" />
      </FieldRow>,
    )

    expect(
      screen.getByRole('radiogroup', { name: 'Naming source' }),
    ).toBeInTheDocument()
  })

  it('marks the field disabled', () => {
    render(
      <FieldRow label="Tag prefix" htmlFor="tagPrefix" disabled>
        <input id="tagPrefix" />
      </FieldRow>,
    )

    expect(screen.getByRole('group')).toHaveAttribute('data-disabled', 'true')
  })

  it('keeps a hidden label as the accessible name and drops the description', () => {
    render(
      <FieldRow
        label="Operator"
        description="Not shown"
        htmlFor="operator"
        labelHidden
      >
        <input id="operator" />
      </FieldRow>,
    )

    expect(screen.getByLabelText('Operator')).toHaveAttribute('id', 'operator')
    expect(screen.getByText('Operator')).toHaveClass('sr-only')
    expect(screen.queryByText('Not shown')).not.toBeInTheDocument()
  })
})
