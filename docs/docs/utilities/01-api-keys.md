---
sidebar_position: 1
---

# API Keys

API Keys provide secure, programmatic access to your Pulsarr instance for external applications, scripts, and integrations.

## Quick Setup

1. Navigate to **Utilities → API Keys**
2. Enter a descriptive name for your key
3. Click **Generate API Key**
4. Copy the generated key for use in your applications

## Configuration

**Usage**: Include your API key in the `X-API-Key` header:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
     http://your-pulsarr-instance/v1/endpoint
```

## Features

- **Active Keys**: Ready for immediate use
- **Revoked Keys**: Permanently disabled, return `401 Unauthorized`
- **Descriptive Names**: Label each key for easy identification
- **Secure Access**: All requests authenticated via header

## Best Practices

- Use descriptive names for each key
- Revoke unused keys immediately
- Store keys securely - never commit to version control
- Create separate keys for different applications
- Use HTTPS in production

## Troubleshooting

**401 Unauthorized:**
- Verify you're using the `X-API-Key` header
- Check that the key hasn't been revoked
- Ensure the key is correct

**Key Not Working:**
- Verify you copied the complete key without extra spaces
- Check for trailing newlines or whitespace
- Try regenerating the key

## API Reference

See the [API Keys documentation](/docs/api/api-keys) for detailed endpoint information.