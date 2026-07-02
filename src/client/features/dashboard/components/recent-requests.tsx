import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { DashboardMediaCarousel } from '@/features/dashboard/components/dashboard-media-carousel'
import { MediaViewToggle } from '@/features/dashboard/components/media-view-toggle'
import { RecentRequestCard } from '@/features/dashboard/components/recent-request-card'
import { useMediaViewMode } from '@/features/dashboard/hooks/useMediaViewMode'
import {
  getLimitLabel,
  LIMIT_PRESETS,
  STATUS_FILTER_OPTIONS,
  useRecentRequests,
} from '@/features/dashboard/hooks/useRecentRequests'

/**
 * Recent Requests section for the dashboard.
 * Status/limit filters plus a shared media carousel (list view on mobile).
 */
export function RecentRequests() {
  const navigate = useNavigate()
  const { items, isLoading, error, status, setStatus, limit, setLimit } =
    useRecentRequests()
  const { view, setView } = useMediaViewMode('recent-requests')

  const filterOptions = useMemo(
    () =>
      STATUS_FILTER_OPTIONS.map((opt) => ({
        label: opt.label,
        value: opt.value,
      })),
    [],
  )

  const limitOptions = useMemo(
    () =>
      LIMIT_PRESETS.map((preset) => ({
        label: getLimitLabel(preset),
        value: preset.toString(),
      })),
    [],
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold text-foreground">Recent Requests</h2>
        <Select
          value={status}
          onValueChange={setStatus}
          options={filterOptions}
          disabled={isLoading}
          className="w-40"
        />
        <Select
          value={limit.toString()}
          onValueChange={(value) => setLimit(Number(value))}
          options={limitOptions}
          disabled={isLoading}
          className="w-27.5"
        />
        <MediaViewToggle view={view} onViewChange={setView} />
        <Button
          variant="neutralnoShadow"
          className="flex items-center gap-2"
          onClick={() => navigate('/approvals')}
        >
          <span>View All</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* grid-cols-1's minmax(0,1fr) keeps the carousel's intrinsic width from stretching the page */}
      <div className="grid grid-cols-1">
        <DashboardMediaCarousel
          items={items}
          loading={isLoading}
          error={error}
          emptyMessage="No recent requests"
          fullWidth
          view={view}
          getKey={(item) => `${item.source}-${item.id}`}
          renderItem={(item, orientation) => (
            <RecentRequestCard item={item} orientation={orientation} />
          )}
        />
      </div>
    </div>
  )
}
