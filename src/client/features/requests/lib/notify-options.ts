export const NOTIFY_OPTIONS = [
  { value: 'all', label: 'All channels' },
  { value: 'apprise-only', label: 'Apprise only' },
  { value: 'discord-both', label: 'Discord webhook and direct messages' },
  { value: 'dm-only', label: 'Discord direct messages only' },
  { value: 'webhook-only', label: 'Discord webhook only' },
  { value: 'none', label: 'None' },
] as const satisfies Array<{ value: string; label: string }>
