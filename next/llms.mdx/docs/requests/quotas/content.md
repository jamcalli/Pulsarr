# Quotas (/requests/quotas)

A quota limits how many requests a user can make in a period. Requests over the limit wait in the [approval queue](/requests/approval-queue). A watchlist cap limits how many items a user can have at once. Items past the cap are skipped, not held for approval.

## Set a user's quota [#set-a-users-quota]

Open a user from **Users** > **Plex users**. Movies and shows have separate quotas. To set quotas for several users at once, select them on **Plex users** and use **Edit quotas**. New users get the quotas set on [New user defaults](/users/new-user-defaults).

- **Limit requests** turns the quota on.
- **Quota period** is **Daily**, **Weekly rolling** or **Monthly**.
- **Requests per period** is the limit.
- **Bypass approval over the limit** sends requests over the limit straight through, and turns the cap off.
- **Cap the watchlist** and **Watchlist cap** set the most items the user can have on their watchlist.

**Remove quotas** deletes the user's quotas and caps. It can also approve the requests their quota was holding.

## How periods reset [#how-periods-reset]

- **Daily** resets at midnight, server time.
- **Weekly rolling** counts the requests from the last few days, today included. A request stops counting once it's older than the window.
- **Monthly** resets at midnight, server time, on the day you choose.

Set the weekly window and the monthly reset day under **Requests** > **Quotas**:

- **Count requests from the last** is the weekly rolling window, in days.
- **Reset on day** is the monthly reset day.
- **When a month is too short** only matters for a reset day of the 29th or later. **Reset on the last day** resets on the month's last day, **Skip that month** waits for the next reset, and **Reset on the 1st** resets on the 1st of the following month.

To approve held requests automatically once a user's quota resets, turn on **Approve automatically when a quota resets** in [Approval settings](/requests/approval-settings).

## Usage history [#usage-history]

Each request a quota counts is kept as a usage record. **Delete old usage history** removes records older than **Keep usage history for**. Keep them at least as long as your longest quota period, or requests that still count are deleted.

**Quota maintenance** runs that cleanup. **Run on a schedule** turns it on or off, and **Run at** sets the time, in the server's time zone.

## Cap notifications [#cap-notifications]

**Send cap notifications to** picks where admins hear that a user reached their watchlist cap. **Notify the user** also tells the user, by Discord or Apprise if they use them.
