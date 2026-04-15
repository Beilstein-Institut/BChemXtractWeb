import { useEffect, useRef } from "react"
import { animate } from "motion/react"
import { cn } from "@/lib/utils"

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*"

interface TextScrambleProps {
  text: string
  className?: string
  duration?: number
  trigger?: boolean
}

export function TextScramble({
  text,
  className,
  duration = 0.8,
  trigger = true,
}: TextScrambleProps) {
  const elRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!trigger) return
    const el = elRef.current
    if (!el) return

    let frame = 0
    const totalFrames = Math.floor(duration * 60)

    const controls = animate(0, totalFrames, {
      duration,
      ease: "easeOut",
      onUpdate(latest) {
        frame = Math.floor(latest)
        const progress = frame / totalFrames
        el.textContent = text
          .split("")
          .map((char, i) => {
            if (i < Math.floor(progress * text.length)) return char
            return CHARS[Math.floor(Math.random() * CHARS.length)]
          })
          .join("")
      },
      onComplete() {
        if (el) el.textContent = text
      },
    })

    return () => controls.stop()
  }, [text, duration, trigger])

  return (
    <span ref={elRef} className={cn(className)} aria-label={text}>
      {text}
    </span>
  )
}
