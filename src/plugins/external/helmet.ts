import helmet from '@fastify/helmet'

export const autoConfig = {
  contentSecurityPolicy: false,  // Disable CSP for testing
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}

export default helmet