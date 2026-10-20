import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CustomizeHomeDialog } from '@/features/home/components/customize/customize-home-dialog'
import type { HomeLayoutState } from '@/features/home/hooks/useHomeLayout'

export function CustomizeHomeButton({
  homeLayout,
}: {
  homeLayout: HomeLayoutState
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="neutral"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Customize
      </Button>
      <CustomizeHomeDialog
        open={open}
        onOpenChange={setOpen}
        homeLayout={homeLayout}
      />
    </>
  )
}
