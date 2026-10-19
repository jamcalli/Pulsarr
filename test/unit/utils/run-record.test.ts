import { createRunRecord } from '@utils/run-record.js'
import { describe, expect, it } from 'vitest'

describe('createRunRecord', () => {
  it('reads idle before any run', () => {
    expect(createRunRecord<number>().read()).toEqual({
      state: 'idle',
      startedAt: null,
      finishedAt: null,
      error: null,
      result: null,
    })
  })

  it('reads running, then done with the result', () => {
    const record = createRunRecord<number>()
    record.begin()
    expect(record.read()).toMatchObject({ state: 'running', finishedAt: null })

    record.succeed(7)
    expect(record.read()).toMatchObject({ state: 'done', result: 7 })
    expect(record.read().finishedAt).not.toBeNull()
  })

  it('reads failed with the error message', () => {
    const record = createRunRecord<number>()
    record.begin()
    record.fail(new Error('boom'))
    expect(record.read()).toMatchObject({
      state: 'failed',
      error: 'boom',
      result: null,
    })
  })

  it('keeps overlapping runs running until the last one settles', () => {
    const record = createRunRecord<number>()
    record.begin()
    record.begin()
    record.succeed(1)
    expect(record.read().state).toBe('running')

    record.succeed(2)
    expect(record.read()).toMatchObject({ state: 'done', result: 2 })
  })

  it('clears the previous outcome when a new run begins', () => {
    const record = createRunRecord<number>()
    record.begin()
    record.fail(new Error('boom'))
    record.begin()
    expect(record.read()).toMatchObject({
      state: 'running',
      error: null,
      result: null,
    })
  })
})
