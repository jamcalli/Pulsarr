import fp from 'fastify-plugin'
import { scrypt, timingSafeEqual, randomBytes } from 'node:crypto'

declare module 'fastify' {
  export interface FastifyInstance {
    hash: typeof scryptHash;
    compare: typeof compare
  }
}

const SCRYPT_KEYLEN = 32
const SCRYPT_COST = 65536
const SCRYPT_BLOCK_SIZE = 8
const SCRYPT_PARALLELIZATION = 2
const SCRYPT_MAXMEM = 128 * SCRYPT_COST * SCRYPT_BLOCK_SIZE * 2

export async function scryptHash (value: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(Math.min(16, SCRYPT_KEYLEN / 2))

    scrypt(value, salt, SCRYPT_KEYLEN, {
      cost: SCRYPT_COST,
      blockSize: SCRYPT_BLOCK_SIZE,
      parallelization: SCRYPT_PARALLELIZATION,
      maxmem: SCRYPT_MAXMEM
    }, function (error, key) {
      /* c8 ignore start - Requires extreme or impractical configuration values */
      if (error !== null) {
        reject(error)
      } /* c8 ignore end */ else {
        resolve(`${salt.toString('hex')}.${key.toString('hex')}`)
      }
    })
  })
}

async function compare (value: string, hash: string): Promise<boolean> {
  const [salt, hashed] = hash.split('.')
  const saltBuffer = Buffer.from(salt, 'hex')
  const hashedBuffer = Buffer.from(hashed, 'hex')

  return new Promise((resolve) => {
    scrypt(value, saltBuffer, SCRYPT_KEYLEN, {
      cost: SCRYPT_COST,
      blockSize: SCRYPT_BLOCK_SIZE,
      parallelization: SCRYPT_PARALLELIZATION,
      maxmem: SCRYPT_MAXMEM
    }, function (error, key) {
      /* c8 ignore start - Requires extreme or impractical configuration values */
      if (error !== null) {
        timingSafeEqual(hashedBuffer, hashedBuffer)
        resolve(false)
      } /* c8 ignore end */ else {
        resolve(timingSafeEqual(key, hashedBuffer))
      }
    })
  })
}

export default fp(async (fastify) => {
  fastify.decorate('hash', scryptHash)
  fastify.decorate('compare', compare)
}, {
  name: 'scrypt'
})