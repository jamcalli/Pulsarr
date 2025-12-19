import type { WebhookEndpoint } from '@root/schemas/webhooks/webhook-endpoints.schema'
import { WEBHOOK_EVENT_TYPES } from '@root/types/webhook-endpoint.types'
import { Check, Eye, EyeOff, Loader2 } from 'lucide-react'
import React, { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MultiSelect } from '@/components/ui/multi-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { WebhookEndpointFormValues } from '@/features/notifications/hooks/useWebhookEndpoints'
import { useMediaQuery } from '@/hooks/use-media-query'

// Options for the event type multi-select
const EVENT_TYPE_OPTIONS = WEBHOOK_EVENT_TYPES.map((eventType) => {
  const labels: Record<typeof eventType, string> = {
    'media.available': 'Media Available',
    'watchlist.added': 'Watchlist Added',
    'watchlist.removed': 'Watchlist Removed',
    'approval.created': 'Approval Created',
    'approval.resolved': 'Approval Resolved',
    'approval.auto': 'Auto Approved',
    'delete_sync.completed': 'Delete Sync Complete',
    'user.created': 'User Created',
  }
  return {
    label: labels[eventType],
    value: eventType,
  }
})

type SaveStatus = 'idle' | 'loading' | 'success'

interface FormContentProps {
  form: UseFormReturn<WebhookEndpointFormValues>
  handleSubmit: (data: WebhookEndpointFormValues) => Promise<void>
  handleOpenChange: (open: boolean) => void
  connectionTested: boolean
  onTest: () => Promise<unknown>
  isTesting: boolean
  saveStatus: SaveStatus
  isEditing: boolean
}

const FormContent = React.memo(
  ({
    form,
    handleSubmit,
    handleOpenChange,
    connectionTested,
    onTest,
    isTesting,
    saveStatus,
    isEditing,
  }: FormContentProps) => {
    const [showAuthValue, setShowAuthValue] = useState(false)
    const [showAuthFields, setShowAuthFields] = useState(
      !!form.getValues('authHeaderName'),
    )

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="space-y-4">
            {/* Name field */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Home Assistant, n8n"
                      disabled={saveStatus !== 'idle'}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* URL field with test button */}
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => {
                const hasUrl = !!form.watch('url')
                const needsTest = hasUrl && !connectionTested
                return (
                  <FormItem>
                    <FormLabel className="text-foreground">
                      Webhook URL
                    </FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input
                          placeholder="https://..."
                          disabled={saveStatus !== 'idle' || isTesting}
                          {...field}
                        />
                        <TooltipProvider>
                          <Tooltip {...(needsTest ? { open: true } : {})}>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                onClick={() => {
                                  void onTest()
                                }}
                                disabled={
                                  isTesting || !hasUrl || saveStatus !== 'idle'
                                }
                                size="icon"
                                variant="noShadow"
                                className="shrink-0"
                              >
                                {isTesting ? (
                                  <Loader2 className="animate-spin" />
                                ) : connectionTested ? (
                                  <Check className="text-black" />
                                ) : (
                                  <Check />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent
                              className={needsTest ? 'bg-error text-black' : ''}
                            >
                              <p>
                                {needsTest
                                  ? 'Test connection required'
                                  : 'Test connection'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )
              }}
            />

            {/* Auth header toggle + fields */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-auth"
                  checked={showAuthFields}
                  onCheckedChange={(checked) => {
                    setShowAuthFields(!!checked)
                    if (!checked) {
                      form.setValue('authHeaderName', '')
                      form.setValue('authHeaderValue', '')
                    }
                  }}
                  disabled={saveStatus !== 'idle'}
                />
                <label
                  htmlFor="show-auth"
                  className="text-sm font-medium text-foreground cursor-pointer"
                >
                  Include Authentication Header
                </label>
              </div>

              {showAuthFields && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="authHeaderName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground text-xs">
                          Header Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Authorization"
                            disabled={saveStatus !== 'idle'}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="authHeaderValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground text-xs">
                          Header Value
                        </FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input
                              type={showAuthValue ? 'text' : 'password'}
                              placeholder="Bearer token..."
                              disabled={saveStatus !== 'idle'}
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="noShadow"
                              size="icon"
                              onClick={() => setShowAuthValue(!showAuthValue)}
                              disabled={saveStatus !== 'idle'}
                            >
                              {showAuthValue ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            {/* Event types */}
            <FormField
              control={form.control}
              name="eventTypes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Events</FormLabel>
                  <FormControl>
                    <MultiSelect
                      options={EVENT_TYPE_OPTIONS}
                      value={field.value}
                      onValueChange={(values) => {
                        field.onChange(values)
                        // Trigger validation since MultiSelect doesn't fire onBlur
                        void form.trigger('eventTypes')
                      }}
                      placeholder="Select events..."
                      maxCount={1}
                      disabled={saveStatus !== 'idle'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Enabled toggle */}
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={saveStatus !== 'idle'}
                    />
                  </FormControl>
                  <FormLabel className="text-foreground">Enabled</FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="neutral"
              onClick={() => handleOpenChange(false)}
              disabled={saveStatus !== 'idle'}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={
                saveStatus !== 'idle' ||
                !connectionTested ||
                !form.formState.isValid ||
                (isEditing && !form.formState.isDirty)
              }
              className="min-w-[100px] flex items-center justify-center gap-2"
            >
              {saveStatus === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : saveStatus === 'success' ? (
                <>
                  <Check className="h-4 w-4" />
                  Saved
                </>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Create'
              )}
            </Button>
          </div>
        </form>
      </Form>
    )
  },
)

interface WebhookEndpointModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: UseFormReturn<WebhookEndpointFormValues>
  editingEndpoint: WebhookEndpoint | null
  connectionTested: boolean
  onTest: () => Promise<unknown>
  onSubmit: (data: WebhookEndpointFormValues) => Promise<void>
  isTesting: boolean
  saveStatus: SaveStatus
}

/**
 * Displays a responsive modal for creating or editing webhook endpoints.
 * Uses Dialog on desktop and Sheet on mobile.
 */
export function WebhookEndpointModal({
  open,
  onOpenChange,
  form,
  editingEndpoint,
  connectionTested,
  onTest,
  onSubmit,
  isTesting,
  saveStatus,
}: WebhookEndpointModalProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const isEditing = !!editingEndpoint

  const handleOpenChange = (newOpen: boolean) => {
    if (saveStatus !== 'idle') return
    onOpenChange(newOpen)
  }

  const title = isEditing ? 'Edit Webhook Endpoint' : 'Add Webhook Endpoint'
  const description = isEditing
    ? 'Update webhook endpoint configuration'
    : 'Configure a new webhook endpoint to receive Pulsarr events'

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          onPointerDownOutside={(e) => {
            if (saveStatus !== 'idle') e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (saveStatus !== 'idle') e.preventDefault()
          }}
          className="overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="text-foreground">{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <FormContent
              form={form}
              handleSubmit={onSubmit}
              handleOpenChange={handleOpenChange}
              connectionTested={connectionTested}
              onTest={onTest}
              isTesting={isTesting}
              saveStatus={saveStatus}
              isEditing={isEditing}
            />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          if (saveStatus !== 'idle') e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (saveStatus !== 'idle') e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <FormContent
          form={form}
          handleSubmit={onSubmit}
          handleOpenChange={handleOpenChange}
          connectionTested={connectionTested}
          onTest={onTest}
          isTesting={isTesting}
          saveStatus={saveStatus}
          isEditing={isEditing}
        />
      </DialogContent>
    </Dialog>
  )
}
