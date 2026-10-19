import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/credenza'
import { PinLinkPanel } from '@/components/plex/pin-link-panel'
import { Button } from '@/components/ui/button'

interface PinCredenzaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLinked: () => void
}

export function PinCredenza({
  open,
  onOpenChange,
  onLinked,
}: PinCredenzaProps) {
  return (
    <PinLinkPanel active={open} onLinked={onLinked}>
      {({ body, approved }) => (
        <Credenza
          open={open}
          onOpenChange={(next) => {
            if (!approved) onOpenChange(next)
          }}
        >
          <CredenzaContent className="md:max-w-xl">
            <CredenzaHeader>
              <CredenzaTitle>Sign in with Plex</CredenzaTitle>
              <CredenzaDescription>
                Approve Pulsarr on Plex to link your account.
              </CredenzaDescription>
            </CredenzaHeader>
            <CredenzaBody className="flex flex-col items-start gap-3">
              {body}
            </CredenzaBody>
            {!approved && (
              <CredenzaFooter>
                <CredenzaClose
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className="sm:self-end"
                    />
                  }
                >
                  Cancel
                </CredenzaClose>
              </CredenzaFooter>
            )}
          </CredenzaContent>
        </Credenza>
      )}
    </PinLinkPanel>
  )
}
