import { HelpCircle } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface DefaultRoutingBehaviorSectionProps {
  /** Name of the target type's default instance, e.g. "Radarr" or "Sonarr". */
  contentTypeLabel: string
  /** Name of the current default instance, if one exists. */
  defaultInstanceName?: string
  /** Current value of skipDefaultRoutingWhenNoMatch on that default instance. */
  skipDefaultRoutingWhenNoMatch: boolean
}

/**
 * Read-only display of the default instance's "skip content with no matching
 * route" setting. The default instance is the source of truth for this value
 * (set on the instance's settings card) - this card is purely informational,
 * so unmatched content's fate is visible without leaving the routes page.
 */
export default function DefaultRoutingBehaviorSection({
  contentTypeLabel,
  defaultInstanceName,
  skipDefaultRoutingWhenNoMatch,
}: DefaultRoutingBehaviorSectionProps) {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Default Routing Behavior</CardTitle>
        <CardDescription>
          What happens to content that matches none of the routes below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2">
          <Switch checked={skipDefaultRoutingWhenNoMatch} disabled />
          <div className="flex items-center">
            <span className="text-sm text-foreground">
              Skip content that matches no route
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 ml-2 text-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent>
                <div className="max-w-xs space-y-2">
                  <p>
                    When <strong>off</strong>, content that matches none of your
                    content router rules is sent to your default{' '}
                    {contentTypeLabel} instance.
                  </p>
                  <p>
                    When <strong>on</strong>, unmatched content is skipped
                    entirely instead — this also applies during sync operations.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This is set on{' '}
                    {defaultInstanceName ? (
                      <>
                        the default {contentTypeLabel} instance ("
                        {defaultInstanceName}")
                      </>
                    ) : (
                      <>the default {contentTypeLabel} instance</>
                    )}{' '}
                    settings page, not here.
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
