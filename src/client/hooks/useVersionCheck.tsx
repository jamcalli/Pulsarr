import { useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

declare const __APP_VERSION__: string

interface GitHubRelease {
  tag_name: string
  html_url: string
}

export const useVersionCheck = (repoOwner: string, repoName: string) => {
  const { toast } = useToast()

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`);
        
        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const data: GitHubRelease = await response.json();
        
        // Remove 'v' prefix if present for comparison
        // Use proper semantic versioning comparison
        const currentVersion = __APP_VERSION__.replace(/^v/, '');
        const latestVersion = data.tag_name.replace(/^v/, '');
        
        // Simple semver comparison function
        const isNewerVersion = (current: string, latest: string): boolean => {
          const currentParts = current.split('.').map(Number);
          const latestParts = latest.split('.').map(Number);
          
          for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
            const currentPart = currentParts[i] || 0;
            const latestPart = latestParts[i] || 0;
            
            if (latestPart > currentPart) return true;
            if (latestPart < currentPart) return false;
          }
          
          return false; // Versions are equal
        };
        
        if (isNewerVersion(currentVersion, latestVersion)) {
        if (latestVersion !== currentVersion) {
          const handleClick = () => {
            window.open(data.html_url, '_blank', 'noopener,noreferrer');
          };
          
          toast({
            description: (
              <div>
                A new version ({data.tag_name}) is available. You're running v{__APP_VERSION__}.{' '}
                <span 
                  className="text-blue-500 underline cursor-pointer" 
                  onClick={handleClick}
                >
                  Click here
                </span>{' '}
                for more information.
              </div>
            ),
            variant: 'default',
            duration: 8000,
          });
          
        }
      } catch (err) {
        console.error("Error checking for updates:", err);
      }
    };

    const timeoutId = setTimeout(() => {
      checkForUpdates();
    }, 3000);
    
    return () => clearTimeout(timeoutId);
  }, [toast, repoOwner, repoName]);
};