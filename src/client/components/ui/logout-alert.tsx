import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
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
}

export function LogoutAlert({ open, onOpenChange }: LogoutAlertProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      const response = await fetch('/v1/users/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      
      if (response.ok) {
        toast({
          description: 'Successfully logged out',
          variant: 'default',
        });
        navigate('/app/login');
      } else {
        toast({
          description: 'Failed to log out. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
      toast({
        description: 'An unexpected error occurred while logging out.',
        variant: 'destructive',
      });
    }
  };

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
            <Button onClick={handleLogout}>Confirm</Button>
          </CredenzaFooter>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}