---
sidebar_position: 2
---

# Local Mock Servers

Run Pulsarr against local Radarr / Sonarr mocks when your real *arr* instances are unreachable — for example off your home network.

The mocks cover Pulsarr’s full dependency surface against those services: connection tests, health checks, webhooks, quality profiles / root folders, library CRUD, bulk tag editors, and Sonarr episodes / commands. Every content add is logged so you can verify routing vs skip behavior.

## Commands

| Command | What it does |
|---------|--------------|
| `bun run dev` | Pulsarr FE+BE only (normal local development) |
| `bun run dev:mocks` | Start Radarr + Sonarr mocks, then Pulsarr in `--dev` mode (one terminal) |
| `bun run mock:arr` | Radarr + Sonarr mocks only |
| `bun run mock:radarr` | Radarr mock only (`:7878`) |
| `bun run mock:sonarr` | Sonarr mock only (`:8989`) |

Day-to-day:

```bash
bun run dev          # regular — no mocks
bun run dev:mocks    # mocks + FE/BE in one shot
```

Ports can be overridden with `mockRadarrPort` and `mockSonarrPort`.

## Point Pulsarr at the mocks

1. Start mocks (`bun run dev:mocks` or `bun run mock:arr` in a second terminal).
2. In the UI, add / edit instances:
   - **Radarr:** `http://localhost:7878`, API key `mock-api-key`
   - **Sonarr:** `http://localhost:8989`, API key `mock-api-key`
3. Run **Test Connection** — it should succeed and unlock default-instance controls.
4. Set quality profile / root folder (seeded as `HD-1080p` and `/data/media`).

## What is covered

### Radarr / Sonarr

- System status, quality profiles, root folders, tags (CRUD)
- Notifications / webhooks (CRUD; no callbacks into Pulsarr)
- Library list / lookup / add / update / delete
- Bulk editors (`PUT movie/editor`, `PUT series/editor`)
- Radarr TMDB lookup (`GET movie/lookup/tmdb`)
- Sonarr episodes (`GET episode`, `PUT episode/monitor`, `DELETE episodefile/:id`)
- Sonarr commands (`POST command`)
- Import-list exclusions (always empty)

Added series are seeded with season 1 and a few episodes (some with files) so session-monitor and season-completion flows have data to work with.

## Verifying routing vs skip

Watch the mock terminal for add lines:

```text
[mock-radarr] ADD movie tmdb=123 title="Example" id=1
[mock-sonarr] ADD series tvdb=456 title="Example Show" id=1
```

- Content that **should route** → you see an `ADD` line.
- Content that **should skip** (no matching route + skip-default enabled, or exclude-from-routing) → no `ADD` line.

## Notes

- Webhooks are accepted and stored in memory; the mocks do not call back into Pulsarr.
- Library state is in-memory and resets when the mock process exits.
- These scripts are for local development only — do not use them in production.
