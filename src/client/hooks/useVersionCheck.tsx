import { useEffect } from 'react'
import { toast } from 'sonner'
import semver from 'semver'

interface GitHubRelease {
  tag_name: string
  html_url: string
}

export const useVersionCheck = (repoOwner: string, repoName: string) => {

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`);
        
        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const data: GitHubRelease = await response.json();
        
        // Clean version strings for semver comparison
        const currentVersion = __APP_VERSION__.replace(/^v/, '');
        const latestVersion = data.tag_name.replace(/^v/, '');
        
        if (semver.gt(latestVersion, currentVersion)) {
          toast(
            `A new version (${data.tag_name}) is available. You're running v${__APP_VERSION__}.`,
            {
              id: 'version-update-notification',
              duration: 8000,
              action: {
                label: 'View Release',
                onClick: () => window.open(data.html_url, '_blank', 'noopener,noreferrer')
              }
            }
          );
        }
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error checking for updates: ${err.message}`);
        } else {
          console.error("Unknown error checking for updates:", err);
        }
      }
    };

    const timeoutId = setTimeout(() => {
      checkForUpdates();
    }, 3000);
    
    return () => clearTimeout(timeoutId);
  }, [repoOwner, repoName]);
};