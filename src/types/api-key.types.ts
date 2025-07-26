export interface ApiKey {
  id: number
  name: string
  key: string
  created_at: string
}

export interface ApiKeyCreate {
  name: string
}

export interface ApiKeyResponse {
  id: number
  name: string
  key: string
  created_at: string
}
