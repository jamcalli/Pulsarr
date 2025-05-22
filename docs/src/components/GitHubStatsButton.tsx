import React, { useEffect, useState } from 'react'
import { Github } from 'lucide-react'

type GitHubStats = {
  stars: number
}

export default function GitHubStatsButton(): React.ReactElement {
  const [stats, setStats] = useState<GitHubStats>({ stars: 0 })
  const [isLoading, setIsLoading] = useState(true)

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

  return (
    <button
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
  )
}
