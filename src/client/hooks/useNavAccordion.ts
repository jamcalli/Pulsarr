import { useState } from 'react'

/** One open section at a time, reopened to the active section whenever navigation moves to a new one. */
export function useNavAccordion(activeId: string | null) {
  const [openId, setOpenId] = useState(activeId)
  const [followedId, setFollowedId] = useState(activeId)

  if (activeId !== followedId) {
    setFollowedId(activeId)
    if (activeId) setOpenId(activeId)
  }

  const setSectionOpen = (id: string, open: boolean) =>
    setOpenId(open ? id : null)

  return { openId, setSectionOpen }
}
