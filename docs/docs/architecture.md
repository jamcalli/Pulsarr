---
sidebar_position: 6
---

# Architecture

Pulsarr uses a modern full-stack architecture built for reliability, performance, and scalability in self-hosted media environments.

## Backend Stack

### **Core Server**
- **Node.js 22 LTS**: Modern JavaScript runtime with latest performance optimizations
- **Fastify**: High-performance HTTP server with extensive plugin ecosystem
- **TypeScript**: Full type safety across server and client for maintainability
- **Plugin Architecture**: Modular services with dependency injection and lifecycle management

### **Database Layer**
- **SQLite**: Default lightweight database with file-based storage
- **PostgreSQL**: Enterprise database support for high-scale deployments
- **Knex.js**: Query builder and migration system supporting both database types
- **Migration System**: Automated schema updates with SQLite-to-PostgreSQL migration support

### **Key Services**
- **Content Router**: Intelligent routing engine for Sonarr/Radarr instance selection
- **Toad Scheduler**: Background job processing for sync operations and cleanup tasks  
- **Webhook Processor**: Real-time content import detection and notification triggers
- **Queue Manager**: Async processing for notifications and batch operations
- **Session Monitor**: Plex playback tracking for intelligent auto-search functionality

## Frontend Stack

### **Client Application**
- **React 19**: Modern single-page application served by Fastify
- **TypeScript**: Shared type definitions between client and server
- **Tailwind CSS**: Utility-first styling with responsive design system
- **Zustand**: Lightweight state management for client-side data
- **Radix UI**: Accessible component primitives

### **Build & Development**
- **Vite**: Fast development server and optimized production builds with Fastify integration
- **Biome**: Code formatting and linting for consistent code quality

## Database Architecture

### **Data Models**
- **Users**: Plex user management with permissions and quota tracking
- **Watchlists**: Content tracking with status and metadata relationships
- **Instances**: Sonarr/Radarr configuration and routing rules
- **Approvals**: Request workflow with expiration and bulk operations
- **Notifications**: Delivery tracking and user preferences
- **Analytics**: Usage statistics and performance metrics

### **Migration Support**
- **Knex Migrations**: Version-controlled schema evolution
- **Cross-Database**: Compatible migrations for SQLite and PostgreSQL
- **Data Migration**: Built-in SQLite-to-PostgreSQL data transfer utility

## External Integrations

### **Media Stack**
- **Plex API**: Watchlist monitoring via RSS feeds, GraphQL, and REST endpoints
- **Sonarr/Radarr APIs**: Content management across multiple instances
- **TMDB API**: Enhanced metadata and poster artwork fetching

### **Notification Services**
- **Discord Bot**: Interactive commands, approval management, and user DMs
- **Discord Webhooks**: Administrative notifications and public content announcements
- **Tautulli**: Native Plex mobile app notifications via notification agents
- **Apprise**: 80+ notification services (Telegram, Slack, email, SMS, etc.)

### **Real-time Features**
- **Plex Label Sync**: Webhook-driven automatic label management
- **Webhook Processing**: Instant content import detection and user notifications
- **Server-Sent Events**: Live UI updates for approval status and sync progress

## API Architecture

### **RESTful API**
- **OpenAPI Specification**: Auto-generated documentation with interactive testing
- **Scalar API Docs**: Built-in documentation UI served at `/api/docs` via Fastify Swagger plugin
- **Typed Routes**: End-to-end type safety from client to database
- **Middleware Pipeline**: Authentication, validation, logging, and error handling
- **Rate Limiting**: Configurable request throttling and abuse prevention

### **Authentication**
- **Session Management**: Secure cookie-based authentication with configurable options
- **Flexible Auth Modes**: Required, local-only bypass, or completely disabled
- **Permission System**: User-level access control and administrative privileges

## Data Flow

### **Content Processing Pipeline**
1. **Watchlist Detection**: RSS monitoring (Plex Pass) or polling (non-Plex Pass)
2. **Permission Validation**: User sync permissions and quota enforcement
3. **Content Analysis**: Metadata evaluation and routing rule application
4. **Instance Selection**: Intelligent routing based on content criteria
5. **Approval Workflow**: Optional administrative review process
6. **Content Acquisition**: API calls to selected Sonarr/Radarr instances
7. **Import Detection**: Webhook monitoring for successful content acquisition
8. **Notification Delivery**: Multi-channel user notifications

### **Notification Flow**
1. **Webhook Reception**: Real-time import events from Sonarr/Radarr
2. **Content Matching**: GUID and metadata matching to identify requesting users  
3. **Smart Batching**: Season episode grouping and spam prevention
4. **User Targeting**: Preference-based notification filtering
5. **Multi-Channel Delivery**: Parallel delivery across enabled notification methods
6. **Delivery Tracking**: Success/failure monitoring and retry logic

## Deployment Architecture

### **Container Support**
- **Docker**: Official multi-arch images (amd64, arm64)
- **Docker Compose**: Sample configurations with service dependencies
- **Volume Management**: Persistent data and configuration storage

### **Network Configuration**
- **Service Discovery**: Docker network integration for container communication
- **Webhook Endpoints**: External accessibility for Sonarr/Radarr callbacks
- **Reverse Proxy**: Support for Nginx, Traefik, and other proxy solutions

### **Scaling Considerations**
- **Database**: PostgreSQL for high-scale deployments with connection pooling
- **Processing**: Configurable concurrency limits for API calls and processing
- **Monitoring**: Comprehensive logging with structured output and log rotation

## Performance Features

### **Optimization**
- **Caching**: Intelligent metadata caching to reduce external API calls
- **Connection Pooling**: Efficient database connection management
- **Batch Operations**: Grouped API calls for multi-instance content synchronization
- **Background Processing**: Async queues for non-blocking user operations

### **Monitoring**
- **Structured Logging**: JSON output with configurable levels and filtering
- **Health Checks**: API endpoints for container orchestration health monitoring
- **Metrics**: Built-in analytics for content routing and user activity patterns
- **Error Tracking**: Comprehensive error logging with context preservation