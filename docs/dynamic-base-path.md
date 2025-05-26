# Dynamic Base Path Support

This guide explains how to configure Pulsarr to run at a custom base path.

## Default Configuration

By default, Pulsarr runs at `/app/`. All routes are prefixed with this path:
- `/app/login`
- `/app/dashboard`
- `/app/sonarr`
- etc.

## Configuring a Custom Base Path

### Using Environment Variables

Set the `basePath` environment variable when building the application:

```bash
basePath=/pulsarr npm run build
```

### Using .env File

Add `basePath` to your `.env` file in the project root:

```
basePath=/pulsarr
```

### Using Configuration

The base path can also be set via configuration that overrides the default `/app` path.

## Deployment Examples

### Docker

```dockerfile
ENV BASE_PATH=/pulsarr
```

Or when running:

```bash
docker run -e BASE_PATH=/pulsarr pulsarr:latest
```

### Reverse Proxy (nginx)

```nginx
location /pulsarr {
    proxy_pass http://localhost:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Reverse Proxy (Apache)

```apache
ProxyPass /pulsarr http://localhost:8080
ProxyPassReverse /pulsarr http://localhost:8080
```

## Implementation Details

The base path system works by:

1. Setting the Vite `base` option at build time
2. Injecting the base path into the HTML template
3. Using a utility function to prefix all client-side routes
4. Updating server-side routes to handle the dynamic path
5. Transforming HTML responses to include the correct base path

## Backward Compatibility

If no custom base path is specified, the application defaults to `/app/` to maintain backward compatibility with existing installations.

## Limitations

1. The base path must be set at build time or server startup
2. Changing the base path requires a rebuild of the client assets
3. All absolute paths in the application must use the base path utility functions

## Code Examples

### Using the base path in React components

```typescript
import { route } from '@/utils/basePath'
import { useNavigate } from 'react-router-dom'

function MyComponent() {
  const navigate = useNavigate()
  
  const handleClick = () => {
    navigate(route('/dashboard'))
  }
  
  return (
    <a href={route('/settings')}>Settings</a>
  )
}
```

### API calls with base path

```typescript
fetch(`${getBasePath()}/api/users`)
  .then(res => res.json())
```