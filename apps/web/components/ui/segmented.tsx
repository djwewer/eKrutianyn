"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type SegmentedOption<T> = { value: T; label: React.ReactNode; disabled?: boolean }

// Single-select segmented control following the WAI-ARIA radio group pattern:
// the checked radio is the only tab stop; arrows/Home/End move and select.
function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])

  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0)
  const checkedIndex = options.findIndex((o) => o.value === value)
  // Tab stop: the checked option, or the first enabled one when nothing matches.
  const tabStop = checkedIndex >= 0 && !options[checkedIndex].disabled ? checkedIndex : (enabled[0] ?? -1)

  function select(index: number) {
    if (options[index].value !== value) onChange(options[index].value)
    refs.current[index]?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (enabled.length === 0) return
    const pos = enabled.indexOf(index)
    let next: number
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = enabled[(pos + 1) % enabled.length]
        break
      case "ArrowLeft":
      case "ArrowUp":
        next = enabled[(pos - 1 + enabled.length) % enabled.length]
        break
      case "Home":
        next = enabled[0]
        break
      case "End":
        next = enabled[enabled.length - 1]
        break
      default:
        return
    }
    e.preventDefault()
    select(next)
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-slot="segmented"
      className={cn(
        "inline-flex max-w-full flex-wrap overflow-hidden rounded-[4px] border-2 border-line",
        className,
      )}
    >
      {options.map((option, i) => {
        const on = option.value === value
        return (
          <button
            key={String(option.value)}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={option.disabled}
            onClick={() => select(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "cursor-pointer focus-visible:outline-offset-[-3px] disabled:cursor-not-allowed disabled:opacity-50 border-0 px-[.8rem] py-[.4rem] font-display text-[.78rem] font-semibold tracking-[.06em] uppercase [&+button]:border-l-2 [&+button]:border-line",
              on ? "bg-navy text-navy-ink" : "bg-paper text-ink",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export { Segmented }
export type { SegmentedOption }
