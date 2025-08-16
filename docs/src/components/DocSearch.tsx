// DocSearch.tsx - Custom search component using app button styling

import { useColorMode } from '@docusaurus/theme-common'
import { Search } from 'lucide-react'
import React, { useCallback } from 'react'

// Re-implement the Button component to match your blue variant
function SearchButton({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode
  onClick: () => void
  className?: string
}) {
  const { colorMode } = useColorMode()
  const _isDark = colorMode === 'dark'

  // These styles match your blue button variant: 'text-mtext bg-blue border-2 border-border'
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap' as const,
    borderRadius: '5px',
    fontSize: '0.875rem',
    fontWeight: 500,
    height: '2.5rem', // 40px (h-10)
    minWidth: '2.5rem', // At least 40px wide
    padding: '0 0.75rem', // Horizontal padding for search text
    border: '2px solid #000', // border-2 border-border
    backgroundColor: '#4a94b5', // --blue color
    color: '#000 !important', // Keep text black in both light and dark mode
    position: 'relative' as const,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    gap: '0.5rem', // Space between icon and text
  }

  return (
    <button
      type="button"
      style={style}
      onClick={onClick}
      className={`${className} custom-search-button`}
    >
      {children}
    </button>
  )
}

export function DocSearch() {
  const openSearch = useCallback(() => {
    // This will trigger the Algolia DocSearch modal
    const searchButton = document.querySelector(
      '.DocSearch-Button',
    ) as HTMLButtonElement
    if (searchButton) {
      searchButton.click()
    }
  }, [])

  return (
    <>
      {/* Hidden default DocSearch button - we'll trigger it programmatically */}
      <div style={{ display: 'none' }}>
        <div id="default-search-container" />
      </div>

      {/* Our custom search button */}
      <SearchButton onClick={openSearch}>
        <Search size={18} aria-hidden="true" />
        <span className="hidden lg:inline">Search</span>
        <span className="sr-only">Search documentation</span>
      </SearchButton>
    </>
  )
}
