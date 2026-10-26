import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SwitchRow } from '@/components/form/switch-row'

describe('SwitchRow', () => {
  it('keeps the switch beside its label and reports changes', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(
      <SwitchRow
        id="approve-held"
        label="Also approve held requests"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    )

    const toggle = screen.getByRole('switch', {
      name: 'Also approve held requests',
    })
    expect(toggle.closest('[data-slot="field"]')).toHaveAttribute(
      'data-orientation',
      'horizontal',
    )

    await user.click(toggle)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })
})
