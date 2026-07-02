import type {
  ConfigFull,
  ConfigUpdate,
} from '@root/schemas/config/config.schema.js'
import type { SecretColumn } from '@root/types/config.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    getConfig(): Promise<ConfigFull | undefined>

    createConfig(
      config: Omit<ConfigUpdate, 'id' | 'created_at' | 'updated_at'>,
    ): Promise<number>

    updateConfig(config: ConfigUpdate): Promise<boolean>

    getLastNotifiedVersion(): Promise<string | null>

    setLastNotifiedVersion(version: string): Promise<boolean>

    getSecrets(): Promise<Record<SecretColumn, string | null>>

    setSecret(key: SecretColumn, value: string): Promise<void>
  }
}
