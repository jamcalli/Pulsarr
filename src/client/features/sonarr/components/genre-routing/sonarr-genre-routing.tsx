import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useSonarrGenreRoutingSection } from '@/features/sonarr/hooks/genre-routing/useSonarrGenreRoutingSection'
import GenreRouteCard from '@/features/sonarr/components/genre-routing/sonarr-genre-route-card'
import DeleteGenreRouteAlert from '@/features/sonarr/components/genre-routing/delete-genre-route-alert'

const SonarrGenreRoutingSection = () => {
  const {
    genreRoutes,
    localRoutes,
    savingRoutes,
    deleteConfirmationRouteId,
    handleAddRoute,
    handleSaveNewRoute,
    handleUpdateRoute,
    handleGenreDropdownOpen,
    handleRemoveRoute,
    handleCancelLocalRoute,
    setDeleteConfirmationRouteId,
  } = useSonarrGenreRoutingSection()

  const [showRouteCard, setShowRouteCard] = useState(false)

  const addRoute = () => {
    setShowRouteCard(true)
    handleAddRoute()
  }

  const hasExistingRoutes = genreRoutes.length > 0

  return (
    <div className="grid gap-6">
      {!hasExistingRoutes && !showRouteCard ? (
        <div className="grid gap-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-text">
              Sonarr Genre Routes
            </h2>
          </div>
          <div className="text-center py-8 text-text">
            <p>No genre routes configured</p>
            <Button onClick={addRoute} className="mt-4">
              Add Your First Route
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-text">
              Sonarr Genre Routes
            </h2>
            <Button onClick={addRoute}>Add Route</Button>
          </div>
          <div className="grid gap-4">
            {/* Saved routes */}
            {genreRoutes.map((route) => (
              <GenreRouteCard
                key={route.id}
                route={route}
                onSave={(data) => handleUpdateRoute(route.id, data)}
                onCancel={() => null}
                onRemove={() => setDeleteConfirmationRouteId(route.id)}
                onGenreDropdownOpen={handleGenreDropdownOpen}
                isSaving={!!savingRoutes[route.id]}
              />
            ))}
            {/* Local (unsaved) routes */}
            {localRoutes.map((route) => (
              <GenreRouteCard
                key={route.tempId}
                route={route}
                isNew={true}
                onSave={(data) => handleSaveNewRoute(route.tempId, data)}
                onCancel={() => {
                  handleCancelLocalRoute(route.tempId)
                  setShowRouteCard(false)
                }}
                onGenreDropdownOpen={handleGenreDropdownOpen}
                isSaving={!!savingRoutes[route.tempId]}
              />
            ))}
          </div>
        </>
      )}
      <DeleteGenreRouteAlert
        open={deleteConfirmationRouteId !== null}
        onOpenChange={() => setDeleteConfirmationRouteId(null)}
        onConfirm={handleRemoveRoute}
        routeName={
          genreRoutes.find((r) => r.id === deleteConfirmationRouteId)?.name ||
          ''
        }
      />
    </div>
  )
}

export default SonarrGenreRoutingSection
