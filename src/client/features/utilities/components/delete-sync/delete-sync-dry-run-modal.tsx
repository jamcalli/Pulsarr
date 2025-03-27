import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useWatchlistProgress } from '@/hooks/useProgress'
import { useMediaQuery } from '@/hooks/use-media-query'

interface MediaItem {
  title: string
  guid: string
  instance: string
}

/**
 * Renders a modal dialog for analysis and a sheet for displaying results of deletion sync operations.
 *
 * The component displays a loading state with progress indicators in a modal dialog while assessing the impact
 * of a deletion sync on media items. Once the analysis is complete, it switches to a sheet component to display
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
  const [showSheet, setShowSheet] = useState(false)
  const isLargeScreen = useMediaQuery('(min-width: 1200px)')

  // Progress tracking
  const selfWatchlistProgress = useWatchlistProgress('self-watchlist')
  const othersWatchlistProgress = useWatchlistProgress('others-watchlist')
  const [analyzeProgress, setAnalyzeProgress] = useState(0)

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setShowResults(false)
      setShowSheet(false)
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
          setShowSheet(true)
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

  // Handle opening and closing of the sheet
  const handleOpenChange = (newOpen: boolean) => {
    setShowSheet(newOpen)
    if (!newOpen) {
      onOpenChange(false)
    }
  }

  // Render the modal for loading/analysis phase
  const renderAnalysisModal = () => {
    if (!open || showSheet) return null

    return (
      <Dialog
        open={open && !showSheet}
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

  // Render the sheet for results display
  const renderResultsSheet = () => {
    if (!showSheet || !deleteSyncDryRunResults) return null

    return (
      <Sheet open={showSheet} onOpenChange={handleOpenChange}>
        <SheetContent
          side={isLargeScreen ? 'right' : 'bottom'}
          className={`${
            isLargeScreen ? 'w-[90vw] max-w-[1200px]' : 'h-[90vh]'
          } overflow-y-auto`}
        >
          <SheetHeader className="mb-6">
            <SheetTitle className="text-text text-xl">
              Delete Sync Analysis Results
            </SheetTitle>
            <SheetDescription>
              Preview of items that would be removed during the next delete sync
            </SheetDescription>
          </SheetHeader>

          <div>
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
                  <div className="border-2 border-border dark:border-darkBorder rounded-md overflow-hidden">
                    <div className="max-h-[calc(80vh-320px)] overflow-y-auto">
                      <Table>
                        <TableHeader className="bg-black text-white uppercase sticky top-0 z-10">
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
                    <div className="max-h-[calc(80vh-320px)] overflow-y-auto">
                      <Table>
                        <TableHeader className="bg-black text-white uppercase sticky top-0 z-10">
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
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <>
      {renderAnalysisModal()}
      {renderResultsSheet()}
    </>
  )
}

export default DeleteSyncDryRunModal
