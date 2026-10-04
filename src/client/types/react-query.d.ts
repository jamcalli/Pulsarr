import '@tanstack/react-query'
import type { OperationMeta } from '@/lib/operation-toasts'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: OperationMeta
  }
}
