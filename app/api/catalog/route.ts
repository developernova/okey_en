import { eq } from "drizzle-orm"
import { z } from "zod"

import { getDb } from "@/db"
import { users } from "@/db/schema"
import { requireUserId } from "@/server/auth/user-context"
import {
  catalogLanguageProfileMap,
  type CatalogLanguageInput,
  type CatalogLanguageProfile,
  type CatalogLearningLevel,
} from "@/server/catalog/language-profile"
import { env } from "@/server/config/env"
import { AppError } from "@/server/shared/errors"
import { jsonError } from "@/server/shared/http"

type MediaType = "movie" | "tv"
type CatalogSection = "marvel" | "movies" | "series" | "search"

type CatalogBaseItem = {
  id: string
  tmdbId: number
  mediaType: MediaType
  section: CatalogSection
  title: string
  originalTitle: string
  overview: string
  releaseYear: string
  posterUrl: string
  backdropUrl: string | null
  rating: number
  tmdbUrl: string
  genreIds: number[]
}

type CatalogItem = CatalogBaseItem &
  CatalogLanguageProfile & {
    recommended: boolean
  }

const querySchema = z.object({
  query: z.string().trim().max(100).optional().default(""),
})

const tmdbItemSchema = z.object({
  id: z.number(),
  media_type: z.enum(["movie", "tv", "person"]).optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  original_title: z.string().optional(),
  original_name: z.string().optional(),
  original_language: z.string().optional(),
  overview: z.string().optional().default(""),
  release_date: z.string().optional(),
  first_air_date: z.string().optional(),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  vote_average: z.number().optional().default(0),
  genre_ids: z.array(z.number()).optional().default([]),
})

const tmdbListSchema = z.object({
  results: z.array(tmdbItemSchema),
})

const genreNames = new Map<number, string>([
  [12, "adventure"],
  [14, "fantasy"],
  [16, "animation"],
  [18, "drama"],
  [27, "horror"],
  [28, "action"],
  [35, "comedy"],
  [36, "history"],
  [37, "western"],
  [53, "thriller"],
  [80, "crime"],
  [99, "documentary"],
  [878, "science fiction"],
  [9648, "mystery"],
  [10402, "music"],
  [10749, "romance"],
  [10751, "family"],
  [10752, "war"],
  [10759, "action and adventure"],
  [10762, "kids"],
  [10763, "news"],
  [10764, "reality"],
  [10765, "science fiction and fantasy"],
  [10766, "soap"],
  [10767, "talk"],
  [10768, "war and politics"],
])

function normalizedLearnerLevel(level: string | null): CatalogLearningLevel {
  if (level === "A1" || level === "A2") return "A2"
  if (level === "B1") return "B1"
  if (level === "B2") return "B2"
  return "C1"
}

function isRecommended(
  titleLevel: CatalogLearningLevel,
  learnerLevel: CatalogLearningLevel
) {
  const rank: Record<CatalogLearningLevel, number> = {
    A2: 0,
    B1: 1,
    B2: 2,
    C1: 3,
  }
  const distance = rank[learnerLevel] - rank[titleLevel]
  return distance >= 0 && distance <= 1
}

function mapTmdbItem(
  raw: z.infer<typeof tmdbItemSchema>,
  section: CatalogSection,
  fallbackType?: MediaType
): CatalogBaseItem | null {
  const mediaType = raw.media_type ?? fallbackType
  if (
    (mediaType !== "movie" && mediaType !== "tv") ||
    !raw.poster_path ||
    raw.original_language !== "en"
  ) {
    return null
  }
  const title = raw.title ?? raw.name
  const originalTitle = raw.original_title ?? raw.original_name ?? title
  if (!title || !originalTitle) return null
  const releaseDate = raw.release_date ?? raw.first_air_date ?? ""
  return {
    id: `${mediaType}-${raw.id}`,
    tmdbId: raw.id,
    mediaType,
    section,
    title,
    originalTitle,
    overview: raw.overview,
    releaseYear: releaseDate.slice(0, 4),
    posterUrl: `https://image.tmdb.org/t/p/w500${raw.poster_path}`,
    backdropUrl: raw.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${raw.backdrop_path}`
      : null,
    rating: Math.round(raw.vote_average * 10) / 10,
    tmdbUrl: `https://www.themoviedb.org/${mediaType}/${raw.id}`,
    genreIds: raw.genre_ids,
  }
}

async function tmdbList(
  path: string,
  token: string,
  section: CatalogSection,
  fallbackType?: MediaType
) {
  const separator = path.includes("?") ? "&" : "?"
  const response = await fetch(
    `https://api.themoviedb.org/3${path}${separator}language=ru-RU&include_adult=false`,
    {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 3600 },
    }
  )
  if (!response.ok) throw new Error(`TMDB returned ${response.status}`)
  return tmdbListSchema
    .parse(await response.json())
    .results.map((item) => mapTmdbItem(item, section, fallbackType))
    .filter((item): item is CatalogBaseItem => item !== null)
}

function uniqueTitles(items: CatalogBaseItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function languageInput(item: CatalogBaseItem): CatalogLanguageInput {
  return {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    originalTitle: item.originalTitle,
    overview: item.overview,
    releaseYear: item.releaseYear,
    genreNames: item.genreIds
      .map((id) => genreNames.get(id))
      .filter((name): name is string => Boolean(name)),
  }
}

async function enrichCatalog(
  items: CatalogBaseItem[],
  learnerLevel: CatalogLearningLevel
) {
  const profiles = await catalogLanguageProfileMap(items.map(languageInput))
  return items.map<CatalogItem>((item) => {
    const profile = profiles.get(item.id)
    if (!profile) {
      throw new AppError(
        "Не удалось получить оценку сложности фильма",
        502,
        "CATALOG_PROFILE_MISSING"
      )
    }
    return {
      ...item,
      ...profile,
      recommended: isRecommended(profile.learningLevel, learnerLevel),
    }
  })
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request)
    const [learner] = await getDb()
      .select({ levelEstimate: users.levelEstimate })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const learnerLevel = normalizedLearnerLevel(learner?.levelEstimate ?? null)
    const url = new URL(request.url)
    const { query } = querySchema.parse({
      query: url.searchParams.get("query") ?? "",
    })
    const token = env().TMDB_API_READ_TOKEN
    if (!token) {
      throw new AppError(
        "Каталог фильмов не настроен",
        503,
        "TMDB_NOT_CONFIGURED"
      )
    }

    if (query) {
      const items = uniqueTitles(
        (
          await tmdbList(
            `/search/multi?query=${encodeURIComponent(query)}`,
            token,
            "search"
          )
        ).slice(0, 24)
      )
      return Response.json({
        data: await enrichCatalog(items, learnerLevel),
        source: "tmdb_ai",
        learnerLevel,
      })
    }

    const [marvel, movies, series] = await Promise.all([
      tmdbList(
        "/discover/movie?with_companies=420&with_original_language=en&sort_by=popularity.desc&page=1",
        token,
        "marvel",
        "movie"
      ),
      tmdbList("/trending/movie/week?page=1", token, "movies", "movie"),
      tmdbList("/trending/tv/week?page=1", token, "series", "tv"),
    ])
    const items = uniqueTitles([
      ...marvel.slice(0, 8),
      ...movies.slice(0, 8),
      ...series.slice(0, 8),
    ])
    return Response.json({
      data: await enrichCatalog(items, learnerLevel),
      source: "tmdb_ai",
      learnerLevel,
    })
  } catch (error) {
    return jsonError(error)
  }
}
