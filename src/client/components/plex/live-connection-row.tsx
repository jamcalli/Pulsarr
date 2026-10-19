import { StatusPill } from '@/components/status-pill'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item'
import { usePlexLiveStatus } from '@/hooks/usePlexLiveStatus'
import { LIVE_STATE_PILLS, type LiveState } from '@/lib/plex-live-status'

export function LiveConnectionRow({
  describe,
}: {
  describe: (state: LiveState) => string
}) {
  const state = usePlexLiveStatus() ?? 'connecting'
  const pill = LIVE_STATE_PILLS[state]

  return (
    <Item className="p-0">
      <ItemContent>
        <ItemTitle>Plex live connection</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {describe(state)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <StatusPill tone={pill.tone} label={pill.label} live />
      </ItemActions>
    </Item>
  )
}
