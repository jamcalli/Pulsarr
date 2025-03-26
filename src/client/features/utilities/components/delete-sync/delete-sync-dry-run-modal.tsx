import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Search, Loader2 } from 'lucide-react'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useWatchlistProgress } from '@/hooks/useProgress'

interface MediaItem {
  title: string
  guid: string
  instance: string
}

export function DeleteSyncDryRunModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { deleteSyncDryRunResults, loading } = useUtilitiesStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [showResults, setShowResults] = useState(false)

  // Progress tracking
  const selfWatchlistProgress = useWatchlistProgress('self-watchlist')
  const othersWatchlistProgress = useWatchlistProgress('others-watchlist')
  const [analyzeProgress, setAnalyzeProgress] = useState(0)

  // Force modal to stay open during loading
  const handleOpenChange = (newOpen: boolean) => {
    // Only allow closing if not in loading state and results are shown
    if (!loading.deleteSyncDryRun && showResults) {
      onOpenChange(newOpen)
    }
  }

  // Reset modal state when opened
  useEffect(() => {
    if (open) {
      setShowResults(false)
      setSearchTerm('')
      setAnalyzeProgress(0)
    }
  }, [open])

  // Show results after all processing is complete
  useEffect(() => {
    if (
      open &&
      !loading.deleteSyncDryRun &&
      deleteSyncDryRunResults &&
      !showResults
    ) {
      // Animate a calculation progress for 1 second before showing results
      let progress = 0
      const interval = setInterval(() => {
        progress += 5
        setAnalyzeProgress(progress)
        if (progress >= 100) {
          clearInterval(interval)
          setShowResults(true)
        }
      }, 50)

      return () => clearInterval(interval)
    }
  }, [open, loading.deleteSyncDryRun, deleteSyncDryRunResults, showResults])

  const filterItems = (items: MediaItem[] | undefined) => {
    if (!items) return []
    if (!searchTerm) return items

    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.guid.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.instance.toLowerCase().includes(searchTerm.toLowerCase()),
    )
  }

  const filteredMovies = filterItems(deleteSyncDryRunResults?.movies.items)
  const filteredShows = filterItems(deleteSyncDryRunResults?.shows.items)

  const hasSafetyTriggered = deleteSyncDryRunResults?.safetyTriggered

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={showResults ? 'sm:max-w-3xl md:max-w-4xl' : 'sm:max-w-md'}
        onPointerDownOutside={(e) => {
          // Prevent closing during loading or analysis
          if (loading.deleteSyncDryRun || !showResults) {
            e.preventDefault()
          }
        }}
        onEscapeKeyDown={(e) => {
          // Prevent closing during loading or analysis
          if (loading.deleteSyncDryRun || !showResults) {
            e.preventDefault()
          }
        }}
        // We can't directly hide the close button, but we can prevent clicking it
        // The CSS for this would be added to your global styles
      >
        <DialogHeader>
          <DialogTitle className="text-text text-xl">
            Delete Sync Analysis
          </DialogTitle>
          <DialogDescription>
            {loading.deleteSyncDryRun
              ? 'Analyzing your content to determine what would be removed...'
              : !showResults
                ? 'Finalizing analysis...'
                : 'Preview of items that would be removed during the next delete sync'}
          </DialogDescription>
        </DialogHeader>

        {/* Loading State */}
        {loading.deleteSyncDryRun && (
          <div className="py-4 space-y-8">
            {/* Self Watchlist Progress */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text font-medium">
                  {selfWatchlistProgress.message || 'Analyzing Your Watchlist'}
                </span>
                <span className="text-sm text-text">
                  {selfWatchlistProgress.progress}%
                </span>
              </div>
              <Progress value={selfWatchlistProgress.progress} />
            </div>

            {/* Others Watchlist Progress */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text font-medium">
                  {othersWatchlistProgress.message ||
                    "Analyzing Others' Watchlists"}
                </span>
                <span className="text-sm text-text">
                  {othersWatchlistProgress.progress}%
                </span>
              </div>
              <Progress value={othersWatchlistProgress.progress} />
            </div>

            <div className="flex justify-center items-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-text" />
            </div>
          </div>
        )}

        {/* Analysis State */}
        {!loading.deleteSyncDryRun && !showResults && (
          <div className="py-8 space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text font-medium">
                  Calculating Deletion Impact
                </span>
                <span className="text-sm text-text">{analyzeProgress}%</span>
              </div>
              <Progress value={analyzeProgress} />
            </div>

            <div className="flex flex-col justify-center items-center py-4">
              <Loader2 className="h-10 w-10 animate-spin text-text mb-4" />
              <p className="text-text">Finalizing deletion analysis...</p>
            </div>
          </div>
        )}

        {/* Results State */}
        {!loading.deleteSyncDryRun &&
          showResults &&
          deleteSyncDryRunResults && (
            <div className="space-y-6 py-2">
              {hasSafetyTriggered && (
                <div className="p-4 border border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 rounded-md flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                      Safety Mechanism Triggered
                    </h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                      {deleteSyncDryRunResults.safetyMessage ||
                        'The deletion safety mechanism prevented automatic removal due to exceeding thresholds.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-main px-4 py-3 rounded-md">
                  <h3 className="text-sm font-medium text-text mb-2">Total</h3>
                  <p className="text-2xl font-bold text-text">
                    {deleteSyncDryRunResults.total.deleted}
                  </p>
                  <p className="text-sm text-text">Items would be deleted</p>
                </div>
                <div className="bg-main px-4 py-3 rounded-md">
                  <h3 className="text-sm font-medium text-text mb-2">Movies</h3>
                  <p className="text-2xl font-bold text-text">
                    {deleteSyncDryRunResults.movies.deleted}
                  </p>
                  <p className="text-sm text-text">Movies would be deleted</p>
                </div>
                <div className="bg-main px-4 py-3 rounded-md">
                  <h3 className="text-sm font-medium text-text mb-2">Shows</h3>
                  <p className="text-2xl font-bold text-text">
                    {deleteSyncDryRunResults.shows.deleted}
                  </p>
                  <p className="text-sm text-text">Shows would be deleted</p>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-text" />
                <Input
                  placeholder="Search by title or ID..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <Tabs defaultValue="movies" className="w-full">
                <TabsList className="grid w-full grid-cols-2 uppercase">
                  <TabsTrigger value="movies" className="uppercase">
                    Movies{' '}
                    <Badge variant="neutral" className="ml-2">
                      {filteredMovies?.length || 0}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="shows" className="uppercase">
                    Shows{' '}
                    <Badge variant="neutral" className="ml-2">
                      {filteredShows?.length || 0}
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="movies" className="mt-4">
                  {filteredMovies && filteredMovies.length === 0 ? (
                    <div className="text-center py-8 text-text">
                      {searchTerm
                        ? 'No movies match your search'
                        : 'No movies to delete'}
                    </div>
                  ) : (
                    <div className="border-2 border-border dark:border-darkBorder rounded-md overflow-hidden">
                      <Table>
                        <TableHeader className="bg-black text-white uppercase">
                          <TableRow>
                            <TableHead className="text-left py-3 px-4">
                              Title
                            </TableHead>
                            <TableHead className="text-left py-3 px-4">
                              Instance
                            </TableHead>
                            <TableHead className="text-left py-3 px-4">
                              ID
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredMovies?.map((movie, index) => (
                            <TableRow
                              key={movie.guid}
                              className={index % 2 === 0 ? 'bg-main' : 'bg-bw'}
                            >
                              <TableCell className="py-3 px-4 font-medium text-text">
                                {movie.title}
                              </TableCell>
                              <TableCell className="py-3 px-4 text-text">
                                {movie.instance}
                              </TableCell>
                              <TableCell className="py-3 px-4 font-mono text-xs text-text">
                                {movie.guid}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="shows" className="mt-4">
                  {filteredShows && filteredShows.length === 0 ? (
                    <div className="text-center py-8 text-text">
                      {searchTerm
                        ? 'No shows match your search'
                        : 'No shows to delete'}
                    </div>
                  ) : (
                    <div className="border-2 border-border dark:border-darkBorder rounded-md overflow-hidden">
                      <Table>
                        <TableHeader className="bg-black text-white uppercase">
                          <TableRow>
                            <TableHead className="text-left py-3 px-4">
                              Title
                            </TableHead>
                            <TableHead className="text-left py-3 px-4">
                              Instance
                            </TableHead>
                            <TableHead className="text-left py-3 px-4">
                              ID
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredShows?.map((show, index) => (
                            <TableRow
                              key={show.guid}
                              className={index % 2 === 0 ? 'bg-main' : 'bg-bw'}
                            >
                              <TableCell className="py-3 px-4 font-medium text-text">
                                {show.title}
                              </TableCell>
                              <TableCell className="py-3 px-4 text-text">
                                {show.instance}
                              </TableCell>
                              <TableCell className="py-3 px-4 font-mono text-xs text-text">
                                {show.guid}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <div className="flex justify-end pt-2">
                <Button variant="default" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
      </DialogContent>
    </Dialog>
  )
}

export default DeleteSyncDryRunModal
