import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { LandingPageRenderer, type LandingBlock } from '@/components/LandingPageRenderer'
import { getGroupLandingPageData } from '@/lib/landing-pages'
import { themeStyleVars } from '@/lib/theme'

export const dynamic = 'force-dynamic'

type Args = {
  params: Promise<{
    slug: string
    groupSlug: string
  }>
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug, groupSlug } = await params
  const data = await getGroupLandingPageData(slug, groupSlug)

  if (!data) {
    return { title: 'Group page not found | Fellowship42' }
  }

  return {
    description: data.landingPage?.seoDescription || data.entity.summary,
    title: `${data.entity.title} | ${data.church.name}`,
  }
}

export default async function GroupLandingPage({ params }: Args) {
  const { slug, groupSlug } = await params
  const data = await getGroupLandingPageData(slug, groupSlug)

  if (!data) {
    notFound()
  }

  return (
    <div className="church-site landing-page" style={themeStyleVars(data.theme)}>
      <LandingPageRenderer
        blocks={data.landingPage?.blocks as LandingBlock[] | undefined}
        church={data.church}
        entity={data.entity}
        pageType="group"
      />
    </div>
  )
}
