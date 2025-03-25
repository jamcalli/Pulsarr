import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PlayCircle, Power, Clock } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import type { JobStatus } from '@root/schemas/scheduler/scheduler.schema'

interface ScheduledJobsTableProps {
  jobs: JobStatus[]
  onRunNow: (name: string) => Promise<void>
  onToggleStatus: (name: string, currentStatus: boolean) => Promise<void>
}

export function ScheduledJobsTable({ jobs, onRunNow, onToggleStatus }: ScheduledJobsTableProps) {
  const getStatusBadge = (job: JobStatus) => {
    if (!job.enabled) {
      return <Badge variant="default">Disabled</Badge>
    }
    
    if (job.last_run?.status === 'failed') {
      return <Badge variant="warn">Failed</Badge>
    }
    
    return <Badge variant="default">Active</Badge>
  }

  const formatLastRun = (lastRun: JobStatus['last_run']) => {
    if (!lastRun?.time) return 'Never'
    
    try {
      return formatDistanceToNow(parseISO(lastRun.time), { addSuffix: true })
    } catch (e) {
      return lastRun.time
    }
  }

  const formatNextRun = (nextRun: JobStatus['next_run']) => {
    if (!nextRun?.time) return 'Not scheduled'
    
    try {
      return formatDistanceToNow(parseISO(nextRun.time), { addSuffix: true })
    } catch (e) {
      return nextRun.time
    }
  }

  const formatScheduleConfig = (job: JobStatus) => {
    if (job.type === 'interval') {
      const config = job.config
      const parts = []
      
      if (config.days) parts.push(`${config.days} day${config.days !== 1 ? 's' : ''}`)
      if (config.hours) parts.push(`${config.hours} hour${config.hours !== 1 ? 's' : ''}`)
      if (config.minutes) parts.push(`${config.minutes} minute${config.minutes !== 1 ? 's' : ''}`)
      if (config.seconds) parts.push(`${config.seconds} second${config.seconds !== 1 ? 's' : ''}`)
      
      return parts.length ? `Every ${parts.join(', ')}` : 'No interval set'
    }
    
    if (job.type === 'cron') {
      return `Cron: ${job.config.expression}`
    }
    
    return 'Unknown schedule type'
  }

  return (
    <div className="rounded-md border-border dark:border-darkBorder border-2">
      <Table>
        <TableHeader className="bg-black text-white uppercase">
          <TableRow>
            <TableHead className="text-left py-3 px-4">Job Name</TableHead>
            <TableHead className="text-left py-3 px-4">Schedule</TableHead>
            <TableHead className="text-left py-3 px-4">Last Run</TableHead>
            <TableHead className="text-left py-3 px-4">Next Run</TableHead>
            <TableHead className="text-left py-3 px-4">Status</TableHead>
            <TableHead className="text-right py-3 px-4">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job, index) => (
            <TableRow 
              key={job.name}
              className={index % 2 === 0 ? 'bg-main' : 'bg-bw'}
            >
              <TableCell className="py-3 px-4 font-medium text-text">
                {job.name}
              </TableCell>
              <TableCell className="py-3 px-4 text-text">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-text" />
                  <span>{formatScheduleConfig(job)}</span>
                </div>
              </TableCell>
              <TableCell className="py-3 px-4 text-text">
                {formatLastRun(job.last_run)}
                {job.last_run?.status === 'failed' && (
                  <div className="text-xs text-red-500 mt-1" title={job.last_run.error}>
                    Error: {job.last_run.error || 'Unknown error'}
                  </div>
                )}
              </TableCell>
              <TableCell className="py-3 px-4 text-text">
                {formatNextRun(job.next_run)}
              </TableCell>
              <TableCell className="py-3 px-4 text-text">
                {getStatusBadge(job)}
              </TableCell>
              <TableCell className="py-3 px-4 text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="noShadow"
                    size="sm"
                    onClick={() => onRunNow(job.name)}
                    disabled={!job.enabled}
                  >
                    <PlayCircle className="h-4 w-4" />
                    <span className="ml-2">Run</span>
                  </Button>
                  <Button
                    variant={job.enabled ? "error" : "default"}
                    size="sm"
                    onClick={() => onToggleStatus(job.name, job.enabled)}
                  >
                    <Power className="h-4 w-4" />
                    <span className="ml-2">{job.enabled ? 'Disable' : 'Enable'}</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}