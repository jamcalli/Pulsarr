# Pulsarr

## Overview
Pulsarr is a Plex watchlist tracker and notification center that integrates with the Arr stack (Sonarr/Radarr). It monitors Plex Pass watchlists in real-time and sends configurable Discord and/or email notifications when watchlisted content becomes available.

## Key Features
- Real-time Plex watchlist monitoring via RSS feeds
- Discord notifications for content availability
- Smart routing between multiple Sonarr/Radarr instances based on content genre
- Multi-instance synchronization
- Content statistics tracking
- Fully configurable through an intuitive GUI

## Technologies
Built with TypeScript, Tailwind, Fastify, SQLite, React, Vite, Docker

## Target Audience
Plex Pass subscribers, media server enthusiasts, home theater hobbyists, and self-hosters who use the Arr stack (Sonarr/Radarr) for media automation.

## Use Cases
- Genre based routing to specialized Sonarr instances with custom quality profiles
- Users can receive Discord direct messages and/or emails when their shows, movies, and new episodes become available
- Set up webhooks to track watchlist additions and trigger custom workflows
- Maintain synchronized content libraries across multiple Arr instances
- Track and analyze watchlist engagement through built-in statistics
- Automate content acquisition based on Plex watchlist additions

## Current Status
Beta - Core functionality implemented and working, with active development for stability improvements and feature enhancements. Could use testers!

## Related Projects
- Watchlistarr - Main inspiration for this project (but needed a rewrite)
- Sonarr - TV series management
- Radarr - Movie management
- Plex - Media server platform
- Overseerr - Media request management
- Tautulli - Plex monitoring and analytics

## Keywords
plex, watchlist, sonarr, radarr, media server, media automation, arr stack, discord, content management, plex pass, rss monitoring, self-hosted