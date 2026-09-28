import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WORKFLOW_DIR = 'src/services/watchlist-workflow'
const WORKFLOW_SERVICE = 'src/services/watchlist-workflow.service.ts'

function workflowSources(): string[] {
  const nested = readdirSync(WORKFLOW_DIR, {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name))
  return [...nested, WORKFLOW_SERVICE]
}

// state.signal swaps on restart; a check that reads it after an await answers to the wrong run
describe('workflow run signal', () => {
  it('is captured once per function, never read live after an await', () => {
    const liveReads = workflowSources().flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          /state\.signal\.aborted/.test(line) ? [`${file}:${index + 1}`] : [],
        ),
    )

    expect(liveReads).toEqual([])
  })
})
