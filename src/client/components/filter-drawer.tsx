import type { ReactNode } from 'react'
import { useState } from 'react'
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/credenza'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'

interface FilterDrawerProps {
  count: number
  filtered: boolean
  onClear: () => void
  closeLabel: string
  children: ReactNode
}

export function FilterDrawer({
  count,
  filtered,
  onClear,
  closeLabel,
  children,
}: FilterDrawerProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Filters
        {count > 0 && <Badge variant="secondary">{formatNumber(count)}</Badge>}
      </Button>
      <Credenza open={open} onOpenChange={setOpen}>
        <CredenzaContent>
          <CredenzaHeader>
            <CredenzaTitle>Filters</CredenzaTitle>
          </CredenzaHeader>
          <CredenzaBody>{children}</CredenzaBody>
          <CredenzaFooter>
            <Button
              type="button"
              variant="outline"
              disabled={!filtered}
              onClick={onClear}
            >
              Clear filters
            </Button>
            <CredenzaClose render={<Button type="button" />}>
              {closeLabel}
            </CredenzaClose>
          </CredenzaFooter>
        </CredenzaContent>
      </Credenza>
    </>
  )
}
