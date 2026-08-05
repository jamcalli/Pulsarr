import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Credenza,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza';
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'

interface LogoutAlertProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Displays a modal dialog for logout confirmation and manages the logout process.
 *
 * When the user confirms, attempts to log out via an API call. On success, shows a success toast and redirects to the login page; on failure, closes the dialog and displays an error toast.
 *
 * @param open - Controls whether the logout confirmation dialog is visible.
 * @param onOpenChange - Callback to update the dialog's open state.
 */
export function LogoutAlert({ open, onOpenChange }: LogoutAlertProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const { data, error } = await apiFetch.POST('/v1/users/logout', {
        body: {},
      });

      if (!error && data.success) {
        toast.success(data.message || 'Successfully logged out');
        navigate('/login');
      } else {
        // Close the logout dialog
        onOpenChange(false);

        // Show the error message from the server
        toast.error(
          apiErrorMessage(error) || 'Failed to log out. Please try again.',
        );
      }
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('An unexpected error occurred while logging out.');
    }
  };

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
        <CredenzaTitle className="text-foreground">Are you sure you want to log out?</CredenzaTitle>
          <CredenzaDescription>
            You will be redirected to the login screen. Your current session will be lost.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant='neutral'>Cancel</Button>
          </CredenzaClose>
          <Button onClick={handleLogout}>Confirm</Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}