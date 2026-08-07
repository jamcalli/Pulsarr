import { ServerResponse } from 'node:http'

// Bun skips setting writableEnded when end() runs without a socket handle,
// which is how light-my-request builds responses. Fastify reads it via
// reply.sent, so inject() runs the route handler even after a hook replied.
// Remove once https://github.com/oven-sh/bun/issues/25632 ships.
const originalEnd = ServerResponse.prototype.end

Object.defineProperty(ServerResponse.prototype, 'end', {
  configurable: true,
  writable: true,
  value: function patchedEnd(
    this: ServerResponse,
    ...args: Parameters<typeof originalEnd>
  ): ServerResponse {
    const result = originalEnd.apply(this, args)
    if (!this.writableEnded) {
      Object.defineProperty(this, 'writableEnded', {
        value: true,
        configurable: true,
      })
    }
    return result
  },
})
