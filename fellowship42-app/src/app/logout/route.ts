import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { getPayloadClient } from '@/lib/getPayloadClient'

export async function GET(request: Request) {
  const payload = await getPayloadClient()
  const cookieStore = await cookies()

  cookieStore.set({
    expires: new Date(0),
    name: `${payload.config.cookiePrefix}-token`,
    path: '/',
    value: '',
  })

  return NextResponse.redirect(new URL('/', request.url))
}
