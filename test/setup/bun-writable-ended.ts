import { ServerResponse } from 'node:http'

// Bun leaves writableEnded unset when end() runs without a socket, so inject() would keep running a route after a hook replied (oven-sh/bun#25632)
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
