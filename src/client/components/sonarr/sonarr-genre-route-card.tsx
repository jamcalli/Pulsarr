import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import EditableCardHeader from '@/components/ui/editable-card-header'
import GenreRouteCardSkeleton from '@/components/sonarr/sonarr-genre-route-skeleton'
import { useSonarrStore } from '@/stores/sonarrStore'
import useSonarrGenreForm from '@/hooks/sonarr/useSonarrGenreForm'
import type { GenreRouteFormValues } from '@/types/sonarr/schemas'
import type { GenreRoute } from '@/types/sonarr/types'
import { useSonarrGenreRouting } from '@/hooks/sonarr/useSonarrGenreRouting'

interface GenreRouteCardProps {
  route: GenreRoute
  isNew?: boolean
  onCancel: () => void
  onSave: (data: GenreRouteFormValues) => Promise<void>
  onRemove?: () => void
  isSaving: boolean
  onGenreDropdownOpen: () => Promise<void>
}

const GenreRouteCard = ({
  route,
  isNew = false,
  onCancel,
  onSave,
  onRemove,
  isSaving,
  onGenreDropdownOpen,
}: GenreRouteCardProps) => {
  const instancesLoading = useSonarrStore((state) => state.instancesLoading)
  const genres = useSonarrStore((state) => state.genres)
  const { instances } = useSonarrGenreRouting()
  const {
    form,
    resetForm,
    setTitleValue,
    handleInstanceChange,
    getSelectedInstance,
  } = useSonarrGenreForm({
    route,
    isNew,
    onGenreDropdownOpen,
  })

  const selectedInstance = getSelectedInstance(instances)

  const handleSubmit = async (data: GenreRouteFormValues) => {
    try {
      await onSave(data)
    } catch (error) {
      console.error('Failed to save genre route:', error)
    }
  }

  const handleCancel = () => {
    resetForm()
    onCancel()
  }

  if (instancesLoading && !isNew) {
    return <GenreRouteCardSkeleton />
  }

  return (
    <div className="relative">
      {(form.formState.isDirty || isNew) && (
        <div
          className={cn(
            'absolute -inset-0.5 rounded-lg border-2 z-50',
            isNew ? 'border-blue' : 'border-fun',
            'animate-pulse pointer-events-none',
          )}
        />
      )}
      <Card className="bg-bg">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <EditableCardHeader
              title={form.watch('name')}
              isNew={isNew}
              isSaving={isSaving}
              isDirty={form.formState.isDirty}
              isValid={form.formState.isValid}
              onSave={form.handleSubmit(handleSubmit)}
              onCancel={handleCancel}
              onDelete={onRemove}
              onTitleChange={setTitleValue}
            />
            <CardContent>
              <div className="grid gap-4">
                {/* First Row */}
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="genre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">Genre</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          onOpenChange={(open) => {
                            if (open) onGenreDropdownOpen()
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select genre" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {genres.map((genre) => (
                              <SelectItem key={genre} value={genre}>
                                {genre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sonarrInstanceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">Sonarr Instance</FormLabel>
                        <Select
                          value={field.value.toString()}
                          onValueChange={handleInstanceChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select instance" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {instances.map((instance) => (
                              <SelectItem
                                key={instance.id}
                                value={instance.id.toString()}
                              >
                                {instance.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Second Row */}
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="rootFolder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">Root Folder</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select root folder" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {selectedInstance?.data?.rootFolders?.map(
                              (folder) => (
                                <SelectItem
                                  key={folder.path}
                                  value={folder.path}
                                >
                                  {folder.path}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="qualityProfile"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">Quality Profile</FormLabel>
                        <Select
                          value={field.value?.toString()}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select quality profile" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {selectedInstance?.data?.qualityProfiles?.map(
                              (profile) => (
                                <SelectItem
                                  key={profile.id}
                                  value={profile.id.toString()}
                                >
                                  {profile.name}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </form>
        </Form>
      </Card>
    </div>
  )
}

export default GenreRouteCard