import * as React from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"

function PageHeader({
  title,
  subtitle,
  crumb,
  actions,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  crumb?: { href: string; label: string }
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="page-header"
      className={cn("mb-[1.2rem] flex flex-wrap items-end gap-4", className)}
    >
      <div className="min-w-48 flex-1">
        {crumb && (
          <Link
            href={crumb.href}
            className="mb-[.3rem] inline-block font-mono text-[.74rem] tracking-[.04em] text-ink-2 no-underline"
          >
            ← {crumb.label.toUpperCase()}
          </Link>
        )}
        <h1 className="m-0 font-display text-[1.6rem] leading-[1.05] font-bold tracking-[.02em] uppercase min-[760px]:text-[1.9rem]">
          {title}
        </h1>
        {subtitle && <p className="mt-[.3rem] mb-0 text-[.95rem] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  )
}

export { PageHeader }
