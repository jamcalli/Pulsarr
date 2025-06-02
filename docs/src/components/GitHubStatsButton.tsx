import React, { useEffect, useState, useRef } from 'react'
import { Github, Star, ArrowRight } from 'lucide-react'

type GitHubStats = {
  stars: number
}

export default function GitHubStatsButton(): React.ReactElement {
  const [stats, setStats] = useState<GitHubStats>({ stars: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [showTooltip, setShowTooltip] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Fetch GitHub stars
    fetch('https://api.github.com/repos/jamcalli/pulsarr')
      .then((response) => response.json())
      .then((data) => {
        setStats({ stars: data.stargazers_count || 0 })
        setIsLoading(false)
      })
      .catch((error) => {
        console.error('Error fetching GitHub stats:', error)
        setIsLoading(false)
      })
  }, [])

  useEffect(() => {
    // Show tooltip after 2 seconds
    const showTimer = setTimeout(() => {
      setShowTooltip(true)
    }, 2000)

    // Hide tooltip after 6 seconds total
    const hideTimer = setTimeout(() => {
      setShowTooltip(false)
    }, 6000)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  return (
    <div className="github-stats-container">
      <button
        ref={buttonRef}
        type="button"
        className="github-stats-button"
        onClick={() =>
          window.open('https://github.com/jamcalli/pulsarr', '_blank')
        }
        aria-label="View GitHub repository"
      >
        <span className="star-count">{isLoading ? '...' : stats.stars}</span>
        <Github className="github-icon" />
      </button>
      {showTooltip && (
        <div className="simple-tooltip">
          <Star className="tooltip-icon" />
          <span>Star us!</span>
          <ArrowRight className="tooltip-icon" />
        </div>
      )}
    </div>
  )
}
