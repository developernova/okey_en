"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type AutoResizeTextareaProps = React.ComponentProps<"textarea"> & {
  maxHeight?: number
}

export function AutoResizeTextarea({
  className,
  maxHeight = 168,
  onChange,
  value,
  ...props
}: AutoResizeTextareaProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  const resize = React.useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = "auto"
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden"
  }, [maxHeight])

  React.useLayoutEffect(() => {
    resize()
  }, [resize, value])

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      value={value}
      onChange={(event) => {
        onChange?.(event)
        resize()
      }}
      className={cn("resize-none overflow-y-hidden", className)}
      {...props}
    />
  )
}
