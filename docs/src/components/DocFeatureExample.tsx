import React from 'react'
import DocFeature from './DocFeature'

/**
 * Example usage of the DocFeature component
 */
export default function DocFeatureExample() {
  return (
    <div className="flex flex-col gap-10">
      <DocFeature title="Overview">
        <div className="feature-content">
          <h3 className="text-text">What is Pulsarr?</h3>
          <p className="text-text">
            Pulsarr is an integration tool that bridges Plex watchlists with
            Sonarr and Radarr, enabling real-time media monitoring and automated
            content acquisition directly from the Plex app.
          </p>

          <p className="text-text">
            With Pulsarr, users can add content to their Plex watchlist, and the
            system automatically routes it to the appropriate Sonarr or Radarr
            instance based on configurable rules and conditions.
          </p>
        </div>
      </DocFeature>

      <DocFeature title="Features" titleClassName="feature-heading-blue">
        <div className="feature-content">
          <div className="feature-grid">
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
                Intelligently routes content based on genre, user, language, and
                more
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

      <DocFeature title="Workflow" titleClassName="feature-heading-orange">
        <div className="feature-content">
          <h3 className="text-text">How Pulsarr Works</h3>
          <ol className="list-decimal pl-6 space-y-2 text-text">
            <li>Users add content to their Plex watchlist</li>
            <li>Pulsarr detects new content in real-time</li>
            <li>
              Content is analyzed and routed to the appropriate Sonarr/Radarr
              instance
            </li>
            <li>Sonarr/Radarr download the content</li>
            <li>Users receive notifications when content is available</li>
            <li>
              Content can be automatically removed when no longer in any
              watchlist
            </li>
          </ol>
        </div>
      </DocFeature>

      <DocFeature title="Benefits" titleClassName="feature-heading-fun">
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
              <strong className="text-text">Intelligent Decision-Making</strong>{' '}
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
  )
}
