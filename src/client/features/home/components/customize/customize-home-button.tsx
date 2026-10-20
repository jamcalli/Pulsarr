import { lazy, Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { HomeLayoutState } from '@/features/home/hooks/useHomeLayout'

const CustomizeHomeDialog = lazy(
  () => import('@/features/home/components/customize/customize-home-dialog'),
)

export function CustomizeHomeButton({
  homeLayout,
}: {
  homeLayout: HomeLayoutState
}) {
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  const openDialog = () => {
    setOpened(true)
    setOpen(true)
  }
  return (
    <>
      <Button type="button" variant="neutral" size="sm" onClick={openDialog}>
        Customize
      </Button>
      {opened && (
        <Suspense fallback={null}>
          <CustomizeHomeDialog
            open={open}
            onOpenChange={setOpen}
            homeLayout={homeLayout}
          />
        </Suspense>
      )}
    </>
  )
}
