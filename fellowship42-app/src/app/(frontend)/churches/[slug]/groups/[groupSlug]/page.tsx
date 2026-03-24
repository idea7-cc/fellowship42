import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ChurchTheme } from '@/components/church-theme'
import { LandingPageRenderer, type LandingBlock } from '@/components/LandingPageRenderer'
import { getGroupLandingPageData } from '@/lib/landing-pages'

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
    <ChurchTheme
      className="mx-auto max-w-[1200px] px-5"
      theme={data.themeInput}
    >
      <LandingPageRenderer
        blocks={data.landingPage?.blocks as LandingBlock[] | undefined}
        church={data.church}
        entity={data.entity}
        pageType="group"
      />
    </ChurchTheme>
  )
}
