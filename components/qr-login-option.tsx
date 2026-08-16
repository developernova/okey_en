"use client"

import {
  Cancel01Icon,
  ComputerPhoneSyncIcon,
  Loading03Icon,
  QrCode01Icon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Image from "next/image"
import QRCode from "qrcode"
import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"

type Challenge = {
  qrUrl: string
  expiresAt: string
}

type Phase = "idle" | "loading" | "pending" | "expired" | "error"

function secondsLeft(expiresAt: string | undefined) {
  if (!expiresAt) return 0
  return Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1_000)
  )
}

function formattedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`
}

export function QrLoginOption() {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>("idle")
  const [challenge, setChallenge] = useState<Challenge>()
  const [qrImage, setQrImage] = useState<string>()
  const [remaining, setRemaining] = useState(0)

  const begin = useCallback(async () => {
    setOpen(true)
    setPhase("loading")
    setChallenge(undefined)
    setQrImage(undefined)

    try {
      const response = await fetch("/api/auth/qr/start", {
        method: "POST",
        headers: {
          "x-user-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      })
      if (!response.ok) throw new Error("start_failed")
      const payload = (await response.json()) as { data: Challenge }
      const image = await QRCode.toDataURL(payload.data.qrUrl, {
        width: 256,
        margin: 1,
        errorCorrectionLevel: "H",
        color: { dark: "#20211e", light: "#ffffff" },
      })
      setChallenge(payload.data)
      setQrImage(image)
      setRemaining(secondsLeft(payload.data.expiresAt))
      setPhase("pending")
    } catch {
      setPhase("error")
    }
  }, [])

  useEffect(() => {
    if (!open || phase !== "pending" || !challenge) return
    const update = () => {
      const next = secondsLeft(challenge.expiresAt)
      setRemaining(next)
      if (next === 0) setPhase("expired")
    }
    update()
    const timer = window.setInterval(update, 1_000)
    return () => window.clearInterval(timer)
  }, [challenge, open, phase])

  useEffect(() => {
    if (!open || phase !== "pending") return
    let stopped = false

    const poll = async () => {
      try {
        const response = await fetch("/api/auth/qr/status", {
          cache: "no-store",
          headers: {
            "x-user-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        })
        const payload = (await response.json()) as {
          data?: { status?: string }
        }
        if (stopped) return
        if (payload.data?.status === "authenticated") {
          window.location.assign("/my")
          return
        }
        if (response.status === 410 || payload.data?.status === "expired") {
          setPhase("expired")
        }
      } catch {
        // A short network interruption should not destroy an active QR request.
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 1_800)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [open, phase])

  const close = () => {
    setOpen(false)
    setPhase("idle")
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void begin()}
        className="mt-3 flex h-14 w-full items-center justify-between rounded-2xl border border-[#d8d8d1] bg-[#fafaf7] px-5 text-[15px] font-semibold text-[#343530] transition-colors hover:border-[#bfc2b8] hover:bg-[#f3f4ef] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#607b63]"
      >
        <span className="flex items-center gap-3">
          <HugeiconsIcon icon={QrCode01Icon} size={22} strokeWidth={1.8} />
          Войти по QR-коду
        </span>
        <HugeiconsIcon
          icon={ComputerPhoneSyncIcon}
          size={19}
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-[#20211e]/38 p-4 backdrop-blur-[5px]"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close()
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="qr-login-title"
              className="login-error relative w-full max-w-[420px] rounded-[28px] border border-white/70 bg-[#f7f6f2] p-5 text-center text-[#20211e] shadow-[0_28px_90px_rgba(24,25,22,0.28)] sm:p-7"
            >
              <button
                type="button"
                onClick={close}
                aria-label="Закрыть QR-код"
                className="absolute top-4 right-4 grid size-10 place-items-center rounded-full text-[#696a64] transition-colors hover:bg-[#e9e8e2] hover:text-[#20211e]"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={20}
                  strokeWidth={1.8}
                />
              </button>

              <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-[#e5ebe3] text-[#566c59]">
                <HugeiconsIcon
                  icon={QrCode01Icon}
                  size={23}
                  strokeWidth={1.8}
                />
              </div>
              <h2
                id="qr-login-title"
                className="mt-5 text-[26px] leading-tight font-semibold tracking-[-0.035em]"
              >
                Войти с телефона
              </h2>
              <p className="mx-auto mt-2 max-w-[310px] text-sm leading-6 text-[#686963]">
                Отсканируй код камерой телефона и подтверди вход в Catch
                English.
              </p>

              <div className="mx-auto mt-5 grid size-[256px] place-items-center overflow-hidden rounded-[24px] border border-[#deddd7] bg-white p-3 shadow-[0_12px_34px_rgba(32,33,30,0.07)]">
                {phase === "pending" && qrImage ? (
                  <Image
                    src={qrImage}
                    alt="QR-код для входа в Catch English"
                    width={232}
                    height={232}
                    unoptimized
                    className="size-full"
                  />
                ) : phase === "loading" ? (
                  <div className="flex flex-col items-center gap-3 text-sm text-[#686963]">
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={28}
                      strokeWidth={1.8}
                      className="animate-spin"
                    />
                    Создаём код
                  </div>
                ) : (
                  <div className="px-6">
                    <p className="text-sm leading-6 text-[#686963]">
                      {phase === "expired"
                        ? "Время этого кода закончилось."
                        : "Не удалось создать QR-код."}
                    </p>
                    <button
                      type="button"
                      onClick={() => void begin()}
                      className="mx-auto mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#20211e] px-4 text-sm font-semibold text-white"
                    >
                      <HugeiconsIcon
                        icon={Refresh01Icon}
                        size={18}
                        strokeWidth={1.8}
                      />
                      Новый код
                    </button>
                  </div>
                )}
              </div>

              {phase === "pending" && (
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#7a7b74]">
                  <span
                    className="size-1.5 rounded-full bg-[#6e9472]"
                    aria-hidden="true"
                  />
                  Ждём подтверждения на телефоне · {formattedTime(remaining)}
                </div>
              )}
            </section>
          </div>,
          document.body
        )}
    </>
  )
}
