import { notFound, redirect } from 'next/navigation'

import { canManageChurchID } from '@/access/helpers'
import { LandingPageRenderer, type LandingBlock } from '@/components/LandingPageRenderer'
import {
  getLandingPageDataByOwnerID,
  getLandingPageDataByPageID,
} from '@/lib/landing-pages'
import {
  isLandingPageOwnerCollection,
  landingPageOwnerConfig,
} from '@/lib/landing-page-urls'
import { getSessionUser } from '@/lib/session'
import { themeStyleVars } from '@/lib/theme'

export const dynamic = 'force-dynamic'

type PreviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const readParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default async function LandingPagePreview({ searchParams }: PreviewPageProps) {
  const user = await getSessionUser()

  if (!user) {
    redirect('/admin/login')
  }

  const params = await searchParams
  const pageID = readParam(params.pageID)
  const ownerCollection = readParam(params.ownerCollection)
  const ownerID = readParam(params.ownerID)

  const data = pageID
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

  if (!data || !canManageChurchID(user, data.church.id)) {
    notFound()
  }

  const ownerCollectionKey =
    data.pageType === 'group' ? 'groups' : data.pageType === 'course' ? 'courses' : 'ministries'
  const adminEditPath = data.landingPage?.id
    ? `/admin/collections/landing-pages/${data.landingPage.id}`
    : `/admin/collections/${ownerCollectionKey}/${data.entity.id}`

  return (
    <div className="church-site landing-page" style={themeStyleVars(data.theme)}>
      <section className="preview-banner">
        <div className="preview-banner__copy">
          <span className="eyebrow">Editor preview</span>
          <h2>
            {data.landingPage
              ? `Previewing the ${data.landingPage.status === 'published' ? 'current landing page' : 'unpublished draft'}`
              : `Previewing the structured default ${landingPageOwnerConfig[ownerCollectionKey].label} page`}
          </h2>
          <p>
            Draft changes render here before publication. The public route remains driven by the church theme and the
            latest published content.
          </p>
        </div>
        <div className="preview-banner__actions">
          <a className="button primary" href={adminEditPath}>
            {data.landingPage ? 'Edit landing page' : 'Edit source record'}
          </a>
          <a className="button secondary" href={data.publicPath}>
            Open public route
          </a>
        </div>
      </section>

      <LandingPageRenderer
        blocks={data.landingPage?.blocks as LandingBlock[] | undefined}
        church={data.church}
        entity={data.entity}
        pageType={data.pageType}
        relatedCourses={data.relatedCourses}
        relatedGroups={data.relatedGroups}
      />
    </div>
  )
}
