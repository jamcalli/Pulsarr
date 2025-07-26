# API Keys

API Keys provide secure, programmatic access to your Pulsarr instance for external applications, scripts, and integrations.

## Creating API Keys

1. Navigate to **Utilities → API Keys**
2. Enter a descriptive name for your key
3. Click **Generate API Key**
4. Copy the generated key for use in your applications

## Usage

Include your API key in the `Authorization` header:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     http://your-pulsarr-instance/v1/endpoint
```

## Security Best Practices

- Use descriptive names for each key
- Revoke unused keys immediately
- Store keys securely - never commit to version control
- Create separate keys for different applications
- Use HTTPS in production

## Key Management

- **Active Keys**: Ready for immediate use
- **Revoked Keys**: Permanently disabled, return `401 Unauthorized`

## Troubleshooting

**401 Unauthorized**: Check key format (`Bearer YOUR_KEY`) and ensure key isn't revoked  
**Key Not Working**: Verify you copied the complete key without extra spaces

## API Reference

See the [API Keys section](/docs/api/api-keys) for detailed endpoint documentation.