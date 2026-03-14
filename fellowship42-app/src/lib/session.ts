import { headers as getHeaders } from 'next/headers'
import { redirect } from 'next/navigation'

import { getPayloadClient } from '@/lib/getPayloadClient'

export const getSessionUser = async () => {
  const payload = await getPayloadClient()
  const headers = await getHeaders()
  const { user } = await payload.auth({ headers })
  return user
}

export const requireSessionUser = async () => {
  const user = await getSessionUser()

  if (!user) {
    redirect('/admin/login')
  }

  return user
}

