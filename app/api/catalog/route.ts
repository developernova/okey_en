import { eq } from "drizzle-orm"
import { z } from "zod"

import { getDb } from "@/db"
import { users } from "@/db/schema"
import { requireUserId } from "@/server/auth/user-context"
import { env } from "@/server/config/env"
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

type LearningLevel = "A2" | "B1" | "B2"
type CatalogItem = CatalogBaseItem & {
  learningLevel: LearningLevel
  recommended: boolean
}
type CatalogSeed = Omit<CatalogBaseItem, "genreIds">

const querySchema = z.object({
  query: z.string().trim().max(100).optional().default(""),
})

const tmdbItemSchema = z.object({
  id: z.number(),
  media_type: z.enum(["movie", "tv"]).optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  original_title: z.string().optional(),
  original_name: z.string().optional(),
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

const curated: CatalogSeed[] = [
  {
    id: "movie-862",
    tmdbId: 862,
    mediaType: "movie",
    section: "movies",
    title: "История игрушек",
    originalTitle: "Toy Story",
    overview:
      "Игрушки оживают, когда людей нет рядом, и учатся дружить после появления нового героя.",
    releaseYear: "1995",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/lxD5ak7BOoinRNehOCA85CQ8ubr.jpg",
    rating: 8.0,
    tmdbUrl: "https://www.themoviedb.org/movie/862",
  },
  {
    id: "movie-12",
    tmdbId: 12,
    mediaType: "movie",
    section: "movies",
    title: "В поисках Немо",
    originalTitle: "Finding Nemo",
    overview:
      "Рыба-клоун отправляется через океан на поиски сына и встречает новых друзей.",
    releaseYear: "2003",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/eHuGQ10FUzK1mdOY69wF5pGgEf5.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/eCynaAOgYYiw5yN5lBwz3IxqvaW.jpg",
    rating: 7.8,
    tmdbUrl: "https://www.themoviedb.org/movie/12",
  },
  {
    id: "movie-299534",
    tmdbId: 299534,
    mediaType: "movie",
    section: "marvel",
    title: "Мстители: Финал",
    originalTitle: "Avengers: Endgame",
    overview:
      "Оставшиеся Мстители собираются для последней попытки изменить исход войны с Таносом.",
    releaseYear: "2019",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
    rating: 8.2,
    tmdbUrl: "https://www.themoviedb.org/movie/299534",
  },
  {
    id: "movie-447365",
    tmdbId: 447365,
    mediaType: "movie",
    section: "marvel",
    title: "Стражи Галактики. Часть 3",
    originalTitle: "Guardians of the Galaxy Vol. 3",
    overview:
      "Питер Квилл снова собирает команду, чтобы защитить одного из своих и сохранить Стражей.",
    releaseYear: "2023",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/r2J02Z2OpNTctfOSN1Ydgii51I3.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/5YZbUmjbMa3ClvSW1Wj3D6XGolb.jpg",
    rating: 7.9,
    tmdbUrl: "https://www.themoviedb.org/movie/447365",
  },
  {
    id: "movie-634649",
    tmdbId: 634649,
    mediaType: "movie",
    section: "marvel",
    title: "Человек-паук: Нет пути домой",
    originalTitle: "Spider-Man: No Way Home",
    overview:
      "Питер Паркер просит Доктора Стрэнджа вернуть его тайну, но заклинание открывает мультивселенную.",
    releaseYear: "2021",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/14QbnygCuTO0vl7CAFmPf1fgZfV.jpg",
    rating: 7.9,
    tmdbUrl: "https://www.themoviedb.org/movie/634649",
  },
  {
    id: "movie-453395",
    tmdbId: 453395,
    mediaType: "movie",
    section: "marvel",
    title: "Доктор Стрэндж: В мультивселенной безумия",
    originalTitle: "Doctor Strange in the Multiverse of Madness",
    overview:
      "Доктор Стрэндж путешествует по опасным альтернативным реальностям вместе с новым союзником.",
    releaseYear: "2022",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/9Gtg2DzBhmYamXBS1hKAhiwbBKS.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/wcKFYIiVDvRURrzglV9kGu7fpfY.jpg",
    rating: 7.2,
    tmdbUrl: "https://www.themoviedb.org/movie/453395",
  },
  {
    id: "movie-27205",
    tmdbId: 27205,
    mediaType: "movie",
    section: "movies",
    title: "Начало",
    originalTitle: "Inception",
    overview:
      "Профессиональный вор проникает в сны и получает шанс стереть своё прошлое.",
    releaseYear: "2010",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/s3TBrRGB1iav7gFOCNx3H31MoES.jpg",
    rating: 8.4,
    tmdbUrl: "https://www.themoviedb.org/movie/27205",
  },
  {
    id: "movie-157336",
    tmdbId: 157336,
    mediaType: "movie",
    section: "movies",
    title: "Интерстеллар",
    originalTitle: "Interstellar",
    overview:
      "Команда исследователей отправляется через космический туннель в поисках нового дома для человечества.",
    releaseYear: "2014",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg",
    rating: 8.5,
    tmdbUrl: "https://www.themoviedb.org/movie/157336",
  },
  {
    id: "movie-13",
    tmdbId: 13,
    mediaType: "movie",
    section: "movies",
    title: "Форрест Гамп",
    originalTitle: "Forrest Gump",
    overview:
      "История доброго и искреннего человека, который неожиданно оказывается рядом с важнейшими событиями эпохи.",
    releaseYear: "1994",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/3h1JZGDhZ8nzxdgvkxha0qBqi05.jpg",
    rating: 8.5,
    tmdbUrl: "https://www.themoviedb.org/movie/13",
  },
  {
    id: "movie-603",
    tmdbId: 603,
    mediaType: "movie",
    section: "movies",
    title: "Матрица",
    originalTitle: "The Matrix",
    overview: "Хакер узнаёт, что привычный мир — тщательно созданная иллюзия.",
    releaseYear: "1999",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg",
    rating: 8.2,
    tmdbUrl: "https://www.themoviedb.org/movie/603",
  },
  {
    id: "tv-66732",
    tmdbId: 66732,
    mediaType: "tv",
    section: "series",
    title: "Очень странные дела",
    originalTitle: "Stranger Things",
    overview:
      "Исчезновение мальчика раскрывает тайные эксперименты и пугающую сверхъестественную силу.",
    releaseYear: "2016",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
    rating: 8.6,
    tmdbUrl: "https://www.themoviedb.org/tv/66732",
  },
  {
    id: "tv-119051",
    tmdbId: 119051,
    mediaType: "tv",
    section: "series",
    title: "Уэнсдэй",
    originalTitle: "Wednesday",
    overview:
      "Уэнсдэй Аддамс расследует загадочные преступления в академии Невермор.",
    releaseYear: "2022",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/9PFonBhy4cQy7Jz20NpMygczOkv.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
    rating: 8.4,
    tmdbUrl: "https://www.themoviedb.org/tv/119051",
  },
  {
    id: "tv-84958",
    tmdbId: 84958,
    mediaType: "tv",
    section: "series",
    title: "Локи",
    originalTitle: "Loki",
    overview:
      "Локи попадает в организацию, которая следит за временными линиями вселенной.",
    releaseYear: "2021",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/voHUmluYmKyleFkTu3lOXQG702u.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/kc4qf5Imjgb05i5u1hD8tcaM3w9.jpg",
    rating: 8.2,
    tmdbUrl: "https://www.themoviedb.org/tv/84958",
  },
  {
    id: "tv-19885",
    tmdbId: 19885,
    mediaType: "tv",
    section: "series",
    title: "Шерлок",
    originalTitle: "Sherlock",
    overview: "Современная версия историй о Шерлоке Холмсе и докторе Ватсоне.",
    releaseYear: "2010",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/7WTsnHkbA0FaG6R9twfFde0I9hl.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/u23G9KZREGJPpG2Z8OHkYH3oS7L.jpg",
    rating: 8.5,
    tmdbUrl: "https://www.themoviedb.org/tv/19885",
  },
]

const curatedGenres = new Map<number, number[]>([
  [862, [16, 35, 10751]],
  [12, [16, 10751]],
  [299534, [28, 12, 878]],
  [447365, [28, 12, 878]],
  [634649, [28, 12, 878]],
  [453395, [28, 12, 878]],
  [27205, [28, 12, 878]],
  [157336, [12, 18, 878]],
  [13, [35, 18, 10749]],
  [603, [28, 878]],
  [66732, [18, 10765, 9648]],
  [119051, [35, 10765, 9648]],
  [84958, [18, 10765]],
  [19885, [80, 18, 9648]],
])

function learningLevelFor(item: CatalogBaseItem): LearningLevel {
  if (item.genreIds.some((id) => id === 16 || id === 10751)) return "A2"
  if (item.genreIds.some((id) => [12, 28, 35, 10749].includes(id))) {
    return "B1"
  }
  return "B2"
}

function normalizedLearnerLevel(level: string | null): LearningLevel {
  if (level === "A1" || level === "A2") return "A2"
  if (level === "B1") return "B1"
  return "B2"
}

function personalize(
  items: CatalogBaseItem[],
  learnerLevel: LearningLevel
): CatalogItem[] {
  const rank: Record<LearningLevel, number> = { A2: 0, B1: 1, B2: 2 }
  return items.map((item) => {
    const learningLevel = learningLevelFor(item)
    const distance = rank[learnerLevel] - rank[learningLevel]
    return {
      ...item,
      learningLevel,
      recommended: distance >= 0 && distance <= 1,
    }
  })
}

const curatedCatalog: CatalogBaseItem[] = curated.map((item) => ({
  ...item,
  genreIds: curatedGenres.get(item.tmdbId) ?? [],
}))

function mapTmdbItem(
  raw: z.infer<typeof tmdbItemSchema>,
  section: CatalogSection,
  fallbackType?: MediaType
): CatalogBaseItem | null {
  const mediaType = raw.media_type ?? fallbackType
  if (!mediaType || !raw.poster_path) return null
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
      const normalized = query.toLocaleLowerCase("ru")
      const data = normalized
        ? curatedCatalog.filter((item) =>
            `${item.title} ${item.originalTitle}`
              .toLocaleLowerCase("ru")
              .includes(normalized)
          )
        : curatedCatalog
      return Response.json({
        data: personalize(data, learnerLevel),
        source: "curated",
        learnerLevel,
      })
    }

    if (query) {
      const data = await tmdbList(
        `/search/multi?query=${encodeURIComponent(query)}`,
        token,
        "search"
      )
      return Response.json({
        data: personalize(data.slice(0, 24), learnerLevel),
        source: "tmdb",
        learnerLevel,
      })
    }

    const [marvel, movies, series] = await Promise.all([
      tmdbList(
        "/discover/movie?with_companies=420&sort_by=popularity.desc&page=1",
        token,
        "marvel",
        "movie"
      ),
      tmdbList("/trending/movie/week?page=1", token, "movies", "movie"),
      tmdbList("/trending/tv/week?page=1", token, "series", "tv"),
    ])
    return Response.json({
      data: personalize(
        [...marvel.slice(0, 8), ...movies.slice(0, 8), ...series.slice(0, 8)],
        learnerLevel
      ),
      source: "tmdb",
      learnerLevel,
    })
  } catch (error) {
    return jsonError(error)
  }
}
