import { Eye, EyeOff, Trash2, Key } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CopyButton } from '@/components/CopyButton'
import { Separator } from '@/components/ui/separator'
import type { UseFormReturn } from 'react-hook-form'
import type { CreateApiKey } from '@root/schemas/api-keys/api-keys.schema'
import type { ApiKey } from '@root/types/api-key.types'

interface ApiKeysFormProps {
  form: UseFormReturn<CreateApiKey>
  apiKeys: ApiKey[]
  isCreating: boolean
  isRevoking: Record<number, boolean>
  visibleKeys: Record<number, boolean>
  onSubmit: () => void
  onToggleVisibility: (id: number) => void
  onInitiateRevoke: (id: number) => void
}

/**
 * Displays a form for creating new API keys and lists existing keys with controls to show, copy, or revoke each key.
 *
 * Users can enter a name to generate a new API key, view and manage their existing keys, toggle key visibility, copy keys to the clipboard, and revoke keys. The component manages loading and disabled states for key creation and revocation actions.
 */
export function ApiKeysForm({
  form,
  apiKeys,
  isCreating,
  isRevoking,
  visibleKeys,
  onSubmit,
  onToggleVisibility,
  onInitiateRevoke,
}: ApiKeysFormProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const maskKey = (keyLength = 32) => {
    return '•'.repeat(keyLength)
  }

  return (
    <div className="space-y-6">
      {/* Create API Key Form */}
      <div>
        <h3 className="font-medium text-sm text-foreground mb-2">
          Create New API Key
        </h3>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">
                    API Key Name
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., Mobile App, Integration Service"
                      disabled={isCreating}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={isCreating || !form.watch('name')?.trim()}
              className="flex items-center gap-2"
              variant="blue"
            >
              <Key className="h-4 w-4" />
              {isCreating ? 'Generating...' : 'Generate API Key'}
            </Button>
          </form>
        </Form>
      </div>

      {/* Separator */}
      {apiKeys.length > 0 && <Separator />}

      {/* Existing API Keys */}
      {apiKeys.length > 0 && (
        <div>
          <h3 className="font-medium text-sm text-foreground mb-2">
            Existing API Keys ({apiKeys.length})
          </h3>
          <div className="space-y-3">
            {apiKeys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="p-4 border-2 border-border rounded-md bg-card"
              >
                {/* Header with name and date */}
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-foreground">{apiKey.name}</h4>
                  <span className="text-xs text-foreground">
                    Created {formatDate(apiKey.created_at)}
                  </span>
                </div>

                {/* API Key display with actions */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Input
                      type={visibleKeys[apiKey.id] ? 'text' : 'password'}
                      value={
                        visibleKeys[apiKey.id]
                          ? apiKey.key
                          : maskKey(apiKey.key.length)
                      }
                      readOnly
                      className="pr-20 font-mono text-sm"
                    />
                  </div>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="noShadow"
                          size="icon"
                          onClick={() => onToggleVisibility(apiKey.id)}
                        >
                          {visibleKeys[apiKey.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {visibleKeys[apiKey.id] ? 'Hide key' : 'Show key'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <CopyButton
                    text={apiKey.key}
                    variant="noShadow"
                    size="icon"
                    iconOnly
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end items-center">
                  <Button
                    variant="error"
                    size="sm"
                    onClick={() => onInitiateRevoke(apiKey.id)}
                    disabled={isRevoking[apiKey.id]}
                    className="flex items-center gap-1"
                  >
                    <Trash2 className="h-4 w-4" />
                    {isRevoking[apiKey.id] ? 'Revoking...' : 'Revoke'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {apiKeys.length === 0 && (
        <div className="text-center py-8 text-foreground">
          <Key className="h-8 w-8 mx-auto mb-2 opacity-50 text-foreground" />
          <p>No API keys created yet</p>
          <p className="text-sm">
            Create your first API key above to get started
          </p>
        </div>
      )}
    </div>
  )
}
