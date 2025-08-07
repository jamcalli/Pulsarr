---
sidebar_position: 1
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Introduction to Pulsarr

<div align="center">
  <img src={useBaseUrl('/img/pulsarr.svg')} alt="Pulsarr Logo" width="150"/>
  <p>Real-time Plex watchlist monitoring, routing, and notification center</p>
</div>

<br/>

Pulsarr is an integration tool that bridges Plex watchlists with Sonarr and Radarr, enabling real-time media monitoring and automated content acquisition all from within the Plex App itself.

Enjoy all the benefits of other content discovery systems without requiring users to use additional services. All the magic happens from the primary user's Plex Token.

## Key Features

- **Real-time & Interval-based Watchlist Monitoring**:
  - Real-time monitoring through RSS feeds for Plex Pass users
  - 20-minute interval polling for non-Plex Pass users
  - All other features remain identical regardless of Plex Pass status

- **Advanced Content Routing**:
  - Intelligent routing system with support for complex conditions and multiple instances
  - Route content based on genre, user, language, year, and certification

- **Approval & Quota Management**:
  - Administrative approval workflows for content requests
  - Configurable user quotas (daily, weekly rolling, monthly limits)
  - Complete Discord bot integration for approval management
  - Automatic expiration and bulk processing capabilities

- **Comprehensive Notification System**:
  - Discord integration with user-friendly notification system
  - Apprise integration supporting 80+ notification methods
  - Smart notification batching for season packs and individual episodes/movies
  - Public content notifications for broadcasting to entire communities

- **User Management**:
  - Granular user controls for watchlist syncing
  - Tag-based tracking for user content requests
  - Automatic multi-user watchlist monitoring

- **Plex Label Sync**:
  - Automatically syncs user labels to Plex content based on watchlists
  - Supports tag integration from Radarr/Sonarr instances
  - Configurable label behavior and cleanup options
  - Helps organize and identify content by user preferences

- **Intelligent Content Lifecycle**:
  - Automatic configuration of webhook endpoints
  - Smart deletion of content when removed from watchlists
  - Plex playlist protection for preserving important content

- **Plex Session Monitoring**:
  - Real-time monitoring of active Plex viewing sessions
  - Automatic Sonarr searches triggered when users near end of seasons
  - Progressive "rolling monitoring" for gradual content acquisition
  - Smart deduplication and user filtering capabilities

- **Modern Web Interface**:
  - Comprehensive dashboard with detailed statistics
  - Mobile-friendly design
  - Built-in API documentation

## How It Works

Pulsarr uses an intelligent workflow to process and route content:

1. **Content Detection**:
   - Monitor Plex watchlists in real-time (Plex Pass) or via interval polling
   - Detect when users add new movies or TV shows to their watchlists

2. **Content Analysis**:
   - Evaluate content metadata (genres, language, year, etc.)
   - Apply configured routing rules
   - Check user quotas and approval requirements
   - Determine optimal target instance(s)

3. **Approval Processing** (if required):
   - Create approval requests for quota-exceeded or flagged content
   - Send notifications to administrators via Discord and other channels
   - Allow approval, rejection, or automatic expiration

4. **Automatic Acquisition**:
   - Route approved content to appropriate Sonarr/Radarr instances
   - Configure quality profiles, language, and monitoring settings

5. **Notification Delivery**:
   - Send personalized notifications when content is available
   - Send public notifications to shared channels/endpoints
   - Support for Discord, Apprise, and webhook notifications

6. **Content Lifecycle Management**:
   - Optional automatic deletion when content leaves watchlists
   - Plex playlist protection for preserving important content

## Screenshots

<div align="center">
  <img src={useBaseUrl('/img/Dashboard1.png')} alt="Dashboard Overview" width="80%"/>
</div>

## Next Steps

Ready to get started? Check out the [Quick Start Guide](installation/quick-start) or explore the detailed documentation sections to learn more about Pulsarr's features and capabilities.