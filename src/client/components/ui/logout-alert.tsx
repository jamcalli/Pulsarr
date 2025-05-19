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

/**
 * Renders a modal dialog prompting the user to confirm logout and manages the logout process with user notifications.
 *
 * When confirmed, attempts to log out via an API call. On success, displays a success toast and navigates to the login page; on failure, closes the dialog and shows an error toast.
 *
 * @param open - Whether the logout confirmation dialog is visible.
 * @param onOpenChange - Callback to update the dialog's open state.
 */
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
      
      const data = response.ok 
        ? await response.json()
        : await response.json().catch(() => ({ success: false, message: response.statusText }));
      
      if (response.ok && data.success) {
        toast({
          description: data.message || 'Successfully logged out',
          variant: 'default',
        });
        navigate('/login');
      } else {
        // Close the logout dialog
        onOpenChange(false);
        
        // Show the error message from the server
        toast({
          title: "Logout unavailable",
          description: data.message || 'Failed to log out. Please try again.',
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
        <CredenzaTitle className="text-text">Are you sure you want to log out?</CredenzaTitle>
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