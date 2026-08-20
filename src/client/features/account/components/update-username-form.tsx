import { Loader2, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useUpdateUsernameForm } from '@/features/account/hooks/useUpdateUsernameForm'

interface UpdateUsernameFormProps {
  currentUsername: string
}

export function UpdateUsernameForm({
  currentUsername,
}: UpdateUsernameFormProps) {
  const { form, status, canSubmit, onSubmit } = useUpdateUsernameForm({
    currentUsername,
  })

  const isSubmitting = status === 'loading'

  const handleCancel = () => {
    form.reset({ newUsername: currentUsername, currentPassword: '' })
  }

  return (
    <Form {...form}>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FormField
          control={form.control}
          name="newUsername"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground">Username</FormLabel>
              <FormControl>
                <Input {...field} type="text" autoComplete="username" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground">
                Current password
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="current-password"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          {form.formState.isDirty && !isSubmitting && (
            <Button
              type="button"
              variant="cancel"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="flex items-center gap-1"
            >
              <X className="h-4 w-4" />
              <span>Cancel</span>
            </Button>
          )}

          <Button
            type="submit"
            disabled={status !== 'idle' || !canSubmit}
            className="flex items-center gap-2"
            variant="bluenoShadow"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
          </Button>
        </div>
      </form>
    </Form>
  )
}
