import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, PlayCircle, AlertTriangle, Check, RefreshCw, Power } from 'lucide-react'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { useConfigStore } from '@/stores/configStore'
import { DeleteSyncResults } from '@/features/utilities/components/delete-sync-results'
import { formatDistanceToNow, parseISO } from 'date-fns'

export function UtilitiesDashboard() {
  const { 
    schedules, 
    loading, 
    error, 
    fetchSchedules, 
    runDryDeleteSync,
    runScheduleNow,
    toggleScheduleStatus
  } = useUtilitiesStore()
  const { config } = useConfigStore()
  
  const [isDryRunLoading, setIsDryRunLoading] = useState(false)
  const [dryRunError, setDryRunError] = useState<string | null>(null)

  useEffect(() => {
    fetchSchedules()
  }, [fetchSchedules])

  const handleDryRun = async () => {
    setIsDryRunLoading(true)
    setDryRunError(null)
    try {
      await runDryDeleteSync()
    } catch (err) {
      setDryRunError(err instanceof Error ? err.message : 'Failed to run dry run')
    } finally {
      setIsDryRunLoading(false)
    }
  }

  const handleRunNow = async (name: string) => {
    await runScheduleNow(name)
  }

  const handleToggleStatus = async (name: string, currentStatus: boolean) => {
    await toggleScheduleStatus(name, !currentStatus)
  }

  const getDeleteSyncJob = () => {
    if (!schedules) return null
    return schedules.find(job => job.name === 'delete-sync')
  }

  const deleteSyncJob = getDeleteSyncJob()
  
  const getStatusBadge = (job: typeof deleteSyncJob) => {
    if (!job) return <Badge variant="default">Unknown</Badge>
    
    if (!job.enabled) {
      return <Badge variant="default">Disabled</Badge>
    }
    
    if (job.last_run?.status === 'failed') {
      return <Badge variant="warn">Failed</Badge>
    }
    
    return <Badge variant="default">Active</Badge>
  }

  const formatLastRun = (job: typeof deleteSyncJob) => {
    if (!job?.last_run?.time) return 'Never'
    
    try {
      return formatDistanceToNow(parseISO(job.last_run.time), { addSuffix: true })
    } catch (e) {
      return job.last_run.time
    }
  }

  const formatNextRun = (job: typeof deleteSyncJob) => {
    if (!job?.next_run?.time) return 'Not scheduled'
    
    try {
      return formatDistanceToNow(parseISO(job.next_run.time), { addSuffix: true })
    } catch (e) {
      return job.next_run.time
    }
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <h2 className="mb-4 text-2xl font-bold text-text">Utilities</h2>

      <div className="space-y-6">
        {/* Delete Sync Configuration Card */}
        <div className="bg-bw shadow-md relative overflow-hidden rounded-base">
          <div className="bg-main text-text px-6 py-4 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">Delete Sync</h3>
              <p className="text-sm">Automatically removes content when it's no longer on any watchlists</p>
            </div>
            {getStatusBadge(deleteSyncJob)}
          </div>
          <div className="p-6">
            {loading.schedules ? (
              <div className="flex justify-center items-center h-24">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : error.schedules ? (
              <div className="flex justify-center items-center h-24 text-red-500">
                <AlertTriangle className="h-6 w-6 mr-2" />
                <span>Error loading schedule: {error.schedules}</span>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <h3 className="font-medium text-sm text-text mb-1">Status</h3>
                    <p className="font-medium text-text">
                      {deleteSyncJob?.enabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-medium text-sm text-text mb-1">Last Run</h3>
                    <p className="font-medium text-text">
                      {formatLastRun(deleteSyncJob)}
                      {deleteSyncJob?.last_run?.status === 'failed' && (
                        <span className="text-red-500 ml-2">
                          (Failed)
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-medium text-sm text-text mb-1">Next Scheduled Run</h3>
                    <p className="font-medium text-text">
                      {formatNextRun(deleteSyncJob)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-medium text-sm text-text mb-2">Configuration</h3>
                    <ul className="space-y-2 text-text">
                      <li className="flex items-center">
                        <div className={`w-4 h-4 mr-2 rounded-full ${config?.deleteMovie ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span>Delete Movies: {config?.deleteMovie ? 'Enabled' : 'Disabled'}</span>
                      </li>
                      <li className="flex items-center">
                        <div className={`w-4 h-4 mr-2 rounded-full ${config?.deleteEndedShow ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span>Delete Ended Shows: {config?.deleteEndedShow ? 'Enabled' : 'Disabled'}</span>
                      </li>
                      <li className="flex items-center">
                        <div className={`w-4 h-4 mr-2 rounded-full ${config?.deleteContinuingShow ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span>Delete Continuing Shows: {config?.deleteContinuingShow ? 'Enabled' : 'Disabled'}</span>
                      </li>
                      <li className="flex items-center">
                        <div className={`w-4 h-4 mr-2 rounded-full ${config?.deleteFiles ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span>Delete Files: {config?.deleteFiles ? 'Enabled' : 'Disabled'}</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-medium text-sm text-text mb-2">Safety Settings</h3>
                    <ul className="space-y-2 text-text">
                      <li className="flex items-center">
                        <div className={`w-4 h-4 mr-2 rounded-full ${config?.respectUserSyncSetting ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span>Respect User Sync Settings: {config?.respectUserSyncSetting ? 'Enabled' : 'Disabled'}</span>
                      </li>
                      <li className="flex items-center">
                        <div className={`w-4 h-4 mr-2 rounded-full ${config?.deleteSyncNotify ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span>Notifications: {config?.deleteSyncNotify || 'None'}</span>
                      </li>
                      <li className="flex items-center">
                        <div className="w-4 h-4 mr-2 rounded-full bg-green-500"></div>
                        <span>Max Deletion Prevention: {config?.maxDeletionPrevention || 'Not set'}</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 mt-4">
                  <Button
                    onClick={() => handleDryRun()}
                    disabled={isDryRunLoading}
                    variant="noShadow"
                  >
                    {isDryRunLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Run Dry Delete
                      </>
                    )}
                  </Button>
                  
                  <Button
                    onClick={() => handleRunNow('delete-sync')}
                    disabled={!deleteSyncJob?.enabled || loading.schedules}
                    variant="default"
                  >
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Run Now
                  </Button>
                  
                  <Button
                    onClick={() => handleToggleStatus('delete-sync', Boolean(deleteSyncJob?.enabled))}
                    disabled={loading.schedules}
                    variant={deleteSyncJob?.enabled ? "error" : "default"}
                  >
                    <Power className="h-4 w-4 mr-2" />
                    {deleteSyncJob?.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  
                  <Button
                    onClick={() => fetchSchedules()}
                    disabled={loading.schedules}
                    variant="default"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
                
                {dryRunError && (
                  <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded border border-red-300 dark:border-red-700">
                    <div className="flex items-center">
                      <AlertTriangle className="h-5 w-5 mr-2" />
                      <span>{dryRunError}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Delete Sync Results Component */}
        <DeleteSyncResults />
        
      </div>
    </div>
  )
}

export default UtilitiesDashboard