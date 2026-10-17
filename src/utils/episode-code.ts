function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/** `S02E14`, or `S02` without an episode number. */
export function episodeCode(season: number, episode?: number): string {
  return episode === undefined
    ? `S${pad(season)}`
    : `S${pad(season)}E${pad(episode)}`
}

/** `S02E14` for one episode, `S02E01 to S02E10` for several. Expects at least one. */
export function episodeRange(
  episodes: Array<{ seasonNumber: number; episodeNumber: number }>,
): string {
  const [first] = episodes
  const last = episodes[episodes.length - 1]
  const firstCode = episodeCode(first.seasonNumber, first.episodeNumber)
  return episodes.length === 1
    ? firstCode
    : `${firstCode} to ${episodeCode(last.seasonNumber, last.episodeNumber)}`
}
