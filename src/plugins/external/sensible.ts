import sensible from '@fastify/sensible'

export const autoConfig = {
  sharedSchemaId: 'HttpError',
}

/**
 * This plugin adds some utilities to handle http errors
 *
 * @see {@link https://github.com/fastify/fastify-sensible}
 */
export default sensible
