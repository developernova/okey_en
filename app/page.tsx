import type { Metadata } from "next"

import { CatchEnglishLanding } from "@/components/catch-english-landing"

export const metadata: Metadata = {
  title: "Catch English — английский по коротким видео",
  description:
    "Смотри короткое видео, разбирай фразы из него и используй их в своих ответах. Обычно 20–30 минут. Бесплатно, без рекламы и серий.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Catch English — английский по коротким видео",
    description:
      "Видео, фразы и разговорная практика в одном плане. Бесплатно, без рекламы и серий.",
    url: "/",
    type: "website",
    locale: "ru_RU",
    siteName: "Catch English",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Catch English — смотри видео и говори по-английски",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Catch English — английский по коротким видео",
    description:
      "Видео, фразы и разговорная практика в одном плане. Бесплатно, без рекламы и серий.",
    images: ["/og.png"],
  },
}

export default function Page() {
  return <CatchEnglishLanding />
}
