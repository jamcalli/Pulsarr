import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Search, LoaderCircle } from 'lucide-react'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'
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

/**
 * Renders a modal dialog for analysis and a drawer for displaying results of deletion sync operations.
 *
 * The component displays a loading state with progress indicators in a modal dialog while assessing the impact
 * of a deletion sync on media items. Once the analysis is complete, it switches to a drawer component to display
 * the results in a tabbed interface with search functionality, providing better handling for large datasets.
 *
 * @param open - Indicates whether the component is visible.
 * @param onOpenChange - Callback to update the open state.
 */
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
  const [showDrawer, setShowDrawer] = useState(false)

  // Progress tracking
  const selfWatchlistProgress = useWatchlistProgress('self-watchlist')
  const othersWatchlistProgress = useWatchlistProgress('others-watchlist')
  const [analyzeProgress, setAnalyzeProgress] = useState(0)

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setShowResults(false)
      setShowDrawer(false)
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
          setShowDrawer(true)
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

  // Handle opening and closing of the drawer
  const handleOpenChange = (newOpen: boolean) => {
    setShowDrawer(newOpen)
    if (!newOpen) {
      onOpenChange(false)
    }
  }

  // Render the modal for loading/analysis phase
  const renderAnalysisModal = () => {
    if (!open || showDrawer) return null

    return (
      <Dialog
        open={open && !showDrawer}
        onOpenChange={(newOpen) => {
          // Only allow closing when not in loading state
          if (!loading.deleteSyncDryRun && showResults) {
            onOpenChange(newOpen)
          }
        }}
      >
        <DialogContent
          className="sm:max-w-md [&>button]:hidden"
          onPointerDownOutside={(e) => {
            // Prevent closing on outside click during loading
            if (loading.deleteSyncDryRun || !showResults) {
              e.preventDefault()
            }
          }}
          onEscapeKeyDown={(e) => {
            // Prevent closing with Escape key during loading
            if (loading.deleteSyncDryRun || !showResults) {
              e.preventDefault()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-text">
              Delete Sync Analysis
            </DialogTitle>
            <DialogDescription>
              {loading.deleteSyncDryRun
                ? 'Analyzing your content to determine what would be removed...'
                : 'Finalizing analysis...'}
            </DialogDescription>
          </DialogHeader>

          {/* Loading State */}
          {loading.deleteSyncDryRun && (
            <div className="py-4 space-y-8">
              <div className="flex justify-center items-center py-4">
                <LoaderCircle className="h-16 w-16 animate-spin text-text" />
              </div>

              {/* Self Watchlist Progress */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text">
                    {selfWatchlistProgress.message ||
                      'Analyzing Your Watchlist'}
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
                  <span className="text-sm text-text">
                    {othersWatchlistProgress.message ||
                      "Analyzing Others' Watchlists"}
                  </span>
                  <span className="text-sm text-text">
                    {othersWatchlistProgress.progress}%
                  </span>
                </div>
                <Progress value={othersWatchlistProgress.progress} />
              </div>
            </div>
          )}

          {/* Analysis State */}
          {!loading.deleteSyncDryRun && !showResults && (
            <div className="py-8 space-y-6">
              <div className="flex justify-center items-center py-4">
                <LoaderCircle className="h-16 w-16 animate-spin text-text" />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text">
                    Calculating Deletion Impact
                  </span>
                  <span className="text-sm text-text">{analyzeProgress}%</span>
                </div>
                <Progress value={analyzeProgress} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    )
  }

  // Render the drawer for results display
  const renderResultsDrawer = () => {
    if (!showDrawer || !deleteSyncDryRunResults) return null

    return (
      <Drawer open={showDrawer} onOpenChange={handleOpenChange}>
        <DrawerContent className="h-[90vh]">
          <DrawerHeader className="mb-6">
            <DrawerTitle className="text-text text-xl">
              Delete Sync Analysis Results
            </DrawerTitle>
            <DrawerDescription>
              Preview of items that would be removed during the next delete sync
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 pb-6 overflow-y-auto h-[calc(90vh-120px)]">
            {hasSafetyTriggered && (
              <div className="p-4 border border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 rounded-md flex items-start gap-3 mb-6">
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-sm font-medium text-text mb-2">Total</h3>
                  <p className="text-2xl font-bold text-text">
                    {deleteSyncDryRunResults.total.deleted}
                  </p>
                  <p className="text-sm text-text">Items would be deleted</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-sm font-medium text-text mb-2">Movies</h3>
                  <p className="text-2xl font-bold text-text">
                    {deleteSyncDryRunResults.movies.deleted}
                  </p>
                  <p className="text-sm text-text">Movies would be deleted</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-sm font-medium text-text mb-2">Shows</h3>
                  <p className="text-2xl font-bold text-text">
                    {deleteSyncDryRunResults.shows.deleted}
                  </p>
                  <p className="text-sm text-text">Shows would be deleted</p>
                </CardContent>
              </Card>
            </div>

            <div className="relative mb-6">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-text" />
              <Input
                placeholder="Search by title or ID..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <Tabs defaultValue="movies" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="movies" className="h-full py-0">
                  <span className="uppercase">Movies</span>
                  <Badge variant="neutral" className="ml-2">
                    {filteredMovies?.length || 0}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="shows" className="h-full py-0">
                  <span className="uppercase">Shows</span>
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
                  <div className="max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader className="bg-main text-text uppercase">
                        <TableRow>
                          <TableHead className="text-left py-3 px-4 font-medium">
                            Title
                          </TableHead>
                          <TableHead className="text-left py-3 px-4 font-medium">
                            Instance
                          </TableHead>
                          <TableHead className="text-left py-3 px-4 font-medium">
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
                  <div className="max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader className="bg-main text-text uppercase">
                        <TableRow>
                          <TableHead className="text-left py-3 px-4 font-medium">
                            Title
                          </TableHead>
                          <TableHead className="text-left py-3 px-4 font-medium">
                            Instance
                          </TableHead>
                          <TableHead className="text-left py-3 px-4 font-medium">
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
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <>
      {renderAnalysisModal()}
      {renderResultsDrawer()}
    </>
  )
}

export default DeleteSyncDryRunModal
