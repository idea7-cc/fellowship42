import { notFound, redirect } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChurchTheme } from '@/components/church-theme'
import { LandingPageRenderer, type LandingBlock } from '@/components/LandingPageRenderer'
import { canManageChurchID } from '@/access/helpers'
import {
  getLandingPageDataByOwnerID,
  getLandingPageDataByPageID,
} from '@/lib/landing-pages'
import {
  isLandingPageOwnerCollection,
  landingPageOwnerConfig,
} from '@/lib/landing-page-urls'
import { getSessionUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

type PreviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const readParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

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
    <ChurchTheme
      className="mx-auto max-w-[1200px] px-5"
      theme={data.themeInput}
    >
      {/* Preview banner */}
      <section className="mb-8 grid grid-cols-[minmax(0,1.5fr)_auto] items-end gap-4 rounded-[calc(var(--radius)+0.5rem)] border border-white/10 bg-[rgba(16,18,24,0.92)] p-5 text-amber-50 max-md:grid-cols-1">
        <div className="grid gap-2">
          <Badge className="text-amber-50/80" variant="muted">Editor preview</Badge>
          <h2 className="text-amber-50">
            {data.landingPage
              ? `Previewing the ${data.landingPage.status === 'published' ? 'current landing page' : 'unpublished draft'}`
              : `Previewing the structured default ${landingPageOwnerConfig[ownerCollectionKey].label} page`}
          </h2>
          <p className="text-amber-50/80">
            Draft changes render here before publication. The public route remains driven by the
            church theme and the latest published content.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 max-md:justify-start justify-end">
          <Button asChild>
            <a href={adminEditPath}>
              {data.landingPage ? 'Edit landing page' : 'Edit source record'}
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a href={data.publicPath}>Open public route</a>
          </Button>
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
    </ChurchTheme>
  )
}
