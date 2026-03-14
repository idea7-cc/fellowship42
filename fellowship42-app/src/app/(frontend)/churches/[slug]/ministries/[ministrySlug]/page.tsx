import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { LandingPageRenderer, type LandingBlock } from '@/components/LandingPageRenderer'
import { getMinistryLandingPageData } from '@/lib/landing-pages'
import { themeStyleVars } from '@/lib/theme'

export const dynamic = 'force-dynamic'

type Args = {
  params: Promise<{
    slug: string
    ministrySlug: string
  }>
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug, ministrySlug } = await params
  const data = await getMinistryLandingPageData(slug, ministrySlug)

  if (!data) {
    return { title: 'Ministry page not found | Fellowship42' }
  }

  return {
    description: data.landingPage?.seoDescription || data.entity.summary,
    title: `${data.entity.title} | ${data.church.name}`,
  }
}

export default async function MinistryLandingPage({ params }: Args) {
  const { slug, ministrySlug } = await params
  const data = await getMinistryLandingPageData(slug, ministrySlug)

  if (!data) {
    notFound()
  }

  return (
    <div className="church-site landing-page" style={themeStyleVars(data.theme)}>
      <LandingPageRenderer
        blocks={data.landingPage?.blocks as LandingBlock[] | undefined}
        church={data.church}
        entity={data.entity}
        pageType="ministry"
        relatedCourses={data.relatedCourses}
        relatedGroups={data.relatedGroups}
      />
    </div>
  )
}
