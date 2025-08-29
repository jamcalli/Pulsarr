export interface ApiKey {
  id: number
  name: string
  key: string
  user_id: number
  created_at: string
  is_active: boolean
}

export interface ApiKeyCreate {
  name: string
}
