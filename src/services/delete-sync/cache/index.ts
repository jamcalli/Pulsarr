// Cache management exports for delete sync service

export {
  ensureProtectionCache,
  isAnyGuidProtected,
} from './protected-cache.js'
export { TagCache, type TagService } from './tag-cache.js'
export { ensureTrackedCache, isAnyGuidTracked } from './tracked-cache.js'
