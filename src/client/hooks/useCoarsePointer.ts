import { useMediaQuery } from '@/hooks/useMediaQuery'

export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)')
}
