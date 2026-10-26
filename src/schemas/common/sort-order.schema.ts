import { z } from 'zod'

export const SortOrderSchema = z.enum(['asc', 'desc']).meta({
  id: 'SortOrder',
  description: 'Sort direction, asc for ascending and desc for descending',
})
