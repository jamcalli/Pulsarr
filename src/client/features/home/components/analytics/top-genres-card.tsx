import { ErrorAlert } from '@/components/error-alert'
import { StatBar, StatBarList } from '@/components/stat-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  OverflowList,
  OverflowSummarySkeleton,
} from '@/features/home/components/overflow-list'
import type { TopGenres } from '@/features/home/hooks/useTopGenres'
import { rangeLabel } from '@/features/home/lib/range-label'
import { TOP_GENRES_VISIBLE } from '@/features/home/lib/ranked-rows'
import { formatCount } from '@/lib/format'
import type { components } from '@/types/api.js'

type GenreCount = components['schemas']['GenreStat']

const SKELETON_ROWS = Array.from(
  { length: TOP_GENRES_VISIBLE },
  (_, row) => `row-${row}`,
)

function TopGenresSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-3">
        {SKELETON_ROWS.map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
      <OverflowSummarySkeleton />
    </>
  )
}

function GenreRows({
  genres,
  topCount,
}: {
  genres: GenreCount[]
  topCount: number
}) {
  return (
    <StatBarList className="flex flex-col gap-3">
      {genres.map((genre, index) => (
        <StatBar
          key={genre.genre}
          label={genre.genre}
          value={genre.count}
          total={topCount}
          color="chart-single"
          showPercent={false}
          icon={
            <span className="w-6 shrink-0 text-muted-foreground tabular-nums">
              {index + 1}
            </span>
          }
        />
      ))}
    </StatBarList>
  )
}

function hiddenGenresSummary(hidden: GenreCount[]): string {
  return `+${formatCount(hidden.length, 'more genre')}`
}

export function TopGenresCard({ topGenres }: { topGenres: TopGenres }) {
  const genres = topGenres.data
  const topCount = Math.max(0, ...(genres ?? []).map((genre) => genre.count))

  const content = topGenres.errorMessage ? (
    <ErrorAlert message={topGenres.errorMessage} />
  ) : topGenres.isLoading ? (
    <TopGenresSkeleton />
  ) : genres === undefined ? null : genres.length === 0 ? (
    <p className="text-muted-foreground">No genre data yet.</p>
  ) : (
    <OverflowList
      rows={genres}
      visible={TOP_GENRES_VISIBLE}
      summary={hiddenGenresSummary}
      title="Top genres"
      description={rangeLabel(topGenres.days)}
      renderRows={(rows) => <GenreRows genres={rows} topCount={topCount} />}
    />
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top genres</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 gap-4">{content}</CardContent>
    </Card>
  )
}
