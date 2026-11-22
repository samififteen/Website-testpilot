import { useEffect, useRef, useState } from 'react'

interface AnimatedNumberProps {
  value: number
  durationMs?: number
  decimals?: number
  className?: string
  suffix?: string
}

/**
 * Tabular metric that eases to a new value when it changes (ReactBits-style
 * counter without the dependency). The first render is always the real value so
 * data never appears to start from zero.
 */
export function AnimatedNumber({
  value,
  durationMs = 650,
  decimals = 0,
  className,
  suffix,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    if (from === value) {
      setDisplay(value)
      return
    }
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setDisplay(value)
      fromRef.current = value
      return
    }

    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      const eased = 1 - (1 - progress) ** 3
      setDisplay(from + (value - from) * eased)
      if (progress < 1) frame = requestAnimationFrame(step)
      else fromRef.current = value
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, durationMs])

  return (
    <span className={className}>
      {display.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  )
}
