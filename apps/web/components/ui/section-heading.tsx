import * as React from "react"

import { cn } from "@/lib/utils"

function SectionHeading({
  children,
  as: Tag = "h2",
  className,
}: {
  children: React.ReactNode
  as?: React.ElementType
  className?: string
}) {
  return (
    <Tag
      data-slot="section-heading"
      className={cn(
        "mt-8 mb-[.8rem] flex items-center gap-[.7rem] font-display text-[.82rem] font-semibold tracking-[.12em] text-ink-2 uppercase first:mt-0 after:h-0.5 after:flex-1 after:[background:repeating-linear-gradient(90deg,var(--line)_0_6px,transparent_6px_10px)] after:content-['']",
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export { SectionHeading }
