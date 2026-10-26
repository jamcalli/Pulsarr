import {
  plexUserStatusKeys,
  quotaStatusKeys,
  userQuotaKeys,
  userStatsKeys,
  usersKeys,
} from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'

export function invalidatePlexUsers() {
  return Promise.all(
    [usersKeys.withCounts, quotaStatusKeys.all, plexUserStatusKeys.all].map(
      (queryKey) => queryClient.invalidateQueries({ queryKey }),
    ),
  )
}

export function invalidateUser(id: number) {
  return Promise.all(
    [
      usersKeys.detail(id),
      usersKeys.list,
      usersKeys.withCounts,
      plexUserStatusKeys.all,
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}

export function invalidateUserQuotas(id: number) {
  return Promise.all(
    [
      userQuotaKeys.quotas(id),
      userQuotaKeys.status,
      userQuotaKeys.held(id),
      userStatsKeys.byId(id),
      quotaStatusKeys.all,
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}
