import type { WebhookEndpoint } from '@root/schemas/webhooks/webhook-endpoints.schema'
import { Check, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'
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
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { EVENT_TYPE_OPTIONS } from '@/features/notifications/constants/webhook-events'
import type { WebhookEndpointFormValues } from '@/features/notifications/hooks/useWebhookEndpoints'

type SaveStatus = 'idle' | 'loading' | 'success'

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
 * Uses Credenza for automatic Dialog/Drawer switching based on screen size.
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
  const [showAuthValue, setShowAuthValue] = useState(false)
  const [showAuthFields, setShowAuthFields] = useState(
    !!editingEndpoint?.authHeaderName,
  )
  const isEditing = !!editingEndpoint

  const handleOpenChange = (newOpen: boolean) => {
    if (saveStatus !== 'idle') return
    onOpenChange(newOpen)
  }

  const title = isEditing ? 'Edit Webhook Endpoint' : 'Add Webhook Endpoint'
  const description = isEditing
    ? 'Update webhook endpoint configuration'
    : 'Configure a new webhook endpoint to receive Pulsarr events'

  return (
    <Credenza open={open} onOpenChange={handleOpenChange}>
      <CredenzaContent className="sm:max-w-md">
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">{title}</CredenzaTitle>
          <CredenzaDescription>{description}</CredenzaDescription>
        </CredenzaHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <CredenzaBody className="space-y-4">
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
            </CredenzaBody>

            {/* Actions */}
            <CredenzaFooter className="flex justify-end gap-2">
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
            </CredenzaFooter>
          </form>
        </Form>
      </CredenzaContent>
    </Credenza>
  )
}
