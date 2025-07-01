import DocFeature from './DocFeature'
import WorkflowCard from './WorkflowCard'
import RetroTerminal from './RetroTerminal'

/**
 * Example usage of the DocFeature component
 */
export default function DocFeatureExample() {
  return (
    <div className="flex flex-col gap-12">
      {/* Overview section with workflow demo side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12 lg:gap-6 items-start lg:items-stretch">
        <DocFeature title="Overview">
          <div className="feature-content">
            <h3 className="text-foreground">What is Pulsarr?</h3>
            <p className="text-foreground">
              Pulsarr monitors user Plex watchlists in real-time*, intelligently
              routing content to multiple Sonarr/Radarr instances through a
              predicate-based routing system—all without requiring additional
              user logins beyond the admin's Plex token.
            </p>

            <p className="text-foreground">
              Features include conditional content routing based on
              genre/user/language/year/certification, approval workflows with
              configurable user quotas, comprehensive multi-instance support
              with intelligent synchronization, granular user permissions with
              tag tracking, personalized notifications via built-in Discord bot
              or 80+ Apprise notification agents, automatic Plex library
              updates, and smart content lifecycle management with automatic
              deletion options when content leaves watchlists.
            </p>

            <p className="text-foreground text-xs opacity-70 mt-2">
              * Non-Plex Pass users supported with 20-minute polling intervals;
              all other features remain identical.
            </p>
          </div>
        </DocFeature>

        <WorkflowCard />
      </div>

      {/* Features and RetroTerminal side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_4fr] gap-12 lg:gap-6 items-start lg:items-stretch">
        {/* RetroTerminal on the left */}
        <RetroTerminal />

        {/* Features card on the right with 2x2 grid */}
        <DocFeature title="Features" titleClassName="feature-heading-blue">
          <div className="feature-content">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="feature-item">
                <h3 className="text-foreground">Real-time Monitoring</h3>
                <p className="text-foreground">
                  Automatically detects when users add content to their Plex
                  watchlist
                </p>
              </div>

              <div className="feature-item">
                <h3 className="text-foreground">Smart Content Routing</h3>
                <p className="text-foreground">
                  Intelligently routes content based on genre, user, language,
                  and more
                </p>
              </div>

              <div className="feature-item">
                <h3 className="text-foreground">Multi-Instance Support</h3>
                <p className="text-foreground">
                  Distribute content across multiple Sonarr/Radarr instances
                  with intelligent synchronization
                </p>
              </div>

              <div className="feature-item">
                <h3 className="text-foreground">Approval & Quota System</h3>
                <p className="text-foreground">
                  Administrative approval workflows with configurable user
                  quotas and Discord bot integration
                </p>
              </div>

              <div className="feature-item">
                <h3 className="text-foreground">Notification System</h3>
                <p className="text-foreground">
                  Sends personalized notifications via Discord and Apprise
                </p>
              </div>
            </div>
          </div>
        </DocFeature>
      </div>

      <div className="flex justify-center">
        <DocFeature
          title="Benefits"
          titleClassName="feature-heading-fun"
          className="max-w-3xl"
        >
          <div className="feature-content">
            <ul className="list-disc pl-6 space-y-2 text-foreground">
              <li>
                <strong className="text-foreground">
                  Simplified Discovery
                </strong>{' '}
                - Users can request content directly from Plex
              </li>
              <li>
                <strong className="text-foreground">
                  Centralized Management
                </strong>{' '}
                - All content requests in one place
              </li>
              <li>
                <strong className="text-foreground">Automated Workflow</strong>{' '}
                - No manual intervention needed
              </li>
              <li>
                <strong className="text-foreground">
                  Intelligent Decision-Making
                </strong>{' '}
                - Route content based on complex conditions
              </li>
              <li>
                <strong className="text-foreground">
                  Comprehensive Analytics
                </strong>{' '}
                - Track usage and content distribution
              </li>
            </ul>
          </div>
        </DocFeature>
      </div>
    </div>
  )
}
