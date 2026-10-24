# API keys (/system/api-keys)

An API key lets another app, such as Home Assistant or your own script, call the [Pulsarr API](/api). Manage keys under **System** > **API keys**.

Enter a **Name** that says what will use the key, then select **Create key**. **Copy key** copies it. Send it in the `X-API-Key` header with each request.

**Revoke** cuts off anything using a key straight away, and it can't be undone.
