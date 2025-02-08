import { useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import EditableCardHeader from '@/components/ui/editable-card-header'
import GenreRouteCardSkeleton from '@/components/sonarr/sonarr-genre-route-skeleton'
import { useConfig } from '@/context/context'

const genreRouteSchema = z.object({
  name: z.string().min(2, {
    message: 'Route name must be at least 2 characters.',
  }),
  genre: z.string().min(1, {
    message: 'Genre is required.',
  }),
  sonarrInstanceId: z.number().min(1, {
    message: 'Instance selection is required.',
  }),
  rootFolder: z.string().min(1, {
    message: 'Root folder is required.',
  }),
})

export type GenreRouteFormValues = z.infer<typeof genreRouteSchema>

interface GenreRouteCardProps {
  route: {
    id?: number
    name: string
    genre: string
    sonarrInstanceId: number
    rootFolder: string
  }
  isNew?: boolean
  onSave: (data: GenreRouteFormValues) => Promise<void>
  onCancel: () => void
  onRemove?: () => void
  onGenreDropdownOpen: () => Promise<void>
  instances: Array<{
    id: number
    name: string
    data?: { rootFolders?: Array<{ path: string }> }
  }>
  genres: string[]
  isSaving: boolean
}

const GenreRouteCard = ({
  route,
  isNew = false,
  onSave,
  onCancel,
  onRemove,
  onGenreDropdownOpen,
  instances,
  genres,
  isSaving,
}: GenreRouteCardProps) => {
  const { instancesLoading } = useConfig()
  const hasInitialized = useRef(false)

  const form = useForm<GenreRouteFormValues>({
    resolver: zodResolver(genreRouteSchema),
    defaultValues: {
      name: route.name,
      genre: route.genre,
      sonarrInstanceId: route.sonarrInstanceId,
      rootFolder: route.rootFolder,
    },
    mode: 'all',
  })

  useEffect(() => {
    const initializeComponent = async () => {
      if (hasInitialized.current) return
      hasInitialized.current = true

      if (!isNew) {
        await onGenreDropdownOpen()
      }
    }

    initializeComponent()
  }, [isNew, onGenreDropdownOpen])

  useEffect(() => {
    form.reset({
      name: route.name,
      genre: route.genre,
      sonarrInstanceId: route.sonarrInstanceId,
      rootFolder: route.rootFolder,
    })
  }, [route, form])

  useEffect(() => {
    if (isNew) {
      form.trigger()
    }
  }, [form, isNew])

  const handleCancel = () => {
    form.reset({
      name: route.name,
      genre: route.genre,
      sonarrInstanceId: route.sonarrInstanceId,
      rootFolder: route.rootFolder,
    })
    onCancel()
  }

  const onSubmit = async (data: GenreRouteFormValues) => {
    try {
      await onSave(data)
      form.reset(data)
    } catch (error) {}
  }

  const selectedInstance = instances.find(
    (inst) => inst.id === form.watch('sonarrInstanceId'),
  )

  if (instancesLoading && !isNew) {
    return <GenreRouteCardSkeleton />
  }

  return (
    <Card className="bg-bg">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <EditableCardHeader
            title={form.watch('name')}
            isNew={isNew}
            isSaving={isSaving}
            isDirty={form.formState.isDirty}
            isValid={form.formState.isValid}
            onSave={form.handleSubmit(onSubmit)}
            onCancel={handleCancel}
            onDelete={onRemove}
            onTitleChange={(newTitle) =>
              form.setValue('name', newTitle, { shouldDirty: true })
            }
          />
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="genre"
                render={({ field }) => (
                  <FormItem>
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
                    <Select
                      value={field.value.toString()}
                      onValueChange={(value) => {
                        field.onChange(Number.parseInt(value))
                        form.setValue('rootFolder', '', { shouldDirty: true })
                      }}
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
              <FormField
                control={form.control}
                name="rootFolder"
                render={({ field }) => (
                  <FormItem>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select root folder" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectedInstance?.data?.rootFolders?.map((folder) => (
                          <SelectItem key={folder.path} value={folder.path}>
                            {folder.path}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </form>
      </Form>
    </Card>
  )
}

export default GenreRouteCard
