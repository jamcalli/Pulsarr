import {
  landingStep,
  nextStep,
  previousStep,
  type SetupFacts,
  stepDone,
} from '@/features/setup/lib/steps'

const ALL_SET: SetupFacts = {
  linked: true,
  sonarr: true,
  radarr: true,
  server: true,
  ready: true,
}

describe('landingStep', () => {
  it('starts on the Plex account without a token', () => {
    expect(landingStep({ ...ALL_SET, linked: false })).toBe('plex')
  })

  it('starts on Sonarr when neither instance type exists', () => {
    expect(landingStep({ ...ALL_SET, sonarr: false, radarr: false })).toBe(
      'sonarr',
    )
  })

  it('skips to the finish when one instance type exists but the workflow is off', () => {
    expect(landingStep({ ...ALL_SET, sonarr: false, ready: false })).toBe(
      'finish',
    )
  })

  it('starts at the beginning once everything is set', () => {
    expect(landingStep(ALL_SET)).toBe('plex')
  })
})

describe('stepDone', () => {
  it('reads a fact step from its fact', () => {
    expect(stepDone('sonarr', ALL_SET, new Set())).toBe(true)
    expect(stepDone('sonarr', { ...ALL_SET, sonarr: false }, new Set())).toBe(
      false,
    )
  })

  it('ticks the Plex server from the live connection, not from passing it', () => {
    expect(stepDone('server', ALL_SET, new Set())).toBe(true)
    expect(
      stepDone('server', { ...ALL_SET, server: false }, new Set(['server'])),
    ).toBe(false)
  })

  it('counts New user defaults only once it was passed', () => {
    expect(stepDone('defaults', ALL_SET, new Set())).toBe(false)
    expect(stepDone('defaults', ALL_SET, new Set(['defaults']))).toBe(true)
  })
})

describe('nextStep and previousStep', () => {
  it('stop at the ends', () => {
    expect(previousStep('plex')).toBeNull()
    expect(nextStep('finish')).toBeNull()
  })

  it('walk the steps in order', () => {
    expect(nextStep('plex')).toBe('server')
    expect(previousStep('finish')).toBe('defaults')
  })
})
