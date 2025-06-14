/**
 * Database row types for table records
 * These types represent the raw database schema with snake_case field names
 */

export interface SonarrInstanceRow {
  id: number
  name: string
  base_url: string
  api_key: string
  quality_profile: string | null
  root_folder: string | null
  bypass_ignored: boolean | number
  season_monitoring: string | null
  monitor_new_items: string | null
  search_on_add: boolean | number | null
  create_season_folders: boolean | number | null
  tags: string | null
  is_default: boolean | number
  is_enabled: boolean | number
  synced_instances: string | null
  series_type: string | null
  created_at: string
  updated_at: string
}

export interface RadarrInstanceRow {
  id: number
  name: string
  base_url: string
  api_key: string
  quality_profile: string | null
  root_folder: string | null
  bypass_ignored: boolean | number
  tags: string | null
  is_default: boolean | number
  synced_instances: string | null
  search_on_add: boolean | number | null
  minimum_availability: string | null
  is_enabled: boolean | number
  created_at: string | Date
  updated_at: string | Date
}
