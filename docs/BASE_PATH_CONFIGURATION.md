# Base Path Configuration

## Overview

Pulsarr now supports running under a base path, allowing you to access the application at URLs like `domain.com/pulsarr` instead of requiring a dedicated subdomain.

## Configuration

### 1. Set the Environment Variable

Add the following to your `.env` file or environment variables:

```env
basePath=/pulsarr
```

The base path should:
- Start with a `/`
- Not end with a `/`
- Be a valid URL path segment

### 2. Update Your Reverse Proxy

The reverse proxy must strip the base path before forwarding to Pulsarr. Here's an example nginx configuration:

```nginx
location /pulsarr {
    # Strip the /pulsarr prefix when passing to the app
    rewrite ^/pulsarr/?(.*)$ /$1 break;
    
    proxy_read_timeout 300;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Server $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_pass http://localhost:3003;
}
```

Apache configuration example:

```apache
<Location /pulsarr>
    RewriteEngine On
    RewriteRule ^/pulsarr/(.*)$ /$1 [PT]
    
    ProxyPass http://localhost:3003/
    ProxyPassReverse http://localhost:3003/
</Location>
```

### 3. Restart Pulsarr

After setting the environment variable, restart Pulsarr to apply the changes.

## How It Works

When a base path is configured:

1. **Reverse proxy strips the base path**: The proxy removes `/pulsarr` before forwarding
2. **Server handles redirects**: Pulsarr adds the base path back to redirect headers
3. **Client-side routing**: React Router is configured with the base path
4. **API calls**: All fetch requests are automatically prefixed with the base path
5. **Static assets**: Vite serves assets from the correct path

## Example URLs

With `basePath=/pulsarr`:

- Login page: `https://domain.com/pulsarr/app/login`
- Dashboard: `https://domain.com/pulsarr/app/dashboard`
- API endpoints: `https://domain.com/pulsarr/v1/config/config`

## Troubleshooting

1. **404 errors**: Ensure your reverse proxy is stripping the base path correctly
2. **Asset loading issues**: Clear browser cache and restart the application
3. **API call failures**: Check browser network tab to ensure calls include the base path
4. **Redirect loops**: Verify the proxy configuration strips the path properly

## Note on Webhook URLs

The `baseUrl` environment variable is still used for webhook URLs sent to Radarr/Sonarr. Make sure to update it to include your full external URL with the base path:

```env
baseUrl=https://domain.com/pulsarr
```

## Implementation Details

- The base path is handled primarily by the reverse proxy
- Pulsarr only adds the base path to redirects and client-side routing
- API calls use a helper function to prepend the base path automatically