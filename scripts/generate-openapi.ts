#!/usr/bin/env bun
/// <reference types="bun-types" />
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import openapiApp from './openapi-app.js'

type FastifyInstanceWithSwagger = FastifyInstance & {
  swagger?: () => Record<string, unknown>
}

process.env.NODE_ENV = 'production'
process.env.authenticationMethod = 'disabled'
process.env.logLevel = 'error'
process.env.baseUrl = 'https://your-pulsarr-instance.com'

const app = Fastify({
  logger: false,
  ajv: {
    customOptions: {
      coerceTypes: 'array',
      removeAdditional: 'all',
    },
  },
}) as FastifyInstanceWithSwagger

await app.register(fp(openapiApp))
await app.ready()

if (!app.swagger) {
  throw new Error('@fastify/swagger plugin is not loaded')
}

const schema = JSON.stringify(app.swagger(), undefined, 2)
const outputPath = resolve(process.cwd(), 'docs/static/openapi.json')

await writeFile(outputPath, schema, { flag: 'w+' })
console.log(`OpenAPI spec generated: ${outputPath}`)

await app.close()

console.log('Running formatter...')
const formatProcess = spawn('bun', ['run', 'fix'], {
  stdio: 'inherit',
})

await new Promise((resolve) => {
  formatProcess.on('exit', (code) => {
    if (code === 0) {
      console.log('OpenAPI spec formatted successfully')
    } else {
      console.warn(
        `Formatter exited with code ${code}, but spec was still generated`,
      )
    }
    resolve(undefined)
  })
  formatProcess.on('error', (error) => {
    console.warn(`Failed to run formatter: ${error.message}`)
    resolve(undefined)
  })
})
