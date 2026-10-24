import { render } from '@testing-library/react'
import { UserAvatar, UserAvatarSkeleton } from '@/components/user-avatar'

describe('UserAvatarSkeleton', () => {
  it('takes the size of the avatar it stands in for', () => {
    const { container } = render(
      <>
        <UserAvatar name="Maya" size="xl" />
        <UserAvatarSkeleton size="xl" />
      </>,
    )

    const [avatar, skeleton] = container.querySelectorAll(
      '[data-slot="avatar"]',
    )
    expect(skeleton).toHaveAttribute('data-size', 'xl')
    expect(skeleton.className).toBe(avatar.className)
    expect(skeleton.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
  })
})
