import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { HomeRows } from '@/features/home/components/home-rows'
import { HOME_CARDS } from '@/features/home/lib/home-cards'
import { homeLayoutPref, visibleRows } from '@/features/home/lib/home-prefs'
import { readPref } from '@/lib/prefs'

export function HomeSkeleton() {
  const rows = visibleRows(readPref(homeLayoutPref))
  return (
    <Page wide busy>
      <PageHeaderSkeleton
        section={false}
        action={
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-24" />
          </div>
        }
      />
      <HomeRows rows={rows} renderCard={(id) => HOME_CARDS[id].skeleton()} />
    </Page>
  )
}
