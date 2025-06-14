/**
 * Database row types for table records
 * These types represent the raw database schema with snake_case field names
 */

/**
 * Base interface for common instance row fields
 */
interface BaseInstanceRow {
  id: number
  name: string
  base_url: string
  api_key: string
  quality_profile: string | null
  root_folder: string | null
  bypass_ignored: boolean | number
  tags: string | null
  is_default: boolean | number
  is_enabled: boolean | number
  synced_instances: string | null
  created_at: string
  updated_at: string
}

export interface SonarrInstanceRow extends BaseInstanceRow {
  season_monitoring: string | null
  monitor_new_items: string | null
  search_on_add: boolean | number | null
  create_season_folders: boolean | number | null
  series_type: string | null
}

export interface RadarrInstanceRow extends BaseInstanceRow {
  search_on_add: boolean | number | null
  minimum_availability: string | null
}
