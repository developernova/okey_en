import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import { QrLoginApproval } from "@/components/qr-login-approval"
import logoMark from "@/public/catch-english-mark.png"
import { validQrAuthToken } from "@/server/auth/qr-auth"

export const metadata: Metadata = {
  title: "Подтвердить вход — Catch English",
  robots: { index: false, follow: false },
}

export default async function QrLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ auth_error?: string }>
}) {
  const [{ token }, query] = await Promise.all([params, searchParams])
  if (!validQrAuthToken(token)) notFound()

  return (
    <main className="flex min-h-dvh flex-col bg-[#f7f6f2] px-5 text-[#20211e]">
      <header className="mx-auto flex w-full max-w-[480px] items-center justify-center py-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5"
          aria-label="Catch English"
        >
          <span
            className="grid size-9 place-items-center overflow-hidden"
            aria-hidden="true"
          >
            <Image
              src={logoMark}
              alt=""
              width={36}
              height={36}
              className="size-9 scale-[1.5] object-contain"
              priority
            />
          </span>
          <span
            lang="en"
            className="text-[15px] font-semibold tracking-[-0.02em]"
          >
            Catch English
          </span>
        </Link>
      </header>

      <div className="mx-auto grid w-full max-w-[420px] flex-1 place-items-center py-8">
        <section className="login-card-enter w-full rounded-[28px] border border-[#deddd7] bg-white/90 p-6 shadow-[0_24px_70px_rgba(32,33,30,0.09)] sm:p-8">
          <QrLoginApproval token={token} authError={query.auth_error} />
        </section>
      </div>

      <footer className="py-6 text-center text-xs text-[#7a7b74]">
        Catch English
      </footer>
    </main>
  )
}
