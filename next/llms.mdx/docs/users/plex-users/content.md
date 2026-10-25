# Plex users (/users/plex-users)

**Users** > **Plex users** lists you, your Plex friends, and anyone with access to your Plex server. Pulsarr adds friends on its own, with your [new user defaults](/users/new-user-defaults).

The table shows each user's **Relationship**, **Watchlist** size, whether they **Sync**, whether they need **Approval**, their **Notifications** and their **Quotas**. Use **Search users** and the filters to narrow it.

## Relationship [#relationship]

- **Owner** is your own Plex account.
- **Friend** is a Plex friend with access to your server.
- **No server** is a Plex friend without server access. Their requests sync, but they can't watch.
- **No friend** has access to your server but isn't a Plex friend.
- **Pending** is a friend request you sent that they haven't accepted.
- **Incoming** is a friend request they sent you. Accept it in Plex.
- **Managed** is a Plex Home account without a watchlist.

## Not yet friends [#not-yet-friends]

Pulsarr can only read the watchlists of your Plex friends. People it can't track yet show under **Not yet friends**, except **Managed** accounts. Select **Send friend request** for a **No friend** account, or **Cancel request** or **Resend request** for a **Pending** one.

A friend whose **Watchlist** shows 0 may have an empty watchlist or a private one. Pulsarr can't tell which. See the [quick start](/installation/quick-start#before-you-start) for the Plex privacy setting.

## Change one user [#change-one-user]

Select a user to open their page.

- **Identity** shows their **Plex username**, which can't be changed here, and an **Alias** shown instead of it in Pulsarr and notifications.
- **Access** has **Sync watchlist**, which requests what they add, and **Require approval**, which holds their requests in the [approval queue](/requests/approval-queue).
- **Notifications** has their **Discord user ID** and **Apprise URL**, and switches for **Discord**, **Discord mention**, **Apprise** and **Plex mobile**. **Send a test** sends through the channels saved for them.
- **Movies** and **Shows** set their [quota and watchlist cap](/requests/quotas).

The page also shows what's on their watchlist, their requests by status and their quota usage.

**Remove friend** ends the Plex friendship. Their Pulsarr record, watchlist and quotas are deleted at the next sync.

## Change several users [#change-several-users]

Select users in the table, then:

- **Edit settings** changes access and notifications for all of them. Fields left as is keep each user's current value. **Clear values** removes their alias, Discord user ID or Apprise URL.
- **Edit quotas** sets or removes their quotas.
