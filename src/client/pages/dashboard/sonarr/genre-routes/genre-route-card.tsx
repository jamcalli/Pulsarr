import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Trash2, Loader2, Pen, Save } from 'lucide-react';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';

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
});

export type GenreRouteFormValues = z.infer<typeof genreRouteSchema>;

interface GenreRouteCardProps {
  route: {
    id?: number;
    name: string;
    genre: string;
    sonarrInstanceId: number;
    rootFolder: string;
  };
  isNew?: boolean;
  onSave: (data: GenreRouteFormValues) => Promise<void>;
  onCancel: () => void;
  onRemove?: () => void;
  onGenreDropdownOpen: () => Promise<void>;
  instances: Array<{ id: number; name: string; data?: { rootFolders?: Array<{ path: string }> } }>;
  genres: string[];
  isSaving: boolean;
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
  const [isEditing, setIsEditing] = useState(false);
  
  const form = useForm<GenreRouteFormValues>({
    resolver: zodResolver(genreRouteSchema),
    defaultValues: {
      name: route.name,
      genre: route.genre,
      sonarrInstanceId: route.sonarrInstanceId,
      rootFolder: route.rootFolder,
    },
    mode: "all"
  });

  useEffect(() => {
    form.reset({
      name: route.name,
      genre: route.genre,
      sonarrInstanceId: route.sonarrInstanceId,
      rootFolder: route.rootFolder,
    });
  }, [route, form]);

  useEffect(() => {
    if (isNew) {
      form.trigger();
    }
    onGenreDropdownOpen();
  }, [form, isNew, onGenreDropdownOpen]);

  const handleCancel = () => {
    form.reset({
      name: route.name,
      genre: route.genre,
      sonarrInstanceId: route.sonarrInstanceId,
      rootFolder: route.rootFolder,
    });
    setIsEditing(false);
    onCancel();
  };

  const onSubmit = async (data: GenreRouteFormValues) => {
    try {
      await onSave(data);
      form.reset(data);
      setIsEditing(false);
    } catch (error) {

    }
  };

  const selectedInstance = instances.find(
    (inst) => inst.id === form.watch('sonarrInstanceId')
  );

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;

  return (
    <Card className="bg-bg">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle className="flex justify-between items-center text-text">
              <div className="group/name inline-flex items-center gap-2 w-1/2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      {isEditing ? (
                        <FormControl>
                          <Input
                            {...field}
                            autoFocus
                            className="w-full"
                            disabled={isSaving}
                            onBlur={() => setIsEditing(false)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setIsEditing(false);
                              } else if (e.key === 'Escape') {
                                form.setValue('name', route.name);
                                setIsEditing(false);
                              }
                            }}
                          />
                        </FormControl>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{field.value || 'Unnamed Route'}</span>
                          {!isSaving && (
                            <Button
                              variant="noShadow"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover/name:opacity-100 transition-opacity"
                              onClick={() => setIsEditing(true)}
                              type="button"
                            >
                              <Pen className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex gap-2">
                {(isNew || isDirty) && (
                  <Button
                    variant="cancel"
                    onClick={handleCancel}
                    className="flex items-center gap-2"
                    disabled={isSaving}
                    type="button"
                  >
                    <span>Cancel</span>
                  </Button>
                )}
                
                <Button
                  variant="blue"
                  type="submit"
                  className="flex items-center gap-2"
                  disabled={!isDirty || !isValid || isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </Button>
                {onRemove && (
                  <Button
                    variant="error"
                    size="icon"
                    onClick={onRemove}
                    disabled={isSaving}
                    className="transition-opacity"
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
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
                        if (open) onGenreDropdownOpen();
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
                        field.onChange(parseInt(value));
                        form.setValue('rootFolder', '', { shouldDirty: true });
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select instance" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {instances.map((instance) => (
                          <SelectItem key={instance.id} value={instance.id.toString()}>
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
  );
};

export default GenreRouteCard;