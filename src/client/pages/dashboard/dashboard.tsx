import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Activity, Users, Clock, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { WatchlistStatusBadge } from '@/components/ui/workflow-status-badge'

export function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  // Placeholder for API data loading
  useEffect(() => {
    // Simulate API data loading
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1500)

    return () => clearTimeout(timer)
  }, [])

  const handleRefresh = () => {
    setIsLoading(true)
    // Simulate API refresh
    setTimeout(() => {
      setIsLoading(false)
      setLastRefreshed(new Date())
    }, 1000)
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      {/* Dashboard Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <h1 className="text-3xl font-bold text-text">Main Workflow</h1>
          <WatchlistStatusBadge />
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isLoading}
          variant="neutral"
          className="flex items-center gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span>Refresh</span>
        </Button>
      </div>

      {/* Last refreshed timestamp */}
      <p className="text-sm text-gray-500 mb-6">
        Last updated: {lastRefreshed.toLocaleTimeString()}
      </p>

{/*
      // System Status Section 
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-text mb-4">System Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          // System Status Card 
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium">Services</CardTitle>
              <CardDescription>Overall system health</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <span className="text-sm font-medium">
                  All systems operational
                </span>
              </div>
            </CardContent>
          </Card>

          // CPU Usage Card 
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium">CPU Usage</CardTitle>
              <CardDescription>Server resources</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">45%</span>
                  <Zap className="h-4 w-4 text-amber-500" />
                </div>
                <Progress value={45} className="h-2" />
              </div>
            </CardContent>
          </Card>

          // Memory Usage Card 
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium">Memory</CardTitle>
              <CardDescription>RAM allocation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">3.2 GB / 8 GB</span>
                  <Activity className="h-4 w-4 text-green-500" />
                </div>
                <Progress value={40} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      // Active Statistics Section 
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-text mb-4">Active Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          // Total Users Card 
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium">Total Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Users className="h-8 w-8 text-blue-500" />
                <span className="text-3xl font-bold">2,547</span>
              </div>
              <p className="text-xs text-green-500 mt-2">
                ↑ 12% from last week
              </p>
            </CardContent>
          </Card>

          // Active Sessions Card 
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium">
                Active Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Activity className="h-8 w-8 text-green-500" />
                <span className="text-3xl font-bold">128</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">24 are premium users</p>
            </CardContent>
          </Card>

          // Processing Queue Card 
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium">Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Clock className="h-8 w-8 text-amber-500" />
                <span className="text-3xl font-bold">7</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">Average wait: 3 min</p>
            </CardContent>
          </Card>

          // Error Rate Card 
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium">Error Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Zap className="h-8 w-8 text-red-500" />
                <span className="text-3xl font-bold">0.8%</span>
              </div>
              <p className="text-xs text-green-500 mt-2">
                ↓ 0.3% from yesterday
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      // Recent Activity Section 
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-text mb-4">Recent Activity</h2>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              // Activity Items 
              {[1, 2, 3, 4, 5].map((item) => (
                <div
                  key={item}
                  className="flex items-start space-x-4 pb-4 border-b border-gray-100 dark:border-gray-800"
                >
                  <div className="h-2 w-2 mt-2 rounded-full bg-blue-500"></div>
                  <div>
                    <p className="text-sm font-medium">
                      {item % 2 === 0
                        ? 'New user registered'
                        : 'Processing job completed'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {`${item * 5} minutes ago`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      // System Health Overview 
      <div>
        <h2 className="text-2xl font-bold text-text mb-4">System Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          // Weekly Usage Card 
          <Card>
            <CardHeader>
              <CardTitle>Weekly Usage</CardTitle>
              <CardDescription>
                System load over the past 7 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
                <p className="text-gray-500">Chart placeholder</p>
              </div>
            </CardContent>
          </Card>

          // Resources Allocation Card 
          <Card>
            <CardHeader>
              <CardTitle>Resource Allocation</CardTitle>
              <CardDescription>
                Current system resource distribution
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
                <p className="text-gray-500">Chart placeholder</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
*/}
    </div>
  )
}

export default DashboardPage