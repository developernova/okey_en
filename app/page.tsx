import Script from "next/script"

import { WordflowApp } from "@/components/wordflow-app"

export default function Page() {
  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      <WordflowApp />
    </>
  )
}
