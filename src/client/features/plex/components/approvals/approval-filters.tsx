import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Filter, X } from 'lucide-react'
import { useApprovalsStore } from '@/features/plex/store/approvalsStore'
import type { GetApprovalRequestsQuery } from '@root/schemas/approval/approval.schema'

/**
 * Provides a user interface for filtering, searching, and managing approval requests.
 *
 * Includes quick filter buttons, advanced filter controls for status, content type, trigger type, and user ID, as well as a search input for content title. Synchronizes local filter state with a global store, applies or clears filters, and displays badges for active filters. Disables controls while approval requests are loading.
 */
export default function ApprovalFilters() {
  const { currentQuery, setQuery, fetchApprovalRequests, approvalsLoading } =
    useApprovalsStore()

  const [localFilters, setLocalFilters] = useState({
    status: currentQuery.status || '',
    contentType: currentQuery.contentType || '',
    triggeredBy: currentQuery.triggeredBy || '',
    userId: currentQuery.userId?.toString() || '',
    searchTerm: '',
  })

  // Sync local filters with current query when it changes
  useEffect(() => {
    setLocalFilters({
      status: currentQuery.status || '',
      contentType: currentQuery.contentType || '',
      triggeredBy: currentQuery.triggeredBy || '',
      userId: currentQuery.userId?.toString() || '',
      searchTerm: '',
    })
  }, [currentQuery])

  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleFilterChange = (key: string, value: string) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }))
  }

  const applyFilters = async () => {
    const newQuery: GetApprovalRequestsQuery = {
      ...currentQuery,
      offset: 0, // Reset to first page
    }

    // Apply filters, removing empty values
    if (localFilters.status) {
      newQuery.status = localFilters.status as
        | 'pending'
        | 'approved'
        | 'rejected'
        | 'expired'
    }

    if (localFilters.contentType) {
      newQuery.contentType = localFilters.contentType as 'movie' | 'show'
    }

    if (localFilters.triggeredBy) {
      newQuery.triggeredBy = localFilters.triggeredBy as
        | 'quota_exceeded'
        | 'router_rule'
        | 'manual_flag'
        | 'content_criteria'
    }

    if (localFilters.userId) {
      const parsedUserId = Number.parseInt(localFilters.userId, 10)
      if (!Number.isNaN(parsedUserId)) {
        newQuery.userId = parsedUserId
      }
    }

    setQuery(newQuery)
    await fetchApprovalRequests(newQuery)
  }

  const clearFilters = async () => {
    setLocalFilters({
      status: '',
      contentType: '',
      triggeredBy: '',
      userId: '',
      searchTerm: '',
    })

    const clearedQuery = {
      limit: currentQuery.limit || 20,
      offset: 0,
    }

    setQuery(clearedQuery)
    await fetchApprovalRequests(clearedQuery)
  }

  const hasActiveFilters = Object.values(localFilters).some(
    (value) => value !== '',
  )

  // Quick filter presets
  const quickFilters = [
    { label: 'Pending', key: 'status', value: 'pending' },
    { label: 'Quota Exceeded', key: 'triggeredBy', value: 'quota_exceeded' },
    { label: 'Movies', key: 'contentType', value: 'movie' },
    { label: 'TV Shows', key: 'contentType', value: 'show' },
  ]

  const handleQuickFilter = async (key: string, value: string) => {
    // Toggle the filter - if it's already selected, clear it
    const currentValue = localFilters[key as keyof typeof localFilters]
    const newValue = currentValue === value ? '' : value

    const newFilters = { ...localFilters, [key]: newValue }
    setLocalFilters(newFilters)

    const newQuery: GetApprovalRequestsQuery = {
      ...currentQuery,
      offset: 0,
    }

    // Apply the new filter value (or remove it if empty)
    if (newValue) {
      if (key === 'status') {
        newQuery.status = newValue as
          | 'pending'
          | 'approved'
          | 'rejected'
          | 'expired'
      } else if (key === 'contentType') {
        newQuery.contentType = newValue as 'movie' | 'show'
      } else if (key === 'triggeredBy') {
        newQuery.triggeredBy = newValue as
          | 'quota_exceeded'
          | 'router_rule'
          | 'manual_flag'
          | 'content_criteria'
      } else if (key === 'userId') {
        newQuery.userId = Number.parseInt(newValue)
      }
    } else {
      if (key === 'status') {
        newQuery.status = undefined
      } else if (key === 'contentType') {
        newQuery.contentType = undefined
      } else if (key === 'triggeredBy') {
        newQuery.triggeredBy = undefined
      } else if (key === 'userId') {
        newQuery.userId = undefined
      }
    }

    setQuery(newQuery)
    await fetchApprovalRequests(newQuery)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Quick filters */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Quick Filters
            </Label>
            <div className="flex flex-wrap gap-2">
              {quickFilters.map((filter) => (
                <Button
                  key={`${filter.key}-${filter.value}`}
                  variant={
                    localFilters[filter.key as keyof typeof localFilters] ===
                    filter.value
                      ? 'default'
                      : 'neutral'
                  }
                  size="sm"
                  onClick={() => handleQuickFilter(filter.key, filter.value)}
                  disabled={approvalsLoading}
                >
                  {filter.label}
                </Button>
              ))}
              <Button
                variant="neutral"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="ml-2"
              >
                <Filter className="w-4 h-4 mr-1" />
                {showAdvanced ? 'Hide' : 'Show'} Advanced
              </Button>
            </div>
          </div>

          {/* Advanced filters */}
          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              {/* Status filter */}
              <div>
                <Label htmlFor="status-filter" className="text-sm font-medium">
                  Status
                </Label>
                <Select
                  value={localFilters.status}
                  onValueChange={(value) => handleFilterChange('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Content type filter */}
              <div>
                <Label
                  htmlFor="content-type-filter"
                  className="text-sm font-medium"
                >
                  Content Type
                </Label>
                <Select
                  value={localFilters.contentType}
                  onValueChange={(value) =>
                    handleFilterChange('contentType', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All types</SelectItem>
                    <SelectItem value="movie">Movies</SelectItem>
                    <SelectItem value="show">TV Shows</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Trigger filter */}
              <div>
                <Label htmlFor="trigger-filter" className="text-sm font-medium">
                  Triggered By
                </Label>
                <Select
                  value={localFilters.triggeredBy}
                  onValueChange={(value) =>
                    handleFilterChange('triggeredBy', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All triggers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All triggers</SelectItem>
                    <SelectItem value="quota_exceeded">
                      Quota Exceeded
                    </SelectItem>
                    <SelectItem value="router_rule">Router Rule</SelectItem>
                    <SelectItem value="manual_flag">Manual Flag</SelectItem>
                    <SelectItem value="content_criteria">
                      Content Criteria
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* User ID filter */}
              <div>
                <Label htmlFor="user-filter" className="text-sm font-medium">
                  User ID
                </Label>
                <Input
                  id="user-filter"
                  type="number"
                  placeholder="Enter user ID"
                  value={localFilters.userId}
                  onChange={(e) => handleFilterChange('userId', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Search and action buttons */}
          <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search by content title..."
                value={localFilters.searchTerm}
                onChange={(e) =>
                  handleFilterChange('searchTerm', e.target.value)
                }
                className="pl-10"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    applyFilters()
                  }
                }}
              />
            </div>
            <Button
              onClick={applyFilters}
              disabled={approvalsLoading}
              className="min-w-[100px]"
            >
              <Filter className="w-4 h-4 mr-1" />
              Apply
            </Button>
            {hasActiveFilters && (
              <Button
                variant="neutral"
                onClick={clearFilters}
                disabled={approvalsLoading}
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Active filters summary */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Active filters:
              </span>
              {localFilters.status && (
                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-xs">
                  Status: {localFilters.status}
                </span>
              )}
              {localFilters.contentType && (
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full text-xs">
                  Type: {localFilters.contentType}
                </span>
              )}
              {localFilters.triggeredBy && (
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded-full text-xs">
                  Trigger: {localFilters.triggeredBy}
                </span>
              )}
              {localFilters.userId && (
                <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 rounded-full text-xs">
                  User: {localFilters.userId}
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
