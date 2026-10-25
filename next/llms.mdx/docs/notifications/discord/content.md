# Discord (/notifications/discord)

Discord has two parts, set up under **Notifications** > **Discord**. Admin webhooks post Pulsarr's system notifications to channels. The Discord bot sends each user a direct message when something they asked for is ready, and lets them manage their own settings.

## Admin webhooks [#admin-webhooks]

1. In Discord, open the channel's settings, then **Integrations** > **Webhooks** > **New Webhook**, and copy its URL.
2. Paste it into **Webhook URLs** in Pulsarr. To post to several channels, select **Add URL** and paste each one into its own field.

**Send test** next to a URL posts a test message to that channel, and **Test saved URLs** tests the ones already saved.

## Discord bot [#discord-bot]

### Create the bot [#create-the-bot]

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create a new application. You can use the [Pulsarr icon](/img/discord-bot-icon.png) as its picture.
2. On the **Bot** page, turn on **Message Content Intent** and copy the bot token.
3. On **OAuth2** > **URL Generator**, select the `bot` and `applications.commands` scopes. The bot needs no permissions, because it only answers its own slash commands and sends direct messages.
4. Open the generated URL and add the bot to your server.

### Connect it to Pulsarr [#connect-it-to-pulsarr]

Enter the **Bot token** and the **Client ID**, which is on the application's **General Information** page. Save, then select **Start bot**.

**Send a test direct message** messages one Discord user through the bot to check it works.

### User notification setup [#user-notification-setup]

Your own account cannot be linked from Discord. Paste your **Discord user ID** on your page under [Plex users](/users/plex-users). Everyone else runs `/notifications` in your Discord server and enters their Plex username to link their account. After that, `/notifications` lets them change their own notification settings.

You can also paste a user's **Discord user ID** on their page under [Plex users](/users/plex-users). Users get direct messages only once a Discord user ID is saved for them, and only while they share a server with the bot. A user who turns off direct messages from server members in their Discord privacy settings gets none.

### Approve requests from Discord [#approve-requests-from-discord]

`/approvals` lets you browse, approve and deny pending requests from Discord. It only answers the Discord user saved on your own Plex user, the account that owns the server.
