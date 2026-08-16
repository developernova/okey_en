import type { Metadata } from "next"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cards01Icon,
  Mic02Icon,
  SecurityCheckIcon,
  TelegramIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Image from "next/image"

import logoMark from "@/public/catch-english-mark.png"

export const metadata: Metadata = {
  title: "Войти в Catch English",
  description:
    "Продолжить в Catch English через Telegram без отдельной регистрации и пароля.",
  robots: {
    index: false,
    follow: false,
  },
}

function Icon({
  icon,
  size = 20,
}: {
  icon: typeof TelegramIcon
  size?: number
}) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
    />
  )
}

function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-9 place-items-center overflow-hidden" aria-hidden="true">
        <Image
          src={logoMark}
          alt=""
          width={36}
          height={36}
          className="size-9 scale-[1.5] object-contain"
          priority
        />
      </span>
      <span lang="en" className="text-[15px] font-semibold tracking-[-0.02em]">
        Catch English
      </span>
    </span>
  )
}

function authErrorMessage(error?: string) {
  if (!error) return null
  return error === "cancelled"
    ? "Вход через Telegram был отменён. Можно попробовать ещё раз."
    : "Не удалось войти через Telegram. Попробуй ещё раз."
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>
}) {
  const params = await searchParams
  const error = authErrorMessage(params.auth_error)

  return (
    <main className="login-page flex min-h-dvh flex-col overflow-hidden bg-[#f7f6f2] text-[#20211e]">
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10 lg:py-6">
        <a href="/landing" aria-label="Catch English — на главную">
          <Brand />
        </a>
        <a
          href="/landing"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#62635d] transition-colors hover:text-[#20211e]"
        >
          <Icon icon={ArrowLeft01Icon} size={17} />
          На главную
        </a>
      </header>

      <div className="mx-auto grid w-full max-w-[1180px] flex-1 items-center gap-8 px-5 py-6 sm:gap-12 sm:px-8 sm:py-10 lg:grid-cols-[1fr_440px] lg:gap-16 lg:px-10 lg:py-8 xl:gap-24">
        <section className="login-story-copy login-card-enter max-w-[620px]">
          <p className="text-xs font-semibold tracking-[0.08em] text-[#566c59] uppercase">
            Вход в аккаунт
          </p>
          <h1 className="mt-4 text-[44px] leading-[1.01] font-semibold tracking-[-0.052em] text-balance sm:text-[58px] lg:text-[64px]">
            Продолжи с того места, где остановился.
          </h1>
          <p className="mt-5 max-w-[560px] text-[16px] leading-7 text-[#686963] sm:text-[17px]">
            Уровень, сохранённые фразы и выполненные практики останутся с тобой
            на любом устройстве.
          </p>

          <div className="login-phrase-flow relative mt-9 hidden max-w-[560px] sm:block">
            <div className="relative z-10 flex items-end gap-3">
              <div className="rotate-[-1deg] rounded-[18px] border border-[#d8c98e] bg-[#f0e7b8] px-5 py-4 shadow-[0_14px_34px_rgba(60,55,36,0.1)]">
                <p className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.08em] text-[#74683d] uppercase">
                  <Icon icon={Cards01Icon} size={15} />
                  Сохранённая фраза
                </p>
                <p lang="en" className="mt-2 text-xl font-semibold tracking-[-0.025em]">
                  figure it out
                </p>
              </div>
              <div className="mb-[-18px] flex-1 rounded-[20px] border border-[#deddd7] bg-white/90 p-4 shadow-[0_18px_45px_rgba(32,33,30,0.07)]">
                <p className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.08em] text-[#566c59] uppercase">
                  <Icon icon={Mic02Icon} size={15} />
                  Последний ответ
                </p>
                <p lang="en" className="mt-2.5 text-sm font-medium">
                  We can figure it out together.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="login-content"
          className="login-card-enter login-auth-card-enter rounded-[28px] border border-[#deddd7] bg-white/86 p-5 shadow-[0_24px_70px_rgba(32,33,30,0.09)] backdrop-blur-sm sm:p-7"
        >
          <div className="grid size-11 place-items-center rounded-2xl bg-[#e6f3f9] text-[#1687bc]">
            <Icon icon={TelegramIcon} size={23} />
          </div>

          <h2 className="mt-7 text-[30px] leading-[1.08] font-semibold tracking-[-0.04em]">
            Войти через Telegram
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#686963]">
            Откроем Telegram, ты подтвердишь аккаунт и сразу вернёшься в Catch
            English.
          </p>

          {error && (
            <div
              role="alert"
              className="login-error mt-5 rounded-2xl border border-[#d9b9b2] bg-[#f8ece9] p-4 text-sm leading-6 text-[#7b463d]"
            >
              {error}
            </div>
          )}

          <a
            href="/api/auth/telegram/web/start"
            className="login-telegram-button mt-7 flex h-14 w-full items-center justify-between rounded-2xl bg-[#229ed9] px-5 text-[15px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#229ed9]"
          >
            <span className="flex items-center gap-3">
              <Icon icon={TelegramIcon} size={22} />
              Продолжить
            </span>
            <Icon icon={ArrowRight01Icon} size={19} />
          </a>

          <div className="mt-5 flex items-start gap-3 text-xs leading-5 text-[#686963]">
            <span className="mt-0.5 text-[#607b63]">
              <Icon icon={SecurityCheckIcon} size={18} />
            </span>
            <p>
              Telegram нужен только для входа. Catch English не получает доступ
              к переписке.
            </p>
          </div>

        </section>
      </div>

      <footer className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs text-[#7a7b74] sm:px-8 lg:px-10">
        <span>{new Date().getFullYear()} Catch English</span>
        <a className="hover:text-[#20211e]" href="/privacy">
          Конфиденциальность
        </a>
      </footer>
    </main>
  )
}
