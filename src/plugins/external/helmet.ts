import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import type { FastifyInstance } from 'fastify'
import type { FastifyHelmetOptions } from '@fastify/helmet'

const createHelmetConfig = (fastify: FastifyInstance): FastifyHelmetOptions => {
  const urlObject = new URL(fastify.config.baseUrl)
  const isLocal = urlObject.hostname === 'localhost' || urlObject.hostname === '127.0.0.1'
  const protocol = urlObject.protocol
  const domain = urlObject.hostname

  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://cdn.jsdelivr.net", 
          "https://unpkg.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://cdn.jsdelivr.net"
        ],
        connectSrc: [
          "'self'",
          `${protocol}//${domain}:${fastify.config.port}`,
          ...(isLocal ? [
            "http://localhost:*",
            "https://localhost:*",
            "http://127.0.0.1:*",
            "https://127.0.0.1:*",
          ] : [
            `${protocol}//${domain}:*`,
            protocol === 'https:' ? `wss://${domain}:*` : `ws://${domain}:*`
          ]),
          "https://cdn.jsdelivr.net"
        ],
        fontSrc: [
          "'self'",
          "data:",
          "https://cdn.jsdelivr.net",
          "https://fonts.gstatic.com",
          "https://fonts.scalar.com"
        ],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'", "blob:"],
        frameSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false, 
    crossOriginOpenerPolicy: false, 
    referrerPolicy: {
      policy: ['strict-origin-when-cross-origin']
    },
    hsts: protocol === 'https:' ? {
      maxAge: 15552000, 
      includeSubDomains: true,
      preload: true
    } : false,
    noSniff: true,
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'sameorigin' },
    hidePoweredBy: true
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(helmet, createHelmetConfig(fastify))
  },
  {
    dependencies: ['config']
  }
)