# Session monitoring (/library/session-monitoring)

Session monitoring reads what's playing on Plex. When someone nears the end of a season, Pulsarr asks Sonarr for the next one. It also grows rolling shows as people watch them. Set it up under **Library** > **Session monitoring**.

## Monitoring [#monitoring]

Turn on **Session monitoring**, then set:

- **Remaining episodes threshold**. Pulsarr requests the next season when this many episodes of the current one are left.
- **Monitored users**. Leave it empty to monitor everyone.
- **Polling interval**. Pulsarr normally gets playback from the live Plex connection, and only polls at this interval while that connection is down.

**Check now** reads what's playing on Plex straight away.

## Rolling shows [#rolling-shows]

A rolling show starts small in Sonarr and grows as people watch it. Pick a rolling mode as the **Season monitoring** of a [Sonarr instance](/library/sonarr-radarr#where-content-lands) or a [Content router route](/library/content-router), or enroll shows already in Sonarr with **Manage enrollment**.

- **Pilot rolling** starts with the first episode. Watching it adds the rest of the season, and later seasons are added as viewers near the end of each one.
- **First season rolling** starts with the whole first season, then adds later seasons the same way.
- **All seasons pilot rolling** starts with the first episode of every season. Watching a season's first episode adds the rest of that season, in any order.

Shows only grow while session monitoring is on.

### Manage enrollment [#manage-enrollment]

**Manage enrollment** lists the shows Pulsarr sent to Sonarr. Select shows, pick a **Rolling mode** and apply it. Enrolled shows keep their progress unless you turn on **Start over from the beginning**, which unmonitors every episode and deletes the files beyond the mode's starting point.

The **Rolling shows** table shows each show's mode, season, viewers and last activity. From a show you can:

- **Reset** it to its mode's starting point. Episode files rolling added are deleted and viewing progress is cleared.
- **Stop rolling**. Pulsarr stops tracking the show and nothing is deleted. The episodes stay in Sonarr.

## Resets and cleanup [#resets-and-cleanup]

These decide what happens to shows nobody is watching:

- **Automatic reset** resets shows that nobody has watched for the **Inactivity period**. **Check every** sets how often Pulsarr looks for them.
- **Progressive cleanup** deletes earlier seasons once no viewer is still on them.

When some shows are inactive, the **Rolling shows** card has a button that resets all of them at once, for example **Reset 3 inactive**.
