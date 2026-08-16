import type { MetadataRoute } from "next"

import { publicAppOrigin } from "@/server/config/public-app-url"

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = publicAppOrigin()
  return [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ]
}
