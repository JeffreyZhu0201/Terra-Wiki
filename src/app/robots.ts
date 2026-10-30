import type { MetadataRoute } from 'next'
import { getSettings } from '@/server/services/settings'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { siteUrl } = await getSettings()
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: '/admin' }],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
