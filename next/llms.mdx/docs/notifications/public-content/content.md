# Public content (/notifications/public-content)

Public content announces every title that becomes available, whoever asked for it, in shared channels. It works alongside each user's own notifications. Set it up under **Notifications** > **Public content** and turn on **Broadcast to shared channels**.

Each tab, **All content**, **Movies** and **Shows**, has two lists:

- **Discord webhooks**, the webhook URLs of the channels to post in.
- **Apprise**, Apprise URLs, or email addresses when an [email sender](/notifications/apprise#email-addresses) is set. These need an [Apprise server](/notifications/apprise).

Movies and shows use their own tab's lists when they have any, and the **All content** lists otherwise. They never get both.

**Send test** next to a URL sends a test announcement to it, and **Test saved URLs** tests the URLs already saved.

On Discord, the announcement mentions the users who have the title on their watchlist, if they have **Discord mention** turned on and a Discord ID saved on their page under [Plex users](/users/plex-users).
