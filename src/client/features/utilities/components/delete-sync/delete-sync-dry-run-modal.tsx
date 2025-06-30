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
 * Presents a modal interface to analyze and preview which movies and shows would be deleted in a sync operation.
 *
 * Displays a progress dialog during analysis, then transitions to a responsive results view with summary statistics, tabbed and searchable lists, and safety warnings if applicable. The results are shown in a drawer on mobile devices and a sheet on larger screens.
 *
 * @param open - Whether the modal is visible.
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
  const [showResultsContainer, setShowResultsContainer] = useState(false)

  // Only use drawer for mobile, use sheet for larger screens
  const isMobile = useMediaQuery('(max-width: 768px)')
  const useSheet = !isMobile

  // Progress tracking
  const selfWatchlistProgress = useWatchlistProgress('self-watchlist')
  const othersWatchlistProgress = useWatchlistProgress('others-watchlist')
  const [analyzeProgress, setAnalyzeProgress] = useState(0)

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setShowResults(false)
      setShowResultsContainer(false)
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
          setShowResultsContainer(true)
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

  // Handle opening and closing of the results container
  const handleOpenChange = (newOpen: boolean) => {
    setShowResultsContainer(newOpen)
    if (!newOpen) {
      onOpenChange(false)
    }
  }

  // Render the modal for loading/analysis phase
  const renderAnalysisModal = () => {
    if (!open || showResultsContainer) return null

    return (
      <Dialog
        open={open && !showResultsContainer}
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
            <DialogTitle className="text-foreground">
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
                <LoaderCircle className="h-16 w-16 animate-spin text-foreground" />
              </div>

              {/* Self Watchlist Progress */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-foreground">
                    {selfWatchlistProgress.message ||
                      'Analyzing Your Watchlist'}
                  </span>
                  <span className="text-sm text-foreground">
                    {selfWatchlistProgress.progress}%
                  </span>
                </div>
                <Progress value={selfWatchlistProgress.progress} />
              </div>

              {/* Others Watchlist Progress */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-foreground">
                    {othersWatchlistProgress.message ||
                      "Analyzing Others' Watchlists"}
                  </span>
                  <span className="text-sm text-foreground">
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
                <LoaderCircle className="h-16 w-16 animate-spin text-foreground" />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-foreground">
                    Calculating Deletion Impact
                  </span>
                  <span className="text-sm text-foreground">
                    {analyzeProgress}%
                  </span>
                </div>
                <Progress value={analyzeProgress} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    )
  }

  // Shared content for results display - with conditional styling based on container type
  const renderResultsContent = (isSheetContent = false) => {
    if (!deleteSyncDryRunResults) return null

    // For Sheet content, don't set a max height since the parent container scrolls
    const tableMaxHeight = isSheetContent ? '' : 'max-h-[400px]'

    return (
      <>
        {hasSafetyTriggered && (
          <div className="p-4 border border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 rounded-md flex items-start gap-3 mb-6">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
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

        <div
          className={`grid grid-cols-1 ${deleteSyncDryRunResults.total.protected ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-6`}
        >
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium text-foreground mb-2">
                Total
              </h3>
              <p className="text-2xl font-bold text-foreground">
                {deleteSyncDryRunResults.total.deleted}
              </p>
              <p className="text-sm text-foreground">Items would be deleted</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium text-foreground mb-2">
                Movies
              </h3>
              <p className="text-2xl font-bold text-foreground">
                {deleteSyncDryRunResults.movies.deleted}
              </p>
              <p className="text-sm text-foreground">Movies would be deleted</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium text-foreground mb-2">
                Shows
              </h3>
              <p className="text-2xl font-bold text-foreground">
                {deleteSyncDryRunResults.shows.deleted}
              </p>
              <p className="text-sm text-foreground">Shows would be deleted</p>
            </CardContent>
          </Card>
          {deleteSyncDryRunResults.total.protected ? (
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-foreground mb-2">
                  Protected
                </h3>
                <p className="text-2xl font-bold text-foreground">
                  {deleteSyncDryRunResults.total.protected}
                </p>
                <p className="text-sm text-foreground">
                  Items protected from deletion
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground" />
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
              <div className="text-center py-8 text-foreground">
                {searchTerm
                  ? 'No movies match your search'
                  : 'No movies to delete'}
              </div>
            ) : (
              <div className={`${tableMaxHeight} overflow-y-auto`}>
                <Table>
                  <TableHeader className="bg-main text-foreground uppercase sticky top-0 z-10">
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
                        className={
                          index % 2 === 0
                            ? 'bg-main'
                            : 'bg-secondary-background'
                        }
                      >
                        <TableCell className="py-3 px-4 font-medium text-foreground">
                          {movie.title}
                        </TableCell>
                        <TableCell className="py-3 px-4 text-foreground">
                          {movie.instance}
                        </TableCell>
                        <TableCell className="py-3 px-4 font-mono text-xs text-foreground">
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
              <div className="text-center py-8 text-foreground">
                {searchTerm
                  ? 'No shows match your search'
                  : 'No shows to delete'}
              </div>
            ) : (
              <div className={`${tableMaxHeight} overflow-y-auto`}>
                <Table>
                  <TableHeader className="bg-main text-foreground uppercase sticky top-0 z-10">
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
                        className={
                          index % 2 === 0
                            ? 'bg-main'
                            : 'bg-secondary-background'
                        }
                      >
                        <TableCell className="py-3 px-4 font-medium text-foreground">
                          {show.title}
                        </TableCell>
                        <TableCell className="py-3 px-4 text-foreground">
                          {show.instance}
                        </TableCell>
                        <TableCell className="py-3 px-4 font-mono text-xs text-foreground">
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
      </>
    )
  }

  // Render the appropriate container based on screen size
  // Use drawer for normal screens, sheet for extra-large screens
  const renderResultsContainer = () => {
    if (!showResultsContainer || !deleteSyncDryRunResults) return null

    // For tablet and desktop - use Sheet
    if (useSheet) {
      // Adjust the width based on screen size - smaller on tablets, larger on desktops
      return (
        <Sheet open={showResultsContainer} onOpenChange={handleOpenChange}>
          <SheetContent
            side="right"
            className={`
              !w-[90vw] md:!w-[70vw] lg:!w-[60vw] xl:!w-[50vw] 
              !max-w-[1000px] sm:!max-w-[1000px] overflow-y-auto
              flex flex-col p-5
            `}
          >
            <SheetHeader className="mb-6 shrink-0">
              <SheetTitle className="text-foreground text-xl">
                Delete Sync Analysis Results
              </SheetTitle>
              <SheetDescription>
                Preview of items that would be removed during the next delete
                sync
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto pb-8 px-1">
              {renderResultsContent(true)}
            </div>

            {/* Empty spacer div to ensure content doesn't get cut off */}
            <div className="h-2 shrink-0" />
          </SheetContent>
        </Sheet>
      )
    }

    // Only for mobile screens - use Drawer
    return (
      <Drawer open={showResultsContainer} onOpenChange={handleOpenChange}>
        <DrawerContent className="h-[90vh]">
          <DrawerHeader className="mb-6">
            <DrawerTitle className="text-foreground text-xl">
              Delete Sync Analysis Results
            </DrawerTitle>
            <DrawerDescription>
              Preview of items that would be removed during the next delete sync
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto h-[calc(90vh-120px)]">
            {renderResultsContent(false)}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <>
      {renderAnalysisModal()}
      {renderResultsContainer()}
    </>
  )
}

export default DeleteSyncDryRunModal
