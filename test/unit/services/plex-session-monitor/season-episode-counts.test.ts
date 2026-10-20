import {
  countsFromEpisodes,
  countsFromSeasonStatistics,
  sameSeasonEpisodeCounts,
} from '@services/plex-session-monitor/season-episode-counts.js'
import { describe, expect, it } from 'vitest'

describe('countsFromSeasonStatistics', () => {
  it('maps each real season to its total episode count', () => {
    expect(
      countsFromSeasonStatistics([
        {
          seasonNumber: 0,
          monitored: false,
          statistics: { totalEpisodeCount: 4 },
        },
        {
          seasonNumber: 1,
          monitored: true,
          statistics: { totalEpisodeCount: 9 },
        },
        {
          seasonNumber: 2,
          monitored: false,
          statistics: { totalEpisodeCount: 10 },
        },
      ]),
    ).toEqual({ 1: 9, 2: 10 })
  })

  it('skips seasons without statistics or episodes', () => {
    expect(
      countsFromSeasonStatistics([
        { seasonNumber: 1, monitored: true },
        {
          seasonNumber: 2,
          monitored: true,
          statistics: { totalEpisodeCount: 0 },
        },
        {
          seasonNumber: 3,
          monitored: true,
          statistics: { totalEpisodeCount: 6 },
        },
      ]),
    ).toEqual({ 3: 6 })
  })

  it('returns an empty map when the series has no seasons', () => {
    expect(countsFromSeasonStatistics(undefined)).toEqual({})
  })
})

describe('countsFromEpisodes', () => {
  it('counts episodes per real season', () => {
    expect(
      countsFromEpisodes([
        { seasonNumber: 0 },
        { seasonNumber: 1 },
        { seasonNumber: 1 },
        { seasonNumber: 2 },
      ]),
    ).toEqual({ 1: 2, 2: 1 })
  })

  it('matches the statistics shape for the same series', () => {
    const episodes = [1, 1, 1, 2, 2].map((seasonNumber) => ({ seasonNumber }))
    expect(countsFromEpisodes(episodes)).toEqual(
      countsFromSeasonStatistics([
        {
          seasonNumber: 1,
          monitored: true,
          statistics: { totalEpisodeCount: 3 },
        },
        {
          seasonNumber: 2,
          monitored: true,
          statistics: { totalEpisodeCount: 2 },
        },
      ]),
    )
  })
})

describe('sameSeasonEpisodeCounts', () => {
  it('matches the same seasons and totals in any key order', () => {
    expect(sameSeasonEpisodeCounts({ 2: 10, 1: 8 }, { 1: 8, 2: 10 })).toBe(true)
  })

  it('differs when a total changes', () => {
    expect(sameSeasonEpisodeCounts({ 1: 8 }, { 1: 10 })).toBe(false)
  })

  it('differs when a season is added or removed', () => {
    expect(sameSeasonEpisodeCounts({ 1: 8 }, { 1: 8, 2: 10 })).toBe(false)
    expect(sameSeasonEpisodeCounts({ 1: 8, 2: 10 }, { 1: 8 })).toBe(false)
  })

  it('differs when nothing is stored yet', () => {
    expect(sameSeasonEpisodeCounts(null, { 1: 8 })).toBe(false)
    expect(sameSeasonEpisodeCounts(undefined, { 1: 8 })).toBe(false)
  })
})
