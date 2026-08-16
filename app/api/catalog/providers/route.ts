import { z } from "zod"

import { requireUserId } from "@/server/auth/user-context"
import { env } from "@/server/config/env"
import { jsonError } from "@/server/shared/http"

const querySchema = z.object({
  title: z.string().trim().min(1).max(160),
  year: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  tmdbId: z.coerce.number().int().positive(),
  mediaType: z.enum(["movie", "tv"]),
})

const searchSchema = z.object({
  items: z.array(
    z.object({
      kinopoiskId: z.number(),
      nameRu: z.string().nullable().optional(),
      nameEn: z.string().nullable().optional(),
      nameOriginal: z.string().nullable().optional(),
      year: z.number().nullable().optional(),
    })
  ),
})

const sourcesSchema = z.object({
  items: z.array(
    z.object({
      url: z.url(),
      platform: z.string().trim().min(1),
      logoUrl: z.url().nullable().optional(),
    })
  ),
})

function normalizedTitle(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("en")
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .trim()
}

async function kinopoiskFetch(path: string, apiKey: string) {
  const response = await fetch(`https://kinopoiskapiunofficial.tech${path}`, {
    headers: { "X-API-KEY": apiKey },
    next: { revalidate: 86_400 },
  })
  if (!response.ok) throw new Error(`Kinopoisk returned ${response.status}`)
  return response.json()
}

export async function GET(request: Request) {
  try {
    await requireUserId(request)
    const url = new URL(request.url)
    const input = querySchema.parse({
      title: url.searchParams.get("title"),
      year: url.searchParams.get("year") || undefined,
      tmdbId: url.searchParams.get("tmdbId"),
      mediaType: url.searchParams.get("mediaType"),
    })
    const fallbackUrl = `https://www.themoviedb.org/${input.mediaType}/${input.tmdbId}`
    const apiKey = env().KINOPOISK_API_KEY

    if (!apiKey) {
      return Response.json({
        data: { providers: [], fallbackUrl, source: "tmdb" },
      })
    }

    try {
      const search = searchSchema.parse(
        await kinopoiskFetch(
          `/api/v2.2/films?keyword=${encodeURIComponent(input.title)}&page=1&order=RATING`,
          apiKey
        )
      )
      const wantedTitle = normalizedTitle(input.title)
      const exactYear = input.year ? Number(input.year) : null
      const film =
        search.items.find((item) => {
          const titles = [item.nameOriginal, item.nameEn, item.nameRu].map(
            normalizedTitle
          )
          return (
            titles.includes(wantedTitle) &&
            (!exactYear || !item.year || item.year === exactYear)
          )
        }) ??
        search.items.find(
          (item) => !exactYear || !item.year || item.year === exactYear
        ) ??
        search.items[0]

      if (!film) {
        return Response.json({
          data: { providers: [], fallbackUrl, source: "tmdb" },
        })
      }

      const sources = sourcesSchema.parse(
        await kinopoiskFetch(
          `/api/v2.2/films/${film.kinopoiskId}/external_sources?page=1`,
          apiKey
        )
      )
      const uniqueProviders = Array.from(
        new Map(
          sources.items.map((item) => [
            `${item.platform}:${new URL(item.url).hostname}`,
            {
              name: item.platform,
              url: item.url,
              logoUrl: item.logoUrl ?? null,
            },
          ])
        ).values()
      ).slice(0, 6)

      return Response.json({
        data: {
          providers: uniqueProviders,
          fallbackUrl,
          source: uniqueProviders.length > 0 ? "kinopoisk" : "tmdb",
        },
      })
    } catch {
      return Response.json({
        data: { providers: [], fallbackUrl, source: "tmdb" },
      })
    }
  } catch (error) {
    return jsonError(error)
  }
}
