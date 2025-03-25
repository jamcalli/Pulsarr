import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Search } from 'lucide-react'
import { useUtilitiesStore } from '@/features/utilities/stores/utilitiesStore'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function DeleteSyncResults() {
  const { deleteSyncDryRunResults, loading } = useUtilitiesStore()
  const [searchTerm, setSearchTerm] = useState('')
  
  if (!deleteSyncDryRunResults && !loading.deleteSyncDryRun) {
    return null
  }
  
  const filterItems = (items: any[] | undefined) => {
    if (!items) return []
    if (!searchTerm) return items
    
    return items.filter(item => 
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.guid.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.instance.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }
  
  const filteredMovies = filterItems(deleteSyncDryRunResults?.movies.items)
  const filteredShows = filterItems(deleteSyncDryRunResults?.shows.items)
  
  const hasSafetyTriggered = deleteSyncDryRunResults?.safetyTriggered

  return (
    <div className="bg-bw shadow-md relative overflow-hidden rounded-base">
      <div className="bg-main text-text px-6 py-4">
        <h3 className="text-lg font-medium">Delete Sync Results</h3>
        <p className="text-sm">Preview of items that would be removed during the next delete sync</p>
      </div>
      <div className="p-6">
        {loading.deleteSyncDryRun ? (
          <div className="flex justify-center items-center h-24">
            <div className="animate-pulse text-text">
              Analyzing content for deletion...
            </div>
          </div>
        ) : deleteSyncDryRunResults ? (
          <div className="space-y-6">
            {hasSafetyTriggered && (
              <div className="p-4 border border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 rounded-md flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Safety Mechanism Triggered</h4>
                  <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                    {deleteSyncDryRunResults.safetyMessage || 'The deletion safety mechanism prevented automatic removal due to exceeding thresholds.'}
                  </p>
                </div>
              </div>
            )}
              
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-main px-4 py-3 rounded-md">
                <h3 className="text-sm font-medium text-text mb-2">Total</h3>
                <p className="text-2xl font-bold text-text">{deleteSyncDryRunResults.total.deleted}</p>
                <p className="text-sm text-text">Items would be deleted</p>
              </div>
              <div className="bg-main px-4 py-3 rounded-md">
                <h3 className="text-sm font-medium text-text mb-2">Movies</h3>
                <p className="text-2xl font-bold text-text">{deleteSyncDryRunResults.movies.deleted}</p>
                <p className="text-sm text-text">Movies would be deleted</p>
              </div>
              <div className="bg-main px-4 py-3 rounded-md">
                <h3 className="text-sm font-medium text-text mb-2">Shows</h3>
                <p className="text-2xl font-bold text-text">{deleteSyncDryRunResults.shows.deleted}</p>
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
                  Movies <Badge variant="default" className="ml-2">{filteredMovies.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="shows" className="uppercase">
                  Shows <Badge variant="default" className="ml-2">{filteredShows.length}</Badge>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="movies" className="mt-4">
                {filteredMovies.length === 0 ? (
                  <div className="text-center py-8 text-text">
                    {searchTerm ? "No movies match your search" : "No movies to delete"}
                  </div>
                ) : (
                  <div className="border-2 border-border dark:border-darkBorder rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-black text-white uppercase">
                        <TableRow>
                          <TableHead className="text-left py-3 px-4">Title</TableHead>
                          <TableHead className="text-left py-3 px-4">Instance</TableHead>
                          <TableHead className="text-left py-3 px-4">ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMovies.map((movie, index) => (
                          <TableRow 
                            key={`movie-${index}`} 
                            className={index % 2 === 0 ? 'bg-main' : 'bg-bw'}
                          >
                            <TableCell className="py-3 px-4 font-medium text-text">{movie.title}</TableCell>
                            <TableCell className="py-3 px-4 text-text">{movie.instance}</TableCell>
                            <TableCell className="py-3 px-4 font-mono text-xs text-text">{movie.guid}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="shows" className="mt-4">
                {filteredShows.length === 0 ? (
                  <div className="text-center py-8 text-text">
                    {searchTerm ? "No shows match your search" : "No shows to delete"}
                  </div>
                ) : (
                  <div className="border-2 border-border dark:border-darkBorder rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-black text-white uppercase">
                        <TableRow>
                          <TableHead className="text-left py-3 px-4">Title</TableHead>
                          <TableHead className="text-left py-3 px-4">Instance</TableHead>
                          <TableHead className="text-left py-3 px-4">ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredShows.map((show, index) => (
                          <TableRow 
                            key={`show-${index}`}
                            className={index % 2 === 0 ? 'bg-main' : 'bg-bw'}
                          >
                            <TableCell className="py-3 px-4 font-medium text-text">{show.title}</TableCell>
                            <TableCell className="py-3 px-4 text-text">{show.instance}</TableCell>
                            <TableCell className="py-3 px-4 font-mono text-xs text-text">{show.guid}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="text-center py-12 text-text">
            Run a dry delete to see content that would be removed
          </div>
        )}
      </div>
    </div>
  )
}