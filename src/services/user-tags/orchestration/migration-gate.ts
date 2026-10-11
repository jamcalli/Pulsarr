import type { ArrType, UserTagDeps } from '../types.js'

export class TagMigrationFailedError extends Error {
  constructor(type: ArrType, instances: string[]) {
    super(
      `${type} tag migration failed on ${instances.join(', ')}; it will retry on the next run`,
    )
    this.name = 'TagMigrationFailedError'
  }
}

/** Throws when any instance failed to migrate so callers do not run against half-migrated tags. */
export async function ensureMigrationComplete(
  type: ArrType,
  deps: Pick<UserTagDeps, 'logger' | 'migration'>,
): Promise<void> {
  const needsMigration = !(await deps.migration.checkAllInstancesMigrated(type))
  deps.logger.debug(`${type} migration check: needsMigration=${needsMigration}`)
  if (!needsMigration) return

  deps.logger.info(`Starting ${type} tag migration (colon -> hyphen)`)
  const results = await deps.migration.migrateInstanceTags(type)
  const failed = results.filter((result) => !result.success)
  if (failed.length > 0) {
    throw new TagMigrationFailedError(
      type,
      failed.map((result) => result.instanceName),
    )
  }
  deps.logger.info(`Completed ${type} tag migration`)
}
