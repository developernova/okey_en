import {
  AudioWaveformIcon,
  ArrowRight01Icon,
  Cards01Icon,
  Chat01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Mic02Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Image from "next/image"

import { LandingMotion } from "@/components/landing-motion"
import logoMark from "@/public/catch-english-mark.png"

const steps = [
  {
    icon: Video01Icon,
    title: "Одно короткое видео",
    text: "Смотри живой английский, подобранный так, чтобы большая часть речи уже была понятна.",
    meta: "10–15 минут",
  },
  {
    icon: Cards01Icon,
    title: "5–7 полезных фраз",
    text: "Разбери только те выражения, которые прозвучали в видео и пригодятся в обычной речи.",
    meta: "около 6 минут",
  },
  {
    icon: Chat01Icon,
    title: "Три ответа голосом",
    text: "Ответь на вопросы по теме, используй новые фразы и получи короткую языковую поправку.",
    meta: "около 5 минут",
  },
]

function Icon({
  icon,
  size = 20,
}: {
  icon: typeof Video01Icon
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

function Logo() {
  return (
    <span className="landing-logo inline-flex items-center gap-2.5">
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
      <span
        lang="en"
        className="text-[15px] font-semibold tracking-[-0.02em]"
      >
        Catch English
      </span>
    </span>
  )
}

function StartLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="/login"
      className={`landing-cta inline-flex items-center justify-center whitespace-nowrap rounded-xl bg-[#1f211e] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1f211e] ${
        compact ? "h-11 px-5 text-sm" : "h-13 px-6 text-[15px]"
      }`}
    >
      Начать бесплатно
      <span className="landing-cta-arrow ml-2.5" aria-hidden="true">
        <Icon icon={ArrowRight01Icon} size={17} />
      </span>
    </a>
  )
}

function PracticeFlow() {
  return (
    <div className="landing-flow-scene relative mx-auto w-full max-w-[560px] py-5 sm:px-4">
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4 border-b border-[#d9d9d3] pb-4 text-xs text-[#6c6d67]">
          <p className="flex items-center gap-2 font-semibold text-[#4f6252]">
            <Icon icon={Chat01Icon} size={17} />
            Практика речи
          </p>
          <p>Шаг 3 из 3</p>
        </div>

        <div className="landing-phrase-bridge mt-7 w-fit max-w-[310px] rotate-[-1deg] rounded-[18px] border border-[#d8c98e] bg-[#f0e7b8] px-5 py-4 text-[#2d3029] shadow-[0_14px_34px_rgba(60,55,36,0.11)]">
          <p className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.08em] text-[#74683d] uppercase">
            <Icon icon={Cards01Icon} size={15} />
            Фраза из видео
          </p>
          <p lang="en" className="mt-2 text-[25px] font-semibold tracking-[-0.035em]">
            figure it out
          </p>
          <p className="mt-1 text-xs text-[#74683d]">разобраться, найти решение</p>
        </div>

        <div className="landing-practice-answer relative mt-[-10px] ml-auto max-w-[500px] rounded-[24px] border border-[#deddd7] bg-white/92 p-5 shadow-[0_20px_55px_rgba(32,33,30,0.09)] sm:p-6">
          <div className="flex items-center justify-between gap-4 text-[#566c59]">
            <p className="flex items-center gap-2 text-xs font-semibold">
              <Icon icon={Mic02Icon} size={18} />
              Твой голосовой ответ
            </p>
            <span className="landing-waveform">
              <Icon icon={AudioWaveformIcon} size={25} />
            </span>
          </div>
          <p lang="en" className="mt-5 text-[21px] leading-[1.42] font-medium tracking-[-0.02em] sm:text-[24px]">
            We can{" "}
            <span className="landing-phrase-highlight rounded-md px-1.5 text-[#2d3029]">
              figure it out
            </span>{" "}
            together.
          </p>
        </div>

        <div className="landing-practice-feedback mt-4 ml-auto max-w-[430px] border-l-2 border-[#829784] py-2 pl-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-[#566c59]">
            <Icon icon={CheckmarkCircle02Icon} size={18} />
            Звучит естественно
          </p>
          <p className="mt-1.5 text-xs leading-5 text-[#6c6d67]">
            Новая фраза уже появилась в твоей собственной речи.
          </p>
        </div>

        <div className="relative mt-8 grid grid-cols-3 gap-3 text-center text-[11px] font-medium text-[#686963]">
          <div className="absolute top-[17px] right-[16%] left-[16%] h-px bg-[#d6d7d0]" aria-hidden="true" />
          {[
            { icon: Video01Icon, label: "Посмотрел" },
            { icon: Cards01Icon, label: "Разобрал фразу" },
            { icon: Mic02Icon, label: "Сказал сам" },
          ].map((item) => (
            <div key={item.label} className="relative z-10 flex flex-col items-center gap-2">
              <span className="grid size-9 place-items-center rounded-full border border-[#d6d7d0] bg-[#f7f6f2] text-[#607763]">
                <Icon icon={item.icon} size={17} />
              </span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CatchEnglishLanding({ authError }: { authError?: string | null }) {
  return (
    <div data-landing-root className="min-h-dvh bg-[#f7f6f2] text-[#20211e] selection:bg-[#b6c7b7]">
      <LandingMotion />
      <a className="landing-skip-link" href="#main-content">
        К содержанию
      </a>
      <header className="landing-header-enter fixed inset-x-0 top-0 z-50 border-b border-[#deddd7]/70 bg-[#f7f6f2]/88 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <a href="#top" aria-label="Catch English — наверх">
            <Logo />
          </a>
          <nav
            aria-label="Основная навигация"
            className="hidden items-center gap-7 text-sm text-[#62635d] md:flex"
          >
            <a className="landing-nav-link hover:text-[#20211e]" href="#how">
              Как работает
            </a>
            <a className="landing-nav-link hover:text-[#20211e]" href="#approach">
              Наш принцип
            </a>
            <a
              className="landing-nav-link hover:text-[#20211e]"
              href="/login"
            >
              Войти
            </a>
          </nav>
          <div className="hidden sm:block">
            <StartLink compact />
          </div>
          <a
            href="/login"
            className="text-sm font-semibold sm:hidden"
          >
            Войти
          </a>
        </div>
      </header>

      <main id="main-content" className="overflow-x-clip">
      <section
        id="top"
        className="landing-hero mx-auto grid min-h-dvh w-full max-w-[1240px] scroll-mt-20 items-center gap-12 px-5 pt-28 pb-16 sm:px-8 sm:pt-32 lg:grid-cols-[0.88fr_1.12fr] lg:gap-14 lg:px-10 lg:pt-24 lg:pb-10 xl:gap-20"
      >
        <div className="landing-enter max-w-[590px]">
          <p className="mb-5 flex items-center gap-2 text-xs font-semibold text-[#566c59]">
            <Icon icon={Clock01Icon} size={16} />
            20–30 минут на весь план
          </p>
          <h1 className="hyphens-none text-[46px] leading-[1] font-semibold tracking-[-0.055em] text-balance sm:text-[60px] lg:text-[64px] xl:text-[70px]">
            Смотри короткие видео. Отвечай на английском.
          </h1>
          <p className="mt-6 max-w-[540px] text-[17px] leading-7 text-[#686963]">
            Catch English подбирает видео под твой уровень, показывает полезные
            фразы из него и просит ответить голосом. Всё связано одной темой и
            заканчивается за один подход.
          </p>
          {authError && (
            <p className="mt-5 max-w-[540px] rounded-2xl border border-red-900/10 bg-red-900/5 p-4 text-sm text-red-800">
              {authError}
            </p>
          )}
          <div className="mt-8">
            <StartLink />
          </div>
          <p className="mt-4 text-xs leading-5 text-[#686963]">
            Бесплатно. Без рекламы, серий и платной стены.
          </p>
        </div>

        <div className="landing-canvas-enter">
          <PracticeFlow />
        </div>
      </section>

      <section
        id="how"
        className="mx-auto w-full max-w-[1240px] scroll-mt-20 border-t border-[#deddd7] px-5 py-24 sm:px-8 lg:px-10 lg:py-32"
      >
        <div className="max-w-2xl" data-landing-reveal>
          <p className="text-sm font-semibold text-[#566c59]">Как проходит практика</p>
          <h2 className="mt-3 text-[36px] leading-[1.06] font-semibold tracking-[-0.045em] sm:text-[48px]">
            Фразы из видео сразу переходят в твои ответы
          </h2>
          <p className="mt-5 text-base leading-7 text-[#6c6d67]">
            Сначала ты слышишь выражение в контексте. Потом видишь перевод и
            исходную реплику. В конце отвечаешь на вопрос и пробуешь сказать эту
            фразу сам.
          </p>
        </div>

        <div className="mt-12 grid border-y border-[#d9d9d3] xl:grid-cols-3">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className={`py-8 xl:px-8 xl:py-10 xl:first:pl-0 xl:last:pr-0 ${index > 0 ? "border-t border-[#d9d9d3] xl:border-t-0 xl:border-l" : ""}`}
              data-landing-reveal
              data-reveal-delay={index}
            >
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-2xl bg-[#edf2ec] text-[#607763]">
                  <Icon icon={step.icon} size={21} />
                </span>
                <span className="text-xs font-medium text-[#686963]">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-8 text-xl font-semibold tracking-[-0.025em]">
                {step.title}
              </h3>
              <p className="mt-3 min-h-12 text-sm leading-6 text-[#70716b]">
                {step.text}
              </p>
              <p className="mt-7 inline-flex items-center gap-1.5 text-xs font-medium text-[#686963]">
                <Icon icon={Clock01Icon} size={14} /> {step.meta}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="approach" className="scroll-mt-20 bg-[#e9efe8]">
        <div className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:px-10 lg:py-28">
          <div data-landing-reveal>
            <p className="text-sm font-semibold text-[#566c59]">Наш принцип</p>
            <h2 className="mt-3 max-w-[1040px] text-[38px] leading-[1.04] font-semibold tracking-[-0.045em] text-balance sm:text-[50px] lg:text-[56px]">
              Мы не хотим удержать тебя. Мы хотим, чтобы английский остался с тобой.
            </h2>
          </div>

          <div className="mt-14 grid gap-12 xl:grid-cols-[0.72fr_1.28fr] xl:gap-20">
            <p
              className="max-w-xl text-base leading-7 text-[#596159]"
              data-landing-reveal
            >
              Поэтому здесь нет бесконечной ленты и заданий ради счётчика. Ты
              проходишь план на день, получаешь пользу и спокойно закрываешь
              приложение.
            </p>

            <div className="divide-y divide-[#cbd7ca] border-y border-[#cbd7ca]">
              {[
                {
                  title: "На сегодня всё",
                  text: "После выполненного плана не появляется новая лента заданий.",
                },
                {
                  title: "Без платной стены",
                  text: "Видео, фразы и разговор доступны целиком.",
                },
                {
                  title: "Только нужные повторения",
                  text: "Знакомые фразы можно убрать и больше к ним не возвращаться.",
                },
                {
                  title: "Без серий",
                  text: "Пропущенный день ничего не обнуляет.",
                },
              ].map((item, index) => (
                <article
                  key={item.title}
                  className="grid grid-cols-[auto_1fr] gap-4 py-5"
                  data-landing-reveal
                  data-reveal-delay={index}
                >
                  <span className="text-[#607b63]">
                    <Icon icon={CheckmarkCircle02Icon} size={21} />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-[#596159]">
                      {item.text}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[1240px] items-center gap-12 px-5 py-24 sm:px-8 lg:px-10 lg:py-32 xl:grid-cols-2 xl:gap-20">
        <div className="rounded-[28px] border border-[#deddd7] bg-white p-5 shadow-[0_18px_55px_rgba(40,43,36,0.08)] sm:p-7" data-landing-reveal>
          <div className="flex items-center justify-between text-xs text-[#686963]">
            <span>Повторение фраз</span>
            <span>7 из 15</span>
          </div>
          <div className="py-12 text-center">
            <p lang="en" className="text-[30px] font-semibold tracking-[-0.035em]">
              from now on
            </p>
            <p className="mt-3 text-sm text-[#6f706a]">отныне, с этого момента</p>
          </div>
          <div className="rounded-2xl bg-[#f1f0eb] p-4 text-sm leading-6 text-[#5f605a]">
            <span lang="en">
              “We need to make some changes <strong>from now on</strong>.”
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-semibold">
            <span className="rounded-xl bg-[#f1e4e1] px-2 py-3 text-[#85564e]">Не вспомнил</span>
            <span className="rounded-xl bg-[#eee8d4] px-2 py-3 text-[#74683d]">Почти</span>
            <span className="rounded-xl bg-[#deeadf] px-2 py-3 text-[#46694b]">Вспомнил</span>
          </div>
        </div>
        <div data-landing-reveal>
          <p className="text-sm font-semibold text-[#566c59]">Фразы из видео</p>
          <h2 className="mt-3 text-[36px] leading-[1.06] font-semibold tracking-[-0.045em] sm:text-[48px]">
            Фразы запоминаются, когда за ними есть смысл
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#6c6d67]">
            Вместе с переводом остаётся исходная реплика и момент из видео. Ты
            вспоминаешь не отдельные слова, а ситуацию — и легче переносишь
            выражение в свою речь.
          </p>
        </div>
      </section>

      <section className="border-t border-[#deddd7] px-5 py-24 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-[760px] text-center" data-landing-reveal>
          <h2 className="mx-auto max-w-2xl text-[36px] leading-[1.05] font-semibold tracking-[-0.045em] sm:text-[48px]">
            Начни с одного видео
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#6c6d67] sm:text-base">
            Посмотри видео, разбери фразы и ответь на вопросы по теме. Без карты,
            пробного периода и скрытых ограничений.
          </p>
          <div className="mt-8">
            <a
              href="/login"
              className="landing-cta inline-flex h-13 items-center justify-center whitespace-nowrap rounded-xl bg-[#20211e] px-6 text-[15px] font-semibold text-white"
            >
              Начать бесплатно
              <span className="landing-cta-arrow ml-2.5" aria-hidden="true">
                <Icon icon={ArrowRight01Icon} size={17} />
              </span>
            </a>
          </div>
          <p className="mt-4 text-xs text-[#686963]">
            Вход через Telegram — без отдельного пароля.
          </p>
        </div>
      </section>
      </main>

      <footer className="border-t border-[#deddd7] bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-5 py-7 text-xs text-[#666760] sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <Logo />
          <p>Видео, фразы и разговор — в одной практике.</p>
          <nav aria-label="Служебные ссылки" className="flex flex-wrap items-center gap-4">
            <a className="hover:text-[#20211e]" href="/privacy">
              Конфиденциальность
            </a>
            <a className="hover:text-[#20211e]" href="/login">
              Войти
            </a>
            <span>{new Date().getFullYear()} Catch English</span>
          </nav>
        </div>
      </footer>
    </div>
  )
}
