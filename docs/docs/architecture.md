---
sidebar_position: 6
---

# Architecture

Pulsarr uses a full-stack architecture designed for reliability and performance:

## Backend

- **Fastify**: High-performance API server with plugin system
- **SQLite**: Lightweight database for storing user, watchlist, and configuration data
- **TypeScript**: Type-safe code for better reliability and maintainability

## Frontend

- **React**: Component-based UI for responsive user experience
- **Tailwind CSS**: Utility-first styling for consistent design
- **Vite**: Modern build tool for fast development and optimized production

## Integration Points

- **Plex API**: Monitors watchlist changes through RSS feeds, token syncs, and graphql calls
- **Sonarr/Radarr APIs**: Manages content acquisition across multiple instances
- **Discord API**: Delivers notifications through custom bot and webhooks

## How It Works

### Content Routing

Pulsarr uses an intelligent workflow to process and route content:

1. **Content Detection**:
   - Plex Pass: Real-time monitoring via RSS feeds
   - Non-Plex Pass: Regular polling every 20 minutes
2. **User Permissions**: Verifies if the user has sync permissions enabled
3. **Content Analysis**:
   - Evaluates content metadata (genres, language, etc.)
   - Applies configured routing rules
   - Determines optimal target instance
4. **Instance Management**: Routes content to appropriate instances based on rules
5. **Notification System**: Sends configurable notifications when content is available

### Notification Flow

The notification system is designed to be informative:

1. **Webhook Reception**: Receives webhooks from Sonarr/Radarr when content is imported
2. **Smart Queuing**: Groups multiple episodes from the same season to prevent notification spam (when importing non-season packs)
3. **Batch Processing**: Intelligently batches season packs into single notifications
4. **User Targeting**: Identifies users who have the show in their watchlist and have enabled notifications
5. **Multi-channel Delivery**: Sends personalized notifications via Discord DMs, Apprise, and can send global grabs via webhooks and Apprise system notification endpoints
6. **Customizable Preferences**: Each user can configure their notification preferences via Discord, or the admin can via the UI