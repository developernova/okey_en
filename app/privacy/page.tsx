import type { Metadata } from "next"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export const metadata: Metadata = {
  title: "Как Catch English использует данные",
  description:
    "Какие данные нужны Catch English для входа, учебного прогресса, обратной связи и напоминаний.",
  alternates: {
    canonical: "/privacy",
  },
}

const sections = [
  {
    title: "Какие данные нужны приложению",
    body: [
      "Для входа Catch English получает от Telegram идентификатор аккаунта и те данные профиля, которые Telegram передаёт с твоего согласия: имя, username, язык и фотографию, если они доступны.",
      "Для обучения сохраняются выбранный уровень и темы, знакомые фразы, история повторений, выполненные планы и настройки напоминаний.",
    ],
  },
  {
    title: "Ответы и голос",
    body: [
      "Текстовые ответы используются, чтобы продолжить разговор и дать короткую языковую обратную связь. Они могут передаваться AI-провайдеру вместе с вопросом и контекстом видео.",
      "Если ты отправляешь голосовой ответ, аудио передаётся сервису распознавания речи. Catch English использует полученную расшифровку и не сохраняет сам голосовой файл в своей базе.",
    ],
  },
  {
    title: "Зачем это нужно",
    body: [
      "Данные используются только для входа, синхронизации прогресса между устройствами, составления учебного плана, повторения фраз, разговорной практики, напоминаний и защиты аккаунта.",
      "Catch English не строит бесконечную ленту и не использует учебную активность для рекламного профилирования.",
    ],
  },
  {
    title: "Внешние сервисы",
    body: [
      "Telegram используется для входа и, только после включения пользователем, для напоминаний. OpenAI обрабатывает текстовые учебные запросы, а OpenRouter — голосовые записи для транскрибации. Видео открываются с платформы, на которой их опубликовал автор.",
      "У каждого внешнего сервиса действуют собственные условия обработки данных. Не отправляй в учебных ответах пароли, документы, платёжные данные и другую чувствительную информацию.",
    ],
  },
]

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-[#f7f6f2] px-5 py-10 text-[#20211e] sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[820px]">
        <a
          href="/landing"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#566c59] hover:text-[#20211e]"
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            size={16}
            strokeWidth={1.8}
            aria-hidden="true"
            focusable="false"
          />
          Catch English
        </a>
        <h1 className="mt-14 text-[40px] leading-[1.04] font-semibold tracking-[-0.045em] sm:text-[56px]">
          Как мы используем данные
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[#62635d]">
          Коротко и без юридической маскировки: что получает текущая версия
          Catch English и зачем это нужно для работы продукта.
        </p>

        <div className="mt-14 divide-y divide-[#d9d9d3] border-y border-[#d9d9d3]">
          {sections.map((section) => (
            <section key={section.title} className="py-8 sm:grid sm:grid-cols-[220px_1fr] sm:gap-10">
              <h2 className="text-lg font-semibold tracking-[-0.02em]">
                {section.title}
              </h2>
              <div className="mt-4 space-y-4 text-sm leading-6 text-[#62635d] sm:mt-0">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-12 rounded-2xl bg-[#e9efe8] p-6 text-sm leading-6 text-[#596159]">
          <h2 className="font-semibold text-[#20211e]">
            Контакты и удаление данных
          </h2>
          <p className="mt-2">
            По вопросам обработки данных, приватности и работы сервиса напиши на{" "}
            <a
              href="mailto:admin@dakhe.ru"
              className="font-semibold text-[#36583b] underline decoration-[#9fb2a1] underline-offset-4 hover:text-[#20211e]"
            >
              admin@dakhe.ru
            </a>
            .
          </p>
          <p className="mt-3">
            Через этот же адрес можно запросить удаление аккаунта и связанной с
            ним учебной истории. Укажи Telegram username, привязанный к аккаунту;
            при необходимости мы попросим подтвердить владение им.
          </p>
        </section>

        <p className="mt-10 text-xs text-[#686963]">
          Обновлено 16 августа 2026 года.
        </p>
      </div>
    </main>
  )
}
