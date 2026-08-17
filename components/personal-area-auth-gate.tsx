"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { clearLearnerClientState } from "@/lib/learner-client-state"
import {
  getTelegramWebApp,
  removeTelegramCloudFlag,
  telegramFetch,
} from "@/lib/telegram"

type PersonalAreaSession = {
  onboardingCompleted: boolean
}

const PersonalAreaSessionContext =
  React.createContext<PersonalAreaSession | null>(null)

export function PersonalAreaAuthGate({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [session, setSession] = React.useState<PersonalAreaSession | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const check = async () => {
      await Promise.resolve()
      if (getTelegramWebApp()?.initData) {
        try {
          const response = await telegramFetch("/api/auth/profile", {
            cache: "no-store",
          })
          const payload = (await response.json()) as {
            data?: { user?: { onboardingCompleted?: boolean } }
          }
          if (!response.ok || !payload.data?.user) {
            throw new Error("profile_failed")
          }
          if (cancelled) return
          const onboardingCompleted = Boolean(
            payload.data.user.onboardingCompleted
          )
          if (!onboardingCompleted) {
            clearLearnerClientState()
            removeTelegramCloudFlag("onboarding_complete")
            removeTelegramCloudFlag("home_screen_prompted")
          }
          setSession({ onboardingCompleted })
        } catch {
          if (!cancelled) {
            setSession({
              onboardingCompleted:
                window.localStorage.getItem(
                  "okey-english:onboarding-complete"
                ) === "1",
            })
          }
        }
        return
      }
      try {
        const response = await telegramFetch("/api/auth/web/session", {
          cache: "no-store",
        })
        if (cancelled) return
        if (response.ok) {
          const payload = (await response.json()) as {
            data?: { user?: { onboardingCompleted?: boolean } }
          }
          setSession({
            onboardingCompleted: Boolean(
              payload.data?.user?.onboardingCompleted
            ),
          })
          return
        }
        if (process.env.NODE_ENV !== "production") {
          setSession({
            onboardingCompleted:
              window.localStorage.getItem(
                "okey-english:onboarding-complete"
              ) === "1",
          })
          return
        }
      } catch {
        if (cancelled) return
      }
      router.replace("/login")
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [router])

  if (!session) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-5 pt-12 sm:px-8 lg:px-10">
        <div className="h-12 w-56 animate-pulse rounded-2xl bg-muted" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-48 animate-pulse rounded-[24px] bg-muted"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <PersonalAreaSessionContext.Provider value={session}>
      {children}
    </PersonalAreaSessionContext.Provider>
  )
}

export function usePersonalAreaSession() {
  return React.useContext(PersonalAreaSessionContext)
}
