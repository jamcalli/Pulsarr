import React, { type ReactNode } from 'react'
import { useThemeConfig } from '@docusaurus/theme-common'
import type { Props } from '@theme/Navbar/ColorModeToggle'
import { DocModeToggle } from '@site/src/components/DocModeToggle'

export default function NavbarColorModeToggle({ className }: Props): ReactNode {
  const disabled = useThemeConfig().colorMode.disableSwitch

  if (disabled) {
    return null
  }

  return (
    <div className={className}>
      <DocModeToggle />
    </div>
  )
}
