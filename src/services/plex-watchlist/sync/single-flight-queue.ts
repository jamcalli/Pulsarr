export interface SingleFlightQueue<T> {
  /** Joins a pending run with the same key, otherwise queues work to start after every earlier run settles. */
  run(key: string, work: () => Promise<T>): Promise<T>
  /** True while a run with this key is queued or running, so a run with it now joins. */
  isPending(key: string): boolean
}

export function createSingleFlightQueue<T>(): SingleFlightQueue<T> {
  const pending = new Map<string, Promise<T>>()
  let tail: Promise<void> = Promise.resolve()

  return {
    run(key, work) {
      const joined = pending.get(key)
      if (joined) return joined

      const run = tail.then(work, work)
      const clear = () => {
        pending.delete(key)
      }
      pending.set(key, run)
      tail = run.then(clear, clear)
      return run
    },
    isPending: (key) => pending.has(key),
  }
}
