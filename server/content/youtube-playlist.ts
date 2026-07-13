import { google, type youtube_v3 } from "googleapis"

import { env } from "@/server/config/env"
import { AppError } from "@/server/shared/errors"

export function extractYoutubePlaylistId(value: string) {
  if (/^[a-zA-Z0-9_-]{10,100}$/.test(value)) return value
  try {
    const playlistId = new URL(value).searchParams.get("list") ?? ""
    return /^[a-zA-Z0-9_-]{10,100}$/.test(playlistId) ? playlistId : ""
  } catch {
    return ""
  }
}

export function youtubeDurationSeconds(value: string | null | undefined) {
  if (!value) return 0
  const match = value.match(
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/
  )
  if (!match) return 0
  return Math.round(
    Number(match[1] ?? 0) * 86_400 +
      Number(match[2] ?? 0) * 3_600 +
      Number(match[3] ?? 0) * 60 +
      Number(match[4] ?? 0)
  )
}

function bestThumbnail(
  thumbnails: youtube_v3.Schema$ThumbnailDetails | undefined
) {
  return [
    thumbnails?.maxres,
    thumbnails?.standard,
    thumbnails?.high,
    thumbnails?.medium,
    thumbnails?.default,
  ].find((thumbnail) => thumbnail?.url)?.url
}

function youtubeClient() {
  const key = env().YOUTUBE_API_KEY
  if (!key) {
    throw new AppError(
      "Для импорта плейлиста добавь YOUTUBE_API_KEY в .env.local",
      503,
      "YOUTUBE_API_NOT_CONFIGURED"
    )
  }
  return google.youtube({ version: "v3", auth: key })
}

function youtubeError(error: unknown): never {
  const candidate = error as {
    message?: string
    response?: { status?: number; data?: { error?: { message?: string } } }
  }
  const status = candidate.response?.status
  throw new AppError(
    candidate.response?.data?.error?.message ??
      candidate.message ??
      "YouTube API request failed",
    status === 400 || status === 403 || status === 404 ? status : 502,
    "YOUTUBE_API_FAILED"
  )
}

export async function getYoutubePlaylist(value: string) {
  const playlistId = extractYoutubePlaylistId(value)
  if (!playlistId) {
    throw new AppError(
      "Некорректная ссылка или ID плейлиста YouTube",
      400,
      "INVALID_PLAYLIST_URL"
    )
  }

  const youtube = youtubeClient()
  try {
    const metadataResponse = await youtube.playlists.list({
      part: ["snippet"],
      id: [playlistId],
      maxResults: 1,
    })
    const metadata = metadataResponse.data.items?.[0]?.snippet
    if (!metadata) {
      throw new AppError("Плейлист не найден", 404, "PLAYLIST_NOT_FOUND")
    }

    const rawItems: youtube_v3.Schema$PlaylistItem[] = []
    let pageToken: string | undefined
    do {
      const response = await youtube.playlistItems.list({
        part: ["snippet", "status"],
        playlistId,
        maxResults: 50,
        pageToken,
      })
      rawItems.push(...(response.data.items ?? []))
      pageToken = response.data.nextPageToken ?? undefined
    } while (pageToken)

    const videoIds = rawItems
      .map((item) => item.snippet?.resourceId?.videoId)
      .filter((videoId): videoId is string => Boolean(videoId))
    const details = new Map<string, youtube_v3.Schema$Video>()
    for (let index = 0; index < videoIds.length; index += 50) {
      const response = await youtube.videos.list({
        part: ["contentDetails", "status"],
        id: videoIds.slice(index, index + 50),
        maxResults: 50,
      })
      for (const video of response.data.items ?? []) {
        if (video.id) details.set(video.id, video)
      }
    }

    return {
      id: playlistId,
      title: metadata.title ?? "YouTube playlist",
      description: metadata.description ?? "",
      channelTitle: metadata.channelTitle ?? null,
      items: rawItems
        .map((item, fallbackPosition) => {
          const snippet = item.snippet
          const videoId = snippet?.resourceId?.videoId ?? ""
          const detail = details.get(videoId)
          return {
            videoId,
            title: snippet?.title ?? "Без названия",
            description: snippet?.description ?? "",
            position: snippet?.position ?? fallbackPosition,
            thumbnailUrl: bestThumbnail(snippet?.thumbnails) ?? null,
            channelTitle: snippet?.videoOwnerChannelTitle ?? null,
            publishedAt: snippet?.publishedAt ?? null,
            durationSeconds: youtubeDurationSeconds(
              detail?.contentDetails?.duration
            ),
            hasCaptions: detail?.contentDetails?.caption === "true",
            privacyStatus:
              detail?.status?.privacyStatus ??
              item.status?.privacyStatus ??
              "unknown",
            embeddable: detail?.status?.embeddable ?? false,
            available: Boolean(detail),
          }
        })
        .filter(
          (item) =>
            item.videoId &&
            item.title !== "Deleted video" &&
            item.title !== "Private video"
        ),
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    youtubeError(error)
  }
}
