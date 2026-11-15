# Plex mobile (/notifications/plex-mobile)

Pulsarr pushes a notification to a user's Plex mobile app when something on their watchlist becomes available. Tapping it opens the title in Plex. It needs Plex Pass on your server.

## Turn it on [#turn-it-on]

Under **Notifications** > **Plex mobile**, turn on **Send to Plex mobile apps**. Then turn on **Plex mobile** for each user on their page under [Plex users](/users/plex-users), or for several at once with **Edit settings**.

**Send a test push** pushes to one user's Plex app to check it works.

If a title isn't in Plex yet when it's ready, Pulsarr keeps trying for about ten minutes.

## Mobile app setup [#mobile-app-setup]

Each user sets this up in their own Plex app.

1. Open the Plex Android or iOS app and go to **Settings** > **Notifications**.
2. Enable **New Content Added to Library**.
3. Uncheck all libraries for your server. Otherwise Plex also notifies about every new item, and users get two notifications for the same title.

**Send a test push** from Pulsarr should then arrive.
