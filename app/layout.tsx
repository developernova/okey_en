import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import Script from "next/script"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import { publicAppOrigin } from "@/server/config/public-app-url"

const inter = Inter({ subsets: ["cyrillic", "latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  metadataBase: new URL(publicAppOrigin()),
  title: "Catch English — английский по коротким видео",
  description:
    "Короткие видео по уровню, фразы в контексте и разговорная практика. Обычно 20–30 минут. Бесплатно, без рекламы и серий.",
  icons: {
    icon: "/catch-english-mark.png",
    apple: "/catch-english-mark.png",
  },
  openGraph: {
    title: "Catch English — английский по коротким видео",
    description:
      "Видео, фразы и разговорная практика в одном плане. Бесплатно, без рекламы и серий.",
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className={cn("antialiased", inter.variable, fontMono.variable)}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  )
}
