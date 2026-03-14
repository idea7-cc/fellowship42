import { headers as getHeaders } from 'next/headers'
import { NextResponse } from 'next/server'

import { canManageChurchID } from '@/access/helpers'
import { getPayloadClient } from '@/lib/getPayloadClient'
import {
  getLandingPageDataByOwnerID,
  getLandingPageDataByPageID,
} from '@/lib/landing-pages'
import {
  isLandingPageOwnerCollection,
  landingPageOwnerConfig,
} from '@/lib/landing-page-urls'

const badRequest = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

const redirectToAdminLogin = (requestURL: URL) =>
  NextResponse.redirect(
    new URL(`/admin/login?redirect=${encodeURIComponent(`${requestURL.pathname}${requestURL.search}`)}`, requestURL),
  )

const createLandingPageIfNeeded = async ({
  churchID,
  entity,
  existingPageID,
  ownerCollection,
}: {
  churchID: number | string
  entity: Record<string, unknown> & { id: number | string; slug?: string | null; summary?: string | null; title?: string | null }
  existingPageID?: number | string
  ownerCollection: 'courses' | 'groups' | 'ministries'
}) => {
  if (existingPageID) {
    return existingPageID
  }

  const payload = await getPayloadClient()
  const relationField = landingPageOwnerConfig[ownerCollection].relationField
  const pageType = landingPageOwnerConfig[ownerCollection].pageType
  const baseSlug = `${String(entity.slug || entity.id)}-page`

  const buildData = (slug: string) => ({
    [relationField]: entity.id,
    blocks: [
      {
        blockType: 'hero',
        body: entity.summary,
        eyebrow:
          pageType === 'group' ? 'Group page' : pageType === 'course' ? 'Course page' : 'Ministry page',
        headline: entity.title,
      },
    ],
    church: churchID,
    pageType,
    seoDescription: entity.summary,
    slug,
    status: 'draft',
    themeMode: 'inherit',
    title: `${String(entity.title || 'Landing page')} Landing Page`,
  })

  try {
    const page = await payload.create({
      collection: 'landing-pages',
      data: buildData(baseSlug) as never,
      overrideAccess: true,
    })

    return page.id
  } catch {
    const page = await payload.create({
      collection: 'landing-pages',
      data: buildData(`${baseSlug}-${String(entity.id)}`) as never,
      overrideAccess: true,
    })

    return page.id
  }
}

export async function GET(request: Request) {
  const requestURL = new URL(request.url)
  const mode = requestURL.searchParams.get('mode') || 'edit'
  const ownerCollection = requestURL.searchParams.get('ownerCollection')
  const ownerID = requestURL.searchParams.get('ownerID')
  const pageID = requestURL.searchParams.get('pageID')

  const payload = await getPayloadClient()
  const headers = await getHeaders()
  const { user } = await payload.auth({ headers })

  if (!user) {
    return redirectToAdminLogin(requestURL)
  }

  const context = pageID
    ? await getLandingPageDataByPageID({
        includeDraft: true,
        pageID,
      })
    : ownerCollection && ownerID && isLandingPageOwnerCollection(ownerCollection)
      ? await getLandingPageDataByOwnerID({
          includeDraft: true,
          ownerCollection,
          ownerID,
        })
      : null

  if (!context) {
    return badRequest('Landing page target was not found.', 404)
  }

  if (!canManageChurchID(user, context.church.id)) {
    return badRequest('You are not allowed to manage landing pages for this church.', 403)
  }

  if (mode === 'public') {
    return NextResponse.redirect(new URL(context.publicPath, requestURL))
  }

  if (mode !== 'edit') {
    return badRequest('Unsupported landing page action.')
  }

  if (pageID) {
    return NextResponse.redirect(new URL(`/admin/collections/landing-pages/${pageID}`, requestURL))
  }

  if (!ownerCollection || !isLandingPageOwnerCollection(ownerCollection) || !ownerID) {
    return badRequest('Landing page owner parameters are incomplete.')
  }

  const landingPageID = await createLandingPageIfNeeded({
    churchID: context.church.id,
    entity: context.entity,
    existingPageID: context.landingPage?.id,
    ownerCollection,
  })

  return NextResponse.redirect(new URL(`/admin/collections/landing-pages/${landingPageID}`, requestURL))
}
