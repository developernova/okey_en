import type { MetadataRoute } from "next"

import { publicAppOrigin } from "@/server/config/public-app-url"

export default function robots(): MetadataRoute.Robots {
  const siteUrl = publicAppOrigin()
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy"],
      disallow: ["/admin", "/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
