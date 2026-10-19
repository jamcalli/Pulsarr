import { z } from 'zod'

export const BackgroundRunStateSchema = z
  .enum(['idle', 'running', 'done', 'failed'])
  .meta({
    id: 'BackgroundRunState',
    description:
      'Where the latest background run stands, idle when none ran since the server started',
  })

export const BackgroundRunStatusSchema = z.object({
  state: BackgroundRunStateSchema,
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  error: z.string().nullable().meta({
    description: 'Why the latest run failed, null unless state is failed',
  }),
})
