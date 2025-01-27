import {
  Credenza,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaDescription,
  CredenzaBody,
  CredenzaFooter,
  CredenzaClose,
} from '@/components/ui/credenza';
import { Button } from '@/components/ui/button';

interface LogoutAlertProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

export function LogoutAlert({ open, onOpenChange, onContinue }: LogoutAlertProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>Are you sure you want to log out?</CredenzaTitle>
          <CredenzaDescription>
            You will be redirected to the login screen. Your current session will be lost.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <CredenzaFooter>
            <CredenzaClose asChild>
              <Button variant='neutral'>Cancel</Button>
            </CredenzaClose>
            <Button onClick={onContinue}>Confirm</Button>
          </CredenzaFooter>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}