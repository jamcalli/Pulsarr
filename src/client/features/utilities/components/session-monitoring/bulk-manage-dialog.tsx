import type {
  MonitoringType,
  SonarrShowsResponse,
} from '@root/schemas/session-monitoring/session-monitoring.schema'
import { Activity, Clock, Layers } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBulkManageMutation } from '@/features/utilities/hooks/useSessionMonitoringQueries'

type SonarrShow = SonarrShowsResponse['shows'][number]

interface BulkManageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedShows: SonarrShow[]
  onSuccess: () => void
}

export function BulkManageDialog({
  open,
  onOpenChange,
  selectedShows,
  onSuccess,
}: BulkManageDialogProps) {
  const [monitoringType, setMonitoringType] = useState<MonitoringType | ''>('')
  const [resetMonitoring, setResetMonitoring] = useState(false)
  const bulkManage = useBulkManageMutation()
  const resetCheckboxId = useId()

  const handleConfirm = async () => {
    if (!monitoringType) return

    bulkManage.mutate(
      {
        shows: selectedShows.map((s) => ({
          sonarrSeriesId: s.sonarrSeriesId,
          sonarrInstanceId: s.sonarrInstanceId,
          title: s.title,
          guids: s.guids,
          rollingShowId: s.rollingShowId,
        })),
        monitoringType,
        resetMonitoring,
      },
      {
        onSuccess: (data) => {
          const parts: string[] = []
          if (data.enrolled > 0) parts.push(`${data.enrolled} enrolled`)
          if (data.modified > 0) parts.push(`${data.modified} modified`)
          if (data.skipped > 0) parts.push(`${data.skipped} skipped`)
          toast.success(parts.join(', ') || data.message)
          setMonitoringType('')
          setResetMonitoring(false)
          onSuccess()
        },
        onError: (error) => {
          toast.error(error.message || 'Failed to manage shows')
        },
      },
    )
  }

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Manage Rolling Monitoring
          </CredenzaTitle>
          <CredenzaDescription>
            Configure rolling monitoring for {selectedShows.length} selected
            show
            {selectedShows.length !== 1 ? 's' : ''}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">
              Monitoring Type
            </span>
            <Select
              value={monitoringType}
              onValueChange={(val) => setMonitoringType(val as MonitoringType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select monitoring type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pilotRolling">
                  <span className="flex items-center gap-2">
                    <Activity className="h-4 w-4 shrink-0" />
                    Pilot Rolling
                  </span>
                </SelectItem>
                <SelectItem value="firstSeasonRolling">
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" />
                    First Season Rolling
                  </span>
                </SelectItem>
                <SelectItem value="allSeasonPilotRolling">
                  <span className="flex items-center gap-2">
                    <Layers className="h-4 w-4 shrink-0" />
                    All Season Pilot Rolling
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2 mt-4">
            <Checkbox
              id={resetCheckboxId}
              checked={resetMonitoring}
              onCheckedChange={(val) => setResetMonitoring(!!val)}
            />
            <label
              htmlFor={resetCheckboxId}
              className="text-sm font-medium text-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Reset monitoring to baseline
            </label>
          </div>
          <p className="text-xs text-foreground mt-1 ml-6">
            Unmonitors all episodes and applies the selected type from scratch
          </p>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-md mt-4">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              Resetting to baseline will immediately unmonitor excess episodes
              and delete their files based on the selected type. If unchecked,
              shows keep their current monitoring state but will still reset
              automatically when they exceed the inactivity threshold.
            </p>
          </div>
        </CredenzaBody>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral">Cancel</Button>
          </CredenzaClose>
          <Button
            variant="clear"
            onClick={handleConfirm}
            disabled={!monitoringType || bulkManage.isPending}
          >
            {bulkManage.isPending ? 'Processing...' : 'Confirm'}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
