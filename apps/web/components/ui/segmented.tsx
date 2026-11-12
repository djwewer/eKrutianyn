"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type SegmentedOption<T> = { value: T; label: React.ReactNode }

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

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = options.length - 1
    let next: number
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = index === last ? 0 : index + 1
        break
      case "ArrowLeft":
      case "ArrowUp":
        next = index === 0 ? last : index - 1
        break
      case "Home":
        next = 0
        break
      case "End":
        next = last
        break
      default:
        return
    }
    e.preventDefault()
    onChange(options[next].value)
    refs.current[next]?.focus()
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
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "cursor-pointer border-0 px-[.8rem] py-[.4rem] font-display text-[.78rem] font-semibold tracking-[.06em] uppercase [&+button]:border-l-2 [&+button]:border-line",
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
