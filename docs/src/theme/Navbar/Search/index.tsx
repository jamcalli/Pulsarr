import React, { type ReactNode, useEffect } from 'react'
import clsx from 'clsx'
import type { Props } from '@theme/Navbar/Search'
import { DocSearch } from '@site/src/components/DocSearch'

import styles from './styles.module.css'

export default function NavbarSearch({
  children,
  className,
}: Props): ReactNode {
  // Mount the default DocSearch in a hidden container for functionality
  useEffect(() => {
    const container = document.getElementById('default-search-container')
    if (container && children) {
      // Move the default search to our hidden container
      const searchElement = document.querySelector('.DocSearch')
      if (!searchElement && React.isValidElement(children)) {
        container.appendChild(document.createElement('div'))
      }
    }
  }, [children])

  return (
    <div className={clsx(className, styles.navbarSearchContainer)}>
      {/* Render the default search in a hidden div for functionality */}
      <div style={{ display: 'none' }} id="default-search-container">
        {children}
      </div>
      {/* Render our custom search button */}
      <DocSearch />
    </div>
  )
}
