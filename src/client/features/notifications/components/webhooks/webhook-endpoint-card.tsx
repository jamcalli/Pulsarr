import type { WebhookEndpoint } from '@root/schemas/webhooks/webhook-endpoints.schema'
import { Check, Eye, EyeOff, Loader2, Pencil, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { EVENT_TYPE_LABELS } from '@/features/notifications/constants/webhook-events'
import { cn } from '@/lib/utils'

interface WebhookEndpointCardProps {
  endpoint: WebhookEndpoint
  onEdit: () => void
  onDelete: () => void
  onTest: () => void
  isDeleting?: boolean
  isTesting?: boolean
  connectionTested?: boolean
}

export function WebhookEndpointCard({
  endpoint,
  onEdit,
  onDelete,
  onTest,
  isDeleting = false,
  isTesting = false,
  connectionTested = false,
}: WebhookEndpointCardProps) {
  const [showAuthValue, setShowAuthValue] = useState(false)

  const maskValue = (length = 20) => '•'.repeat(length)

  return (
    <div className="p-4 border-2 border-border rounded-md bg-card">
      {/* Header with name and status */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-foreground">{endpoint.name}</h4>
          <Badge
            variant="neutral"
            className={cn(
              'px-2 py-0.5 h-7 text-sm',
              endpoint.enabled
                ? 'bg-green-500 hover:bg-green-500 text-black'
                : 'bg-red-500 hover:bg-red-500 text-black',
            )}
          >
            {endpoint.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="noShadow" size="icon" onClick={onEdit}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit endpoint</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="error"
                  size="icon"
                  onClick={onDelete}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete endpoint</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* URL display with test button */}
      <div className="mb-3">
        <span className="text-xs text-foreground mb-1 block">URL</span>
        <div className="flex gap-2">
          <Input
            type="text"
            value={endpoint.url}
            readOnly
            className="font-mono text-sm cursor-default"
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  onClick={onTest}
                  disabled={isTesting}
                  size="icon"
                  variant="noShadow"
                  className="shrink-0"
                >
                  {isTesting ? (
                    <Loader2 className="animate-spin" />
                  ) : connectionTested ? (
                    <Check className="text-black" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Send test webhook</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Auth header (if configured) */}
      {endpoint.authHeaderName && (
        <div className="mb-3">
          <span className="text-xs text-foreground mb-1 block">
            Auth Header: {endpoint.authHeaderName}
          </span>
          <div className="flex items-center gap-2">
            <Input
              type={showAuthValue ? 'text' : 'password'}
              value={
                showAuthValue
                  ? (endpoint.authHeaderValue ?? '')
                  : maskValue(endpoint.authHeaderValue?.length ?? 20)
              }
              readOnly
              className="font-mono text-sm cursor-default"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="noShadow"
                    size="icon"
                    onClick={() => setShowAuthValue(!showAuthValue)}
                  >
                    {showAuthValue ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {showAuthValue ? 'Hide value' : 'Show value'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      {/* Event types */}
      <div>
        <span className="text-xs text-foreground mb-1 block">Events</span>
        <div className="flex flex-wrap gap-1">
          {endpoint.eventTypes.map((event) => (
            <Badge key={event} variant="neutral" className="text-xs">
              {EVENT_TYPE_LABELS[event] || event}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  )
}
