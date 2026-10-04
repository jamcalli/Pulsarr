import type { ArrType, UserTagDeps } from '../types.js'

export async function ensureMigrationComplete(
  type: ArrType,
  deps: Pick<UserTagDeps, 'logger' | 'migration'>,
): Promise<void> {
  const needsMigration = !(await deps.migration.checkAllInstancesMigrated(type))
  deps.logger.debug(`${type} migration check: needsMigration=${needsMigration}`)

  if (needsMigration) {
    deps.logger.info(`Starting ${type} tag migration (colon -> hyphen)`)
    await deps.migration.migrateInstanceTags(type)
    deps.logger.info(`Completed ${type} tag migration`)
  }
}
