import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'

// Builds an error with arbitrary statusCode/code/message shapes to exercise
// the handler's malformed-error guard
const makeError = (props: Record<string, unknown>): Error =>
  Object.assign(new Error(), props)

describe('error handler', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()

    // Test-only routes outside /v1 so the auth hook does not intercept
    app.get('/boom/server', () => {
      throw new Error('DB password is hunter2 at /srv/db.sqlite')
    })
    app.get('/boom/client', () => {
      throw makeError({
        statusCode: 400,
        code: 'SOME_INTERNAL_CODE',
        message: 'bad input',
      })
    })
    app.get('/boom/unauthorized', () => {
      throw makeError({ statusCode: 401, message: 'Session expired' })
    })
    app.get('/boom/fractional', () => {
      throw makeError({ statusCode: 200.5, message: 'looks like success' })
    })
    app.get('/boom/nan', () => {
      throw makeError({ statusCode: Number.NaN, message: 'not a number' })
    })
    app.get('/boom/out-of-range', () => {
      throw makeError({ statusCode: 999, message: 'strange status' })
    })
    app.get('/boom/numeric-code', () => {
      throw makeError({
        statusCode: 400,
        code: 23505,
        message: 'duplicate key',
      })
    })
    app.get('/boom/empty-message', () => {
      throw makeError({ statusCode: 400, message: '' })
    })
    app.get('/boom/object-message', () => {
      throw makeError({ statusCode: 400, message: { detail: 'not a string' } })
    })

    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('masks 5xx bodies so internal details never reach the wire', async () => {
    const res = await app.inject({ url: '/boom/server' })

    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal Server Error',
    })
    expect(res.body).not.toContain('hunter2')
  })

  it('passes 4xx through with status text and strips the code property', async () => {
    const res = await app.inject({ url: '/boom/client' })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'bad input',
    })
    expect(res.body).not.toContain('SOME_INTERNAL_CODE')
  })

  it('passes 401 through with its own status text', async () => {
    const res = await app.inject({ url: '/boom/unauthorized' })

    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Session expired',
    })
  })

  it('returns a clean 500 for a fractional statusCode instead of HTTP 200', async () => {
    const res = await app.inject({ url: '/boom/fractional' })

    expect(res.statusCode).toBe(500)
    expect(res.json().message).toBe('Internal Server Error')
  })

  it('returns a clean 500 for NaN and out-of-range statusCodes', async () => {
    const nan = await app.inject({ url: '/boom/nan' })
    const outOfRange = await app.inject({ url: '/boom/out-of-range' })

    expect(nan.statusCode).toBe(500)
    expect(outOfRange.statusCode).toBe(500)
  })

  it('keeps a valid 400 clean when the error carries a numeric code', async () => {
    const res = await app.inject({ url: '/boom/numeric-code' })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'duplicate key',
    })
  })

  it('masks 4xx errors with an empty or non-string message as 500', async () => {
    const empty = await app.inject({ url: '/boom/empty-message' })
    const object = await app.inject({ url: '/boom/object-message' })

    expect(empty.statusCode).toBe(500)
    expect(empty.json().message).toBe('Internal Server Error')
    expect(object.statusCode).toBe(500)
    expect(object.json().message).toBe('Internal Server Error')
  })
})
