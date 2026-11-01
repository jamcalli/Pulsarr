import { readdirSync, readFileSync } from 'node:fs'

const FIXTURE_DIR = './test/fixtures/config-store'

export type ConfigFixtureValue =
  | string
  | number
  | boolean
  | null
  | ConfigFixtureValue[]
  | { [key: string]: ConfigFixtureValue }

export interface ConfigFixture {
  row: Record<string, string | number | boolean | null>
  expected: Record<string, ConfigFixtureValue>
}

export function loadConfigFixture(name: string): ConfigFixture {
  return JSON.parse(
    readFileSync(`${FIXTURE_DIR}/${name}.json`, 'utf8'),
  ) as ConfigFixture
}

export function loadConfigFixtures(): {
  name: string
  fixture: ConfigFixture
}[] {
  return readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const name = file.replace('.json', '')
      return { name, fixture: loadConfigFixture(name) }
    })
}
