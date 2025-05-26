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
            <h3 className="text-text">What is Pulsarr?</h3>
            <p className="text-text">
              Pulsarr monitors user Plex watchlists in real-time*, intelligently
              routing content to multiple Sonarr/Radarr instances through a
              predicate-based routing system—all without requiring additional
              user logins beyond the admin's Plex token.
            </p>

            <p className="text-text">
              Features include conditional content routing based on
              genre/user/language/year/certification, granular user permissions
              with tag tracking, personalized notifications via built-in Discord
              bot or 80+ Apprise notification agents, automatic Plex library
              updates, and smart content lifecycle management with automatic
              deletion options when content leaves watchlists.
            </p>

            <p className="text-text text-xs opacity-70 mt-2">
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
                <h3 className="text-text">Real-time Monitoring</h3>
                <p className="text-text">
                  Automatically detects when users add content to their Plex
                  watchlist
                </p>
              </div>

              <div className="feature-item">
                <h3 className="text-text">Smart Content Routing</h3>
                <p className="text-text">
                  Intelligently routes content based on genre, user, language,
                  and more
                </p>
              </div>

              <div className="feature-item">
                <h3 className="text-text">Multi-User Support</h3>
                <p className="text-text">
                  Monitors watchlists for you and your friends with customizable
                  permissions
                </p>
              </div>

              <div className="feature-item">
                <h3 className="text-text">Notification System</h3>
                <p className="text-text">
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
            <ul className="list-disc pl-6 space-y-2 text-text">
              <li>
                <strong className="text-text">Simplified Discovery</strong> -
                Users can request content directly from Plex
              </li>
              <li>
                <strong className="text-text">Centralized Management</strong> -
                All content requests in one place
              </li>
              <li>
                <strong className="text-text">Automated Workflow</strong> - No
                manual intervention needed
              </li>
              <li>
                <strong className="text-text">
                  Intelligent Decision-Making
                </strong>{' '}
                - Route content based on complex conditions
              </li>
              <li>
                <strong className="text-text">Comprehensive Analytics</strong> -
                Track usage and content distribution
              </li>
            </ul>
          </div>
        </DocFeature>
      </div>
    </div>
  )
}
